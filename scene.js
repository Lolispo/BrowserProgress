// Author Petter Andersson
"use strict"

// ===========================================================================
// The world: the game's simulation of the village. Entities (buildings,
// villagers, trees), the tile grid they live on, the manual-task state machine,
// movement, hunger/energy upkeep and the job assignment — everything that is
// true about the village regardless of how it is drawn.
//
// It owns NO pixels. There is no canvas, no image, no colour here. A renderer
// (see render2d.js / render3d.js) is handed this object every frame and decides
// how to show it; swapping renderers swaps the graphics and nothing else. The
// seam is deliberately narrow:
//
//   world  -> renderer : Renderer.frame(scene, dt, now) once per frame
//   input  -> world    : Renderer.pick(clientX, clientY) -> villager | null
//
// The rest of the game owns `state` and pushes entities in here (addBuilding /
// addVillager from the shop registry) and reads effects out (floaters). Every
// position below is in world units on the fixed WORLD_W x WORLD_H plane; it is
// the renderer's job to map that onto whatever it is drawing into.
// ===========================================================================

var SPRITE_SCALE = 2;            // sprites are ~20px; 2x reads as a real village
var SPRITE_PX = 20 * SPRITE_SCALE;

// The world is a fixed 1150x460 coordinate space; every entity position, tile and
// effect below is in world units. What the player actually sees — element size,
// zoom, pan, and in 3D which way is "up" — belongs to the renderer.
var WORLD_W = 1150, WORLD_H = 460;

// The active renderer, installed by script.js at startup (see pickRenderer).
// Left null the world still simulates correctly; it just draws nothing.
var Renderer = null;

var scene = {
	W: 0, H: 0,
	buildings: [], villagers: [], trees: [], floaters: [], particles: [],
	lastTime: 0, running: false,
	selected: null, // villager shown in the inspect panel (see ui.js)

	// Bumped whenever the static world changes shape (a building lands, a region
	// is claimed). Renderers that cache geometry watch this instead of rebuilding
	// their terrain every frame.
	version: 0,

	treeLane: 4, // y of the forest strip in Home

	// Tile grid: columns/rows over the fixed world; tile size derived in init.
	COLS: 30,
	ROWS: 12,
	ROAD_ROW: 6, // the road runs along this tile row

	// Home resource-area anchors (villagers walk here for Mine / Hunt).
	homeMine: { col: 1, row: 4 }, // rock/ore mining area (left)
	homeHunt: { col: 7, row: 4 }, // hunting grounds (right)

	// Per building type: which region it sits in, its vertical lane (y), and a
	// horizontal offset within that region's zone. New Phase 3 buildings live in
	// the regions their resource comes from.
	// Building placement in tile coords: region + a plot row (above/below the
	// road row 4; row 0 is the forest) + a starting column within the region.
	// Rows: forest 0-1, mine/hunt areas 3-5, road 6, home buildings 7-10.
	buildingConfig: {
		house:        { region: "home",      row: 7, col: 1 },
		lumberMill:   { region: "home",      row: 7, col: 4 },
		mine:         { region: "home",      row: 8, col: 2 },
		huntingLodge: { region: "home",      row: 8, col: 6 },
		trainingYard: { region: "home",      row: 9, col: 4 },
		quarry:       { region: "hills",     row: 3, col: 1 },
		farm:         { region: "hills",     row: 4, col: 3 },
		blacksmith:   { region: "hills",     row: 8, col: 1 },
		market:       { region: "mountains", row: 4, col: 1 },
		monument:     { region: "cavern",    row: 5, col: 3 },
	},

	// Pixel [x0, x1] of a region's zone from its width fractions.
	zonePx: function(region){
		var z = REGIONS[region].zone;
		return [z[0] * this.W, z[1] * this.W];
	},

	init: function(){
		this.W = WORLD_W;
		this.H = WORLD_H;
		// Villager footprint in world units — the one body size the sim needs
		// constantly (door spots, job slots, drop-offs, the idle wander bounds).
		var vf = this.footprint("villager");
		this.VW = vf.w;
		this.VH = vf.h;
		// Tile grid: fill the world exactly (tiles may be slightly non-square).
		this.tileW = this.W / this.COLS;
		this.tileH = this.H / this.ROWS;
		this.regionCols = {};
		for(var i = 0; i < REGION_ORDER.length; i++){
			var z = REGIONS[REGION_ORDER[i]].zone;
			this.regionCols[REGION_ORDER[i]] = [Math.round(z[0] * this.COLS), Math.round(z[1] * this.COLS)];
		}
		this.buildings = [];
		this.villagers = [];
		this.floaters = [];
		this.particles = [];
		this.version++;
		this.buildTreeRow();
	},

	// A forest across Home's top tile row (wood comes from Home), one tree per cell.
	buildTreeRow: function(){
		this.trees = [];
		var rc = this.regionCols.home;
		for(var row = 0; row <= 1; row++){
			for(var col = rc[0]; col < rc[1]; col++){
				this.trees.push({ col: col, row: row, growth: 1, phase: (this.tileHash(col, row) % 628) / 100 });
			}
		}
	},

	// --- geometry helpers --------------------------------------------------

	// A sprite's footprint in world units, from its DECLARED size in the manifest
	// (see data/assets.js). Declared, not measured, so layout never waits on an
	// image to decode — and so a renderer that draws no images at all still gets
	// the same village shape.
	footprint: function(key){
		var s = (typeof SPRITES !== "undefined") && SPRITES[key];
		return { w: ((s && s.w) || 20) * SPRITE_SCALE, h: ((s && s.h) || 20) * SPRITE_SCALE };
	},

	firstBuilding: function(type){
		for(var i = 0; i < this.buildings.length; i++){
			if(this.buildings[i].type === type){ return this.buildings[i]; }
		}
		return null;
	},

	// Deterministic per-tile hash (stable across frames, no shimmer). Lives here
	// rather than in a renderer so every renderer jitters the same tiles alike.
	tileHash: function(col, row){ var h = (col * 73856093) ^ (row * 19349663); return h >>> 0; },

	regionAtCol: function(col){
		for(var i = 0; i < REGION_ORDER.length; i++){
			var rc = this.regionCols[REGION_ORDER[i]];
			if(col >= rc[0] && col < rc[1]){ return REGION_ORDER[i]; }
		}
		return REGION_ORDER[REGION_ORDER.length - 1];
	},

	// --- entity creation (called from the registry) -----------------------

	addBuilding: function(type, opts){
		var f = this.footprint(type);
		this.buildings.push({
			type: type,
			w: f.w, h: f.h, // world footprint, from the manifest
			x: 0, y: 0,     // set by layoutBuildings
			phase: Math.random() * 6.28,
			// When they joined. Renderers use it for an arrival flourish; suppressed
			// on load (animate:false) so a restored village doesn't all pop at once,
			// exactly as addBuilding does.
			bornAt: (opts && opts.animate === false) ? -1 : this.lastTime / 1000,
			// Birth time drives a one-shot spawn-pop (see the renderers). Suppressed
			// on load (animate:false) so a restored village doesn't pop all at once.
			bornAt: (opts && opts.animate === false) ? -1 : this.lastTime / 1000,
		});
		this.layoutBuildings();
		// A new house shifts the base-zone layout, so re-anchor existing villagers.
		if(type === "house"){ this.assignHomes(); }
		this.version++;
	},

	// Snap each building onto a tile cell, using an occupancy set so two buildings
	// never share a cell: start at the type's preferred (row, col) within its region
	// and scan right-then-down for the first free cell.
	layoutBuildings: function(){
		var taken = {};
		for(var i = 0; i < this.buildings.length; i++){
			var b = this.buildings[i];
			var cfg = this.buildingConfig[b.type] || { region: "home", row: 8, col: 0 };
			var rc = this.regionCols[cfg.region];
			var col = rc[0] + cfg.col, row = cfg.row, placed = false;
			for(var row2 = cfg.row; row2 < this.ROWS && !placed; row2++){
				for(var col2 = (row2 === cfg.row ? rc[0] + cfg.col : rc[0]); col2 < rc[1] && !placed; col2++){
					if(!taken[col2 + "," + row2]){ col = col2; row = row2; placed = true; }
				}
			}
			taken[col + "," + row] = true;
			b.col = col; b.row = row;
			b.x = col * this.tileW + (this.tileW - b.w) / 2;
			b.y = row * this.tileH + (this.tileH - b.h);
		}
	},

	// Claim a region: mark it unlocked and reveal its resource label. Called by
	// the scout on completion (Phase 3b); safe to call directly for testing.
	revealRegion: function(id){
		state.regions[id] = true;
		var res = REGIONS[id].resource;
		var labels = { stone: "resStone", gold: "resGold", crystal: "resCrystal" };
		if(res && labels[res]){ $("#" + labels[res]).toggleClass("hidden", false); }
		this.version++; // road extends + fog lifts: renderers rebuild their terrain
	},

	addVillager: function(data, opts){
		data = data || {}; // restored per-villager fields on load (see villagerData)
		var rc = this.regionCols.home;
		var hx = (rc[0] + Math.random() * (rc[1] - rc[0])) * this.tileW;
		var hy = (this.ROWS - 1.3) * this.tileH; // home band below the road
		this.villagers.push({
			x: hx,
			y: hy,
			tx: hx,
			ty: hy,
			home: { x: hx, y: hy }, // anchor for the idle wander
			rest: Math.random() * 3,        // seconds to stand still before drifting
			jobTarget: null,
			working: false,
			moving: false,     // walking this frame (drives the step-bob in the renderer)
			phase: Math.random() * 6.28,
			// When they joined. Renderers use it for an arrival flourish; suppressed
			// on load (animate:false) so a restored village doesn't all pop at once,
			// exactly as addBuilding does.
			bornAt: (opts && opts.animate === false) ? -1 : this.lastTime / 1000,
			speed: 150 + Math.random() * 45, // movement px/s (NOT the trained speed stat below); 1.5x the old base so early game isn't a crawl
			// Per-villager progression, persisted via state.villagerData: trained stats
			// + energy + hunger. Restored from `data` on load, else fresh defaults.
			stats: { speed: data.speed || 100, strength: data.strength || 100, cardio: data.cardio || 100 },
			energy: data.energy === undefined ? 100 : data.energy,
			hunger: data.hunger === undefined ? 100 : data.hunger,
			// Manual-task state (A1): a free villager dispatched to an action.
			busy: false,       // running a manual action
			task: null,        // action id
			taskPhase: null,   // "walk" | "work" | "return"
			taskTarget: null,  // {x,y} to walk to
			progress: 0,       // 0..1 while working
			workDur: 1000,     // ms of the work phase
			tool: null,        // reserved tool object for this task (A3)
			dropResource: null, dropAmount: 0, // resource carried to a drop-off
		});
		this.syncJobs();
		// Anchor every villager to a house (their base zone), then spawn the new one
		// at its doorstep instead of the old bottom-of-map band.
		this.assignHomes();
		var nv = this.villagers[this.villagers.length - 1];
		nv.x = nv.tx = nv.home.x; nv.y = nv.ty = nv.home.y;
	},

	// Assign each villager a home house as its idle/return base. Villager i belongs
	// to house building (i mod houseCount), so the first villager keeps the starting
	// house and later hires cluster at their own; villagers beyond the built houses
	// wrap and share. A few per house fan out around the door so they don't stack.
	assignHomes: function(){
		var houses = this.buildings.filter(function(b){ return b.type === "house"; });
		if(!houses.length){ return; }
		var perHouse = {};
		for(var i = 0; i < this.villagers.length; i++){
			var hi = i % houses.length;
			var h = houses[hi];
			var n = perHouse[hi] | 0; perHouse[hi] = n + 1;
			var hx = h.x + (h.w - this.VH) / 2 + ((n % 3) - 1) * 12;
			var hy = h.y + h.h - this.VH + 6 + Math.floor(n / 3) * 9;
			this.villagers[i].home = { x: hx, y: hy };
		}
	},

	// The most-rested free villager (unemployed + not busy). Used for work dispatch.
	freeVillager: function(){
		var best = null;
		for(var i = 0; i < this.villagers.length; i++){
			var v = this.villagers[i];
			if(!v.jobTarget && !v.busy && (!best || v.energy > best.energy)){ best = v; }
		}
		return best;
	},

	// The most-tired free villager. Used by Sleep.
	tiredestFreeVillager: function(){
		var worst = null;
		for(var i = 0; i < this.villagers.length; i++){
			var v = this.villagers[i];
			if(!v.jobTarget && !v.busy && (!worst || v.energy < worst.energy)){ worst = v; }
		}
		return worst;
	},

	homeSpot: function(col, row){ return { x: col * this.tileW, y: row * this.tileH }; },

	// Where a villager walks to perform an action.
	actionTarget: function(id){
		var b;
		if(id === "chopWood" || id === "clawTree"){
			var grown = this.trees.filter(function(t){ return t.growth > 0.4; });
			var t = grown.length ? grown[Math.floor(Math.random() * grown.length)] : this.trees[0];
			if(t){ return { x: t.col * this.tileW, y: Math.max(2, (t.row + 1) * this.tileH - this.VH) }; }
		}
		if(id === "mineIron"){ return this.homeSpot(this.homeMine.col, this.homeMine.row); }
		if(id === "hunt"){ return this.homeSpot(this.homeHunt.col, this.homeHunt.row); }
		if(id === "trainSpeed" || id === "trainStrength" || id === "trainCardio"){
			b = this.firstBuilding("trainingYard"); if(b){ return { x: b.x, y: b.y }; }
		}
		if(id === "mineCrystal"){ var rc = this.regionCols.cavern; return this.homeSpot(rc[0] + 2, 3); }
		return this.homeSpot(4, 5);
	},

	// Assign a free villager to an action.
	startTask: function(v, id){
		var a = ACTIONS[id];
		v.busy = true;
		v.task = id;
		v.taskPhase = "walk";
		v.progress = 0;
		var base = (a.rawTime ? a.maxTime(v.stats.speed) : a.maxTime(v.stats.speed) * speedRatio) * timeScale;
		// Tired = slower: 100 energy -> x1, 0 energy -> x2. Sleep isn't slowed by tiredness.
		var tiredFactor = (id === "sleep") ? 1 : (2 - v.energy / 100);
		v.workDur = base * tiredFactor;
		v.taskTarget = (id === "sleep") ? { x: v.home.x, y: v.home.y } : this.actionTarget(id);
		// Reserve a tool for the run (one tool per worker); freed on completion.
		v.tool = null;
		if(a.tool){
			var t = (a.tool === "axe") ? freeAxe() : freeSpear();
			if(t){ t.inUse = true; v.tool = t; }
		}
	},

	// Apply an action's effect on work completion, wear the reserved tool (broken
	// ones are dropped here), drain (or restore) the acting villager's energy, then
	// head home. A surviving tool stays in-hand and is only freed once carried back.
	completeTask: function(v){
		var a = ACTIONS[v.task];
		var res = a.yields || null;
		var before = res ? state[res] : 0;
		if(a.onDone){ a.onDone(v); }
		// Carry whatever was actually gained to the drop-off (floated on arrival).
		v.dropResource = (res && state[res] - before > 0) ? res : null;
		v.dropAmount = res ? state[res] - before : 0;
		if(v.tool){
			v.tool.dur -= equipDamage(a.toolDmg || 0);
			if(v.tool.dur <= 0){
				// Broke mid-work: remove it now — there's nothing to carry back.
				var arr = (a.tool === "axe") ? state.axes : state.spears;
				var idx = arr.indexOf(v.tool);
				if(idx >= 0){ arr.splice(idx, 1); }
				newMsg((a.tool === "axe" ? "An axe" : "A spear") + " broke!");
				v.tool = null;
				if(typeof updateToolDisplay === "function"){ updateToolDisplay(); }
			}
			// A surviving tool stays reserved (inUse) — still in the villager's hands
			// until walked home; freed at the end of the return leg (see updateTask).
		}
		var cost = a.energyCost || 0;
		v.energy = Math.max(0, Math.min(100, v.energy - cost)); // negative cost restores
		v.taskPhase = "return";
		v.progress = 1;
	},

	// Call a villager off a manual action. Nothing has been granted or spent yet
	// during walk/work — actions have no onStart cost, and the yield, tool wear
	// and energy cost all land together in completeTask — so an abort is clean:
	// release the reserved tool unworn and send them home empty-handed.
	//
	// The "return" leg is deliberately NOT cancellable: by then the work is done
	// and the reward is already banked, so there's nothing to call off; they're
	// just carrying it to the drop-off.
	cancelTask: function(v){
		if(!this.canCancel(v)){ return false; }
		if(v.tool){
			v.tool.inUse = false;
			v.tool = null;
			if(typeof updateToolDisplay === "function"){ updateToolDisplay(); }
		}
		v.busy = false; v.task = null; v.taskPhase = null;
		v.progress = 0; v.working = false;
		v.dropResource = null; v.dropAmount = 0;
		// Point them home; without this they'd keep walking to the abandoned task
		// target first (the idle wander only re-targets once they've arrived).
		v.tx = v.home.x; v.ty = v.home.y; v.rest = 0;
		return true;
	},

	canCancel: function(v){ return !!v && v.busy && v.taskPhase !== "return"; },

	// A villager currently cancellable on this action, preferring one still
	// walking there (least work thrown away). Used by the action-bar cancel.
	villagerOnTask: function(id){
		var working = null;
		for(var i = 0; i < this.villagers.length; i++){
			var v = this.villagers[i];
			if(v.task !== id || !this.canCancel(v)){ continue; }
			if(v.taskPhase === "walk"){ return v; }
			if(!working){ working = v; }
		}
		return working;
	},

	// Move a villager toward its (tx,ty); returns true on arrival. Dev speed
	// (timeScale < 1) speeds up walking too, so fast-forward affects the whole loop.
	moveToward: function(v, dt){
		var dx = v.tx - v.x, dy = v.ty - v.y;
		var dist = Math.sqrt(dx * dx + dy * dy);
		// Tired OR hungry = slower walking: the worse of energy/hunger scales speed
		// from full down to a 30% floor at empty (they don't compound below 30%).
		var vitality = Math.min(v.energy, v.hunger);
		var eFactor = 0.3 + 0.7 * (vitality / 100);
		var step = v.speed * eFactor * dt / timeScale;
		if(dist > step){ v.x += (dx / dist) * step; v.y += (dy / dist) * step; v.moving = true; return false; }
		v.x = v.tx; v.y = v.ty; v.moving = false; return true;
	},

	// Drive a busy villager through walk -> work -> return.
	updateTask: function(v, dt){
		if(v.taskPhase === "walk"){
			v.tx = v.taskTarget.x; v.ty = v.taskTarget.y;
			v.working = false;
			if(this.moveToward(v, dt)){
				v.taskPhase = "work";
				v.progress = 0;
				if(ACTIONS[v.task].onStart){ ACTIONS[v.task].onStart(v); } // pay cost on arrival
			}
		} else if(v.taskPhase === "work"){
			v.working = true;
			v.progress += (dt * 1000) / Math.max(1, v.workDur);
			if(v.progress >= 1){ this.completeTask(v); }
		} else if(v.taskPhase === "return"){
			// Carry the harvest to its drop-off: the resource's building if built,
			// else home. The "+N" pops where it's deposited.
			var dest = v.home;
			if(v.dropResource){
				var bt = this.dropBuilding[v.dropResource];
				var bld = bt ? this.firstBuilding(bt) : null;
				if(bld){ dest = { x: bld.x, y: bld.y + bld.h - this.VH }; }
			}
			v.tx = dest.x; v.ty = dest.y;
			v.working = false;
			if(this.moveToward(v, dt)){
				if(v.dropResource){
					this.floater("+" + v.dropAmount + " " + v.dropResource, v.x, v.y - 6, this.resColor(v.dropResource));
					v.dropResource = null;
				}
				// Back home: only now is the carried tool freed for the next worker.
					if(v.tool){ v.tool.inUse = false; v.tool = null; if(typeof updateToolDisplay === "function"){ updateToolDisplay(); } }
					v.busy = false; v.task = null; v.taskPhase = null;
			}
		}
	},

	// Rebuild all entities from state counts (used on load).
	rebuildFromState: function(){
		this.buildings = [];
		this.villagers = [];
		this.addBuilding("house", { animate: false }); // starting dwelling, always present (matches fresh-game init)
		var counts = {
			house: state.housesBuilt, lumberMill: state.lumberMill, mine: state.mine,
			huntingLodge: state.huntingLodge, trainingYard: state.trainingYard,
			quarry: state.quarry, farm: state.farm, blacksmith: state.blacksmith,
			market: state.market, monument: state.monument,
		};
		for(var type in counts){
			for(var i = 0; i < counts[type]; i++){ this.addBuilding(type, { animate: false }); }
		}
		var saved = state.villagerData || [];
		for(var v = 0; v < state.villagers; v++){ this.addVillager(saved[v], { animate: false }); }
		this.syncJobs();
		this.version++;
	},

	// Reconcile each villager's workplace to the current job counts in state.
	// Each employed villager also gets a slot index so co-workers at the same
	// building line up side by side instead of stacking on one spot.
	syncJobs: function(){
		var order = [];
		var push = function(type, n){ for(var i = 0; i < n; i++){ order.push(type); } };
		push("lumberMill", state.woodCutter);
		push("mine", state.ironWorker);
		push("huntingLodge", state.hunter);
		push("quarry", state.mason);
		push("market", state.trader);
		var slots = {};
		for(var v = 0; v < this.villagers.length; v++){
			var t = order[v] || null;
			this.villagers[v].jobTarget = t;
			if(t){ var s = slots[t] | 0; this.villagers[v].slot = s; slots[t] = s + 1; }
			else { this.villagers[v].slot = 0; }
		}
	},

	// Per-villager save payload: the persistent progression fields (trained stats
	// + energy/hunger). Consumed by saveGame -> state.villagerData; restored by
	// addVillager(data) in rebuildFromState. Job/slot are re-derived by syncJobs.
	dumpVillagers: function(){
		var out = [];
		for(var i = 0; i < this.villagers.length; i++){
			var v = this.villagers[i];
			out.push({
				speed: v.stats.speed, strength: v.stats.strength, cardio: v.stats.cardio,
				energy: v.energy, hunger: v.hunger,
			});
		}
		return out;
	},

	// --- effects -----------------------------------------------------------
	//
	// Effects are world facts with a position and a lifetime, not drawing calls.
	// The world spawns and ages them; each renderer shows them its own way (2D
	// paints text on the canvas, 3D billboards a sprite at the same spot).

	FLOATER_LIFE: 1.3,

	floater: function(text, x, y, color){
		this.floaters.push({ text: text, x: x, y: y, life: this.FLOATER_LIFE, color: color || "#fff" });
	},

	// Deplete a grown tree (visual) when wood is gathered. The "+N" floater is
	// shown later at the drop-off, not here (see the carry leg in updateTask).
	chopTree: function(){
		var grown = this.trees.filter(function(t){ return t.growth > 0.5; });
		var t = grown.length ? grown[Math.floor(Math.random() * grown.length)] : this.trees[0];
		if(t){ t.growth = 0.12; }
	},

	// Where a villager drops a gathered resource: the resource's building if built,
	// else the villager's home.
	dropBuilding: { wood: "lumberMill", iron: "mine", food: "huntingLodge" },
	resColor: function(res){
		return { wood: "#2e7d32", iron: "#607d8b", food: "#c76b28", stone: "#6d6d6d", gold: "#c9a227", crystal: "#9b6dc9" }[res] || "#fff";
	},

	// Generic resource gain: float over the relevant building, or top-left.
	gainFx: function(resource, amount){
		var homes = { iron: "mine", food: "huntingLodge", wood: "lumberMill", stone: "quarry", gold: "market", crystal: "monument" };
		var b = this.firstBuilding(homes[resource]);
		var x = b ? b.x : this.W * 0.12;
		var y = b ? b.y : 30;
		this.floater("+" + amount + " " + resource, x, y, this.resColor(resource));
	},

	// --- loop --------------------------------------------------------------
	//
	// The world drives the frame: simulate, then hand itself to whatever renderer
	// is installed. A missing renderer is not an error — the village keeps living,
	// it is simply not on screen.

	start: function(){
		if(this.running){ return; }
		this.running = true;
		var self = this;
		requestAnimationFrame(function loop(ts){
			if(!self.lastTime){ self.lastTime = ts; }
			var dt = Math.min((ts - self.lastTime) / 1000, 0.1);
			self.lastTime = ts;
			self.update(dt, ts / 1000);
			if(Renderer){ Renderer.frame(self, dt, ts / 1000); }
			requestAnimationFrame(loop);
		});
	},

	update: function(dt, now){
		var i;
		// Refresh action-bar availability shading ~4x/sec (not every frame).
		this._uiT = (this._uiT || 0) + dt;
		if(this._uiT > 0.25){
			this._uiT = 0;
			if(typeof refreshBarStates === "function"){ refreshBarStates(); }
		}
		// Trees regrow toward full.
		for(i = 0; i < this.trees.length; i++){
			if(this.trees[i].growth < 1){
				this.trees[i].growth = Math.min(1, this.trees[i].growth + dt * 0.12);
			}
		}
		// Villagers walk to their workplace (or wander when unemployed).
		for(i = 0; i < this.villagers.length; i++){
			this.updateVillager(this.villagers[i], dt);
		}
		// Floaters age out. Note what does NOT happen here: they don't move. A
		// floater is a place, a message and a remaining lifetime; how it travels
		// is the renderer's business — 2D drifts it up the screen, 3D lifts it
		// into the air. Baking one of those in would have the other applying its
		// own motion on top of it.
		for(i = this.floaters.length - 1; i >= 0; i--){
			// Game time, like everything else. Income SPAWNS these on a game-time
			// interval, so ageing them in real seconds meant fast-forward created
			// them ~100x faster than they expired: a soak at 100x reached ~290 live
			// floaters (and, in 3D, one canvas texture each) and climbing.
			this.floaters[i].life -= dt / timeScale;
			if(this.floaters[i].life <= 0){ this.floaters.splice(i, 1); }
		}
		Atmosphere.updateParticles(this, dt);
	},

	// Per-villager food upkeep: hunger drains over time; when peckish and the
	// village has food, the villager eats a meal (consumes food, restores hunger).
	// Empty food -> hunger sits low -> slower movement (see moveToward), never blocked.
	feed: function(v, dt){
		// Work drives hunger: on a manual task or employed at a job burns it fast,
		// standing idle barely at all — so food tracks activity, not just elapsed time.
		var working = v.busy || v.jobTarget;
		v.hunger = Math.max(0, v.hunger - (working ? hungerDrainWork : hungerDrainIdle) * dt);
		if(v.hunger < hungerEatAt && state.food >= foodPerMeal){
			set("food", state.food - foodPerMeal);
			v.hunger = Math.min(100, v.hunger + hungerPerMeal);
		}
	},

	updateVillager: function(v, dt){
		// Dev fast-forward stretches game time, and upkeep has to stretch with it.
		// Task durations, income and walking already divide by timeScale; hunger and
		// energy did not, so at 100x villagers got rich without ever getting hungry
		// and the late game you were validating wasn't the one players would meet.
		// At the normal speed (timeScale 1) this is exactly dt, as before.
		var gdt = dt / timeScale;
		this.feed(v, gdt); // all villagers eat, whatever they're doing
		if(v.busy){ this.updateTask(v, dt); return; } // running a manual action
		// Idle/unemployed villagers recover energy; rate scales with the villager's cardio.
		if(!v.jobTarget && v.energy < 100){
			v.energy = Math.min(100, v.energy + (3 + v.stats.cardio / 50) * gdt);
		}
		if(v.jobTarget){
			var b = this.firstBuilding(v.jobTarget);
			if(b){
				// Line workers up beside the building; wrap every 4 into a second row.
				var slot = v.slot || 0;
				v.tx = Math.min(this.W - this.VW, b.x + 4 + (slot % 4) * 12);
				v.ty = b.y + b.h - this.VH + 2 + Math.floor(slot / 4) * 10;
			}
			v.working = this.moveToward(v, dt);
			return;
		}
		// Unemployed: gentle wander. Stand still a few seconds, then drift within a
		// small radius of home.
		if(Math.abs(v.x - v.tx) < 2 && Math.abs(v.y - v.ty) < 2){
			v.rest -= dt;
			if(v.rest <= 0){
				v.tx = Math.max(4, Math.min(this.W - 40, v.home.x + (Math.random() * 2 - 1) * 22));
				v.ty = v.home.y + (Math.random() * 2 - 1) * 12;
				v.rest = 2.5 + Math.random() * 3.5;
			}
		}
		this.moveToward(v, dt);
		v.working = false;
	},
};
