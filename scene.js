// Author Petter Andersson
"use strict"

// ===========================================================================
// Animated scene: a requestAnimationFrame render loop over a small scene graph.
//
// The rest of the game owns state; the scene owns what the canvas shows. Shop
// purchases push entities (scene.addBuilding / scene.addVillager) instead of
// drawing once, and actions/income spawn effects (scene.chopWoodFx / gainFx).
// Every frame clears and redraws, so late-loading sprite images just appear on
// the next frame (this also removes the old cold-load infinite-loop hazard).
// ===========================================================================

var SPRITE_SCALE = 2;            // sprites are ~20px; 2x reads as a real village
var SPRITE_PX = 20 * SPRITE_SCALE;

var scene = {
	canvas: null, ctx: null, W: 0, H: 0,
	buildings: [], villagers: [], trees: [], floaters: [],
	lastTime: 0, running: false,

	treeLane: 4, // y of the forest strip in Home

	// Tile grid: columns/rows over the fixed canvas; tile size derived in init.
	COLS: 30,
	ROWS: 12,
	ROAD_ROW: 6, // the road runs along this tile row

	// Home resource-area anchors (villagers walk here for Mine / Hunt).
	homeMine: { col: 1, row: 4 }, // rock/ore mining area (left)
	homeHunt: { col: 7, row: 4 }, // hunting grounds (right)
	terrainPalette: {
		home:      { base: "#3fbf3f" },
		hills:     { base: "#c9b37e", fleck: "#a58a5b" },
		mountains: { base: "#9aa0a6", fleck: "#7d838a" },
		cavern:    { base: "#4a3b63", fleck: "#5e4b7e" },
	},

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

	init: function(canvas, ctx){
		this.canvas = canvas;
		this.ctx = ctx;
		this.W = canvas.width;
		this.H = canvas.height;
		// Tile grid: fill the canvas exactly (tiles may be slightly non-square).
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

	// --- image + geometry helpers -----------------------------------------

	buildingImg: function(type){
		return {
			house: imgHouse, lumberMill: imgLumberMill, mine: imgMine,
			huntingLodge: imgHuntingLodge, trainingYard: imgTrainingYard,
		}[type];
	},

	firstBuilding: function(type){
		for(var i = 0; i < this.buildings.length; i++){
			if(this.buildings[i].type === type){ return this.buildings[i]; }
		}
		return null;
	},

	spriteW: function(img){ return (img && img.width ? img.width : 20) * SPRITE_SCALE; },
	spriteH: function(img){ return (img && img.height ? img.height : 20) * SPRITE_SCALE; },

	// --- entity creation (called from the registry) -----------------------

	addBuilding: function(type){
		this.buildings.push({
			type: type,
			img: this.buildingImg(type),
			x: 0, y: 0, // set by layoutBuildings
			phase: Math.random() * 6.28,
		});
		this.layoutBuildings();
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
			b.x = col * this.tileW + (this.tileW - this.spriteW(b.img)) / 2;
			b.y = row * this.tileH + (this.tileH - this.spriteH(b.img));
		}
	},

	// Claim a region: mark it unlocked and reveal its resource label. Called by
	// the scout on completion (Phase 3b); safe to call directly for testing.
	revealRegion: function(id){
		state.regions[id] = true;
		var res = REGIONS[id].resource;
		var labels = { stone: "resStone", gold: "resGold", crystal: "resCrystal" };
		if(res && labels[res]){ $("#" + labels[res]).toggleClass("hidden", false); }
	},

	addVillager: function(){
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
			phase: Math.random() * 6.28,
			speed: 62 + Math.random() * 26, // px/s — fast enough to cross the map to tasks
			energy: 100,       // per-villager (A2): drains with work, recovers idle
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
			if(t){ return { x: t.col * this.tileW, y: Math.max(2, (t.row + 1) * this.tileH - this.spriteH(imgVillager)) }; }
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
		var base = (a.rawTime ? a.maxTime() : a.maxTime() * speedRatio) * timeScale;
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

	// Apply an action's effect on work completion, wear + free the reserved tool,
	// drain (or restore) the acting villager's energy, then head home.
	completeTask: function(v){
		var a = ACTIONS[v.task];
		var res = a.yields || null;
		var before = res ? state[res] : 0;
		if(a.onDone){ a.onDone(); }
		// Carry whatever was actually gained to the drop-off (floated on arrival).
		v.dropResource = (res && state[res] - before > 0) ? res : null;
		v.dropAmount = res ? state[res] - before : 0;
		if(v.tool){
			v.tool.dur -= equipDamage(a.toolDmg || 0);
			v.tool.inUse = false;
			if(v.tool.dur <= 0){
				var arr = (a.tool === "axe") ? state.axes : state.spears;
				var idx = arr.indexOf(v.tool);
				if(idx >= 0){ arr.splice(idx, 1); }
				newMsg((a.tool === "axe" ? "An axe" : "A spear") + " broke!");
			}
			if(typeof updateToolDisplay === "function"){ updateToolDisplay(); }
			v.tool = null;
		}
		var cost = a.energyCost || 0;
		v.energy = Math.max(0, Math.min(100, v.energy - cost)); // negative cost restores
		v.taskPhase = "return";
		v.progress = 1;
	},

	// Move a villager toward its (tx,ty); returns true on arrival. Dev speed
	// (timeScale < 1) speeds up walking too, so fast-forward affects the whole loop.
	moveToward: function(v, dt){
		var dx = v.tx - v.x, dy = v.ty - v.y;
		var dist = Math.sqrt(dx * dx + dy * dy);
		var step = v.speed * dt / timeScale;
		if(dist > step){ v.x += (dx / dist) * step; v.y += (dy / dist) * step; return false; }
		v.x = v.tx; v.y = v.ty; return true;
	},

	// Drive a busy villager through walk -> work -> return.
	updateTask: function(v, dt){
		if(v.taskPhase === "walk"){
			v.tx = v.taskTarget.x; v.ty = v.taskTarget.y;
			v.working = false;
			if(this.moveToward(v, dt)){
				v.taskPhase = "work";
				v.progress = 0;
				if(ACTIONS[v.task].onStart){ ACTIONS[v.task].onStart(); } // pay cost on arrival
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
				if(bld){ dest = { x: bld.x, y: bld.y + this.spriteH(bld.img) - this.spriteH(imgVillager) }; }
			}
			v.tx = dest.x; v.ty = dest.y;
			v.working = false;
			if(this.moveToward(v, dt)){
				if(v.dropResource){
					this.floater("+" + v.dropAmount + " " + v.dropResource, v.x, v.y - 6, this.resColor(v.dropResource));
					v.dropResource = null;
				}
				v.busy = false; v.task = null; v.taskPhase = null;
			}
		}
	},

	// Rebuild all entities from state counts (used on load).
	rebuildFromState: function(){
		this.buildings = [];
		this.villagers = [];
		var counts = {
			house: state.housesBuilt, lumberMill: state.lumberMill, mine: state.mine,
			huntingLodge: state.huntingLodge, trainingYard: state.trainingYard,
			quarry: state.quarry, farm: state.farm, blacksmith: state.blacksmith,
			market: state.market, monument: state.monument,
		};
		for(var type in counts){
			for(var i = 0; i < counts[type]; i++){ this.addBuilding(type); }
		}
		for(var v = 0; v < state.villagers; v++){ this.addVillager(); }
		this.syncJobs();
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

	// --- effects -----------------------------------------------------------

	floater: function(text, x, y, color){
		this.floaters.push({ text: text, x: x, y: y, life: 1.3, color: color || "#fff" });
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
		var colors = { wood: "#2e7d32", iron: "#607d8b", food: "#c76b28", stone: "#6d6d6d", gold: "#c9a227", crystal: "#9b6dc9" };
		var homes = { iron: "mine", food: "huntingLodge", wood: "lumberMill", stone: "quarry", gold: "market", crystal: "monument" };
		var b = this.firstBuilding(homes[resource]);
		var x = b ? b.x : this.W * 0.12;
		var y = b ? b.y : 30;
		this.floater("+" + amount + " " + resource, x, y, colors[resource] || "#fff");
	},

	// --- loop --------------------------------------------------------------

	start: function(){
		if(this.running){ return; }
		this.running = true;
		var self = this;
		requestAnimationFrame(function loop(ts){
			if(!self.lastTime){ self.lastTime = ts; }
			var dt = Math.min((ts - self.lastTime) / 1000, 0.1);
			self.lastTime = ts;
			self.update(dt, ts / 1000);
			self.draw();
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
		// Floaters rise and fade; drop the dead ones.
		for(i = this.floaters.length - 1; i >= 0; i--){
			var f = this.floaters[i];
			f.y -= dt * 24;
			f.life -= dt;
			if(f.life <= 0){ this.floaters.splice(i, 1); }
		}
	},

	updateVillager: function(v, dt){
		if(v.busy){ this.updateTask(v, dt); return; } // running a manual action
		// Idle/unemployed villagers recover energy; rate scales with global cardio.
		if(!v.jobTarget && v.energy < 100){
			v.energy = Math.min(100, v.energy + (3 + state.cardio / 50) * dt);
		}
		if(v.jobTarget){
			var b = this.firstBuilding(v.jobTarget);
			if(b){
				// Line workers up beside the building; wrap every 4 into a second row.
				var slot = v.slot || 0;
				v.tx = Math.min(this.W - this.spriteW(imgVillager), b.x + 4 + (slot % 4) * 12);
				v.ty = b.y + this.spriteH(b.img) - this.spriteH(imgVillager) + 2 + Math.floor(slot / 4) * 10;
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

	// --- draw --------------------------------------------------------------

	// Deterministic per-tile hash (stable across frames, no shimmer).
	tileHash: function(col, row){ var h = (col * 73856093) ^ (row * 19349663); return h >>> 0; },

	// Lighten/darken a #rrggbb color by a flat delta on each channel.
	shade: function(hex, d){
		var n = parseInt(hex.slice(1), 16);
		var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
		r += d; g += d; b += d;
		r = r < 0 ? 0 : r > 255 ? 255 : r;
		g = g < 0 ? 0 : g > 255 ? 255 : g;
		b = b < 0 ? 0 : b > 255 ? 255 : b;
		return "rgb(" + r + "," + g + "," + b + ")";
	},

	regionAtCol: function(col){
		for(var i = 0; i < REGION_ORDER.length; i++){
			var rc = this.regionCols[REGION_ORDER[i]];
			if(col >= rc[0] && col < rc[1]){ return REGION_ORDER[i]; }
		}
		return REGION_ORDER[REGION_ORDER.length - 1];
	},

	// Procedural tile terrain, distinct per region, with subtle deterministic jitter.
	drawTerrain: function(ctx){
		var tw = this.tileW, th = this.tileH;
		for(var col = 0; col < this.COLS; col++){
			var pal = this.terrainPalette[this.regionAtCol(col)];
			for(var row = 0; row < this.ROWS; row++){
				var hash = this.tileHash(col, row);
				ctx.fillStyle = this.shade(pal.base, (hash % 21) - 10);
				ctx.fillRect(col * tw, row * th, tw + 0.6, th + 0.6);
				if(pal.fleck && hash % 6 === 0){
					ctx.fillStyle = pal.fleck;
					ctx.fillRect(col * tw + tw * 0.32, row * th + th * 0.32, tw * 0.34, th * 0.34);
				}
			}
		}
	},

	// Dark fog + label + scout hint over each locked region's columns; region dividers.
	drawFog: function(ctx){
		for(var i = 0; i < REGION_ORDER.length; i++){
			var id = REGION_ORDER[i];
			var rc = this.regionCols[id];
			var x0 = rc[0] * this.tileW, x1 = rc[1] * this.tileW, w = x1 - x0;
			if(!state.regions[id]){
				ctx.fillStyle = "rgba(18,18,28,0.72)";
				ctx.fillRect(x0, 0, w, this.H);
				ctx.fillStyle = "#e8e8e8";
				ctx.textAlign = "center";
				ctx.font = "bold 15px sans-serif";
				ctx.fillText(REGIONS[id].label, x0 + w / 2, this.H / 2 - 6);
				var scout = (typeof SCOUTS !== "undefined") ? SCOUTS[id] : null;
				var hint = "Scout to unlock";
				if(scout){
					var gate = scout.gate.charAt(0).toUpperCase() + scout.gate.slice(1);
					hint = state[scout.gate] > 0 ? "Scout it in Expeditions" : ("Build a " + gate + " to scout");
				}
				ctx.font = "12px sans-serif";
				ctx.fillText(hint, x0 + w / 2, this.H / 2 + 14);
				ctx.textAlign = "left";
			}
			ctx.strokeStyle = "rgba(0,0,0,0.18)";
			ctx.beginPath(); ctx.moveTo(x1, 0); ctx.lineTo(x1, this.H); ctx.stroke();
		}
	},

	// The living road: packed-earth tiles along ROAD_ROW, drawn only across
	// claimed regions, so it visibly extends as each region is scouted.
	drawRoad: function(ctx){
		var tw = this.tileW, th = this.tileH, y = this.ROAD_ROW * th;
		for(var col = 0; col < this.COLS; col++){
			if(!state.regions[this.regionAtCol(col)]){ continue; }
			ctx.fillStyle = this.shade("#9c7f52", (this.tileHash(col, this.ROAD_ROW) % 9) - 4);
			ctx.fillRect(col * tw, y, tw + 0.6, th + 0.6);
			ctx.strokeStyle = "rgba(60, 45, 25, 0.25)"; // wheel ruts
			ctx.strokeRect(col * tw, y + th * 0.22, tw, th * 0.56);
		}
	},

	// Gateways straddle each region border on the road row; open when the region
	// past them is claimed, otherwise a closed barrier at the frontier.
	drawGateways: function(ctx){
		var tw = this.tileW, th = this.tileH, y = this.ROAD_ROW * th;
		for(var i = 1; i < REGION_ORDER.length; i++){
			var rid = REGION_ORDER[i];
			var bx = this.regionCols[rid][0] * tw;
			var open = !!state.regions[rid];
			var postW = Math.max(4, tw * 0.14), topY = y - th * 0.18, h = th * 1.18;
			ctx.fillStyle = open ? "#6b5836" : "#4a3d26";
			ctx.fillRect(bx - postW - 1, topY, postW, h);       // left post
			ctx.fillRect(bx + 1, topY, postW, h);               // right post
			ctx.fillRect(bx - postW - 1, topY, postW * 2 + 2, th * 0.22); // lintel
			if(!open){
				ctx.fillStyle = "rgba(58, 48, 30, 0.9)";        // closed barrier
				ctx.fillRect(bx - postW, topY + th * 0.22, postW * 2, h - th * 0.22);
			}
		}
	},

	// Home resource areas: a rock/ore mining cluster and hunting grounds, drawn
	// procedurally with faint labels. These are the walk-to targets for Mine/Hunt.
	drawFeatures: function(ctx){
		var tw = this.tileW, th = this.tileH;
		var mx = this.homeMine.col * tw, my = this.homeMine.row * th;
		var hx = this.homeHunt.col * tw, hy = this.homeHunt.row * th;
		this.drawRocks(ctx, mx, my, tw, th);
		this.drawHunt(ctx, hx, hy, tw, th);
		ctx.fillStyle = "rgba(255,255,255,0.8)";
		ctx.font = "bold 12px sans-serif";
		ctx.textAlign = "center";
		ctx.fillText("Mine", mx + tw / 2, my - 6);
		ctx.fillText("Hunt", hx + tw / 2, hy - 6);
		ctx.textAlign = "left";
	},

	drawRocks: function(ctx, x, y, tw, th){
		var rocks = [[0, 0.2], [0.55, 0.5], [-0.4, 0.6], [0.15, 0.95]];
		var r = tw * 0.28;
		for(var i = 0; i < rocks.length; i++){
			var rx = x + tw * 0.5 + rocks[i][0] * tw, ry = y + th * rocks[i][1];
			ctx.fillStyle = "#7a7d82";
			ctx.beginPath(); ctx.ellipse(rx, ry, r, r * 0.8, 0, 0, 6.2832); ctx.fill();
			ctx.fillStyle = "#5f6266";
			ctx.beginPath(); ctx.ellipse(rx, ry + r * 0.25, r * 0.7, r * 0.45, 0, 0, 6.2832); ctx.fill();
		}
	},

	drawHunt: function(ctx, x, y, tw, th){
		var bushes = [[0, 0.3], [0.6, 0.6], [-0.35, 0.75]];
		var r = tw * 0.26;
		for(var i = 0; i < bushes.length; i++){
			var bx = x + tw * 0.5 + bushes[i][0] * tw, by = y + th * bushes[i][1];
			ctx.fillStyle = "#2f7d32";
			ctx.beginPath(); ctx.ellipse(bx, by, r, r * 0.8, 0, 0, 6.2832); ctx.fill();
			ctx.fillStyle = "#256128";
			ctx.beginPath(); ctx.ellipse(bx - r * 0.3, by, r * 0.5, r * 0.5, 0, 0, 6.2832); ctx.fill();
		}
		var ax = x + tw * 0.55, ay = y + th * 0.45; // a small animal
		ctx.fillStyle = "#8a5a2b";
		ctx.fillRect(ax, ay, tw * 0.4, th * 0.2);
		ctx.fillRect(ax + tw * 0.34, ay - th * 0.1, tw * 0.12, th * 0.14);
	},

	// Draw a building sprite, or a labelled colored box when it has no art yet.
	drawBuilding: function(b, y){
		var ctx = this.ctx;
		if(b.img && b.img.width){
			ctx.drawImage(b.img, b.x, y, this.spriteW(b.img), this.spriteH(b.img));
			return;
		}
		var colors = { quarry: "#8d99ae", farm: "#7cb342", blacksmith: "#5d4037", market: "#c9a227", monument: "#7e57c2" };
		ctx.fillStyle = colors[b.type] || "#888";
		ctx.fillRect(b.x, y, SPRITE_PX, SPRITE_PX);
		ctx.strokeStyle = "rgba(0,0,0,0.4)";
		ctx.strokeRect(b.x, y, SPRITE_PX, SPRITE_PX);
		ctx.fillStyle = "#fff";
		ctx.font = "bold 16px sans-serif";
		ctx.textAlign = "center";
		ctx.fillText(b.type.charAt(0).toUpperCase(), b.x + SPRITE_PX / 2, y + SPRITE_PX / 2 + 6);
		ctx.textAlign = "left";
	},

	draw: function(){
		var ctx = this.ctx;
		if(!ctx){ return; }
		var now = this.lastTime / 1000;

		// Tile terrain, the road across claimed regions, fog over locked regions,
		// then gateways on top (so a closed gate reads at the fogged frontier).
		this.drawTerrain(ctx);
		this.drawRoad(ctx);
		this.drawFog(ctx);
		this.drawGateways(ctx);
		this.drawFeatures(ctx); // Home mining/hunting areas

		// Trees (grow from the bottom of their cell)
		var i, fullH = this.spriteH(imgTree), fullW = this.spriteW(imgTree);
		for(i = 0; i < this.trees.length; i++){
			var t = this.trees[i];
			if(!imgTree || !imgTree.width){ continue; }
			var h = fullH * (0.3 + 0.7 * t.growth);
			var tx = t.col * this.tileW + (this.tileW - fullW) / 2;
			var bottom = (t.row + 1) * this.tileH;
			ctx.drawImage(imgTree, tx, bottom - h, fullW, h);
		}

		// Buildings sit still (structures don't sway; villagers keep their bob)
		for(i = 0; i < this.buildings.length; i++){
			this.drawBuilding(this.buildings[i], this.buildings[i].y);
		}

		// Villagers (bob while working)
		for(i = 0; i < this.villagers.length; i++){
			var v = this.villagers[i];
			if(!imgVillager || !imgVillager.width){ continue; }
			var vbob = v.working ? Math.sin(now * 6 + v.phase) * 1.5 : 0;
			ctx.drawImage(imgVillager, v.x, v.y + vbob, this.spriteW(imgVillager), this.spriteH(imgVillager));
			var vw = this.spriteW(imgVillager);
			// Per-villager work progress bar (A1)
			if(v.busy && v.taskPhase === "work"){
				var py = v.y - 7;
				ctx.fillStyle = "rgba(0,0,0,0.55)";
				ctx.fillRect(v.x, py, vw, 4);
				ctx.fillStyle = "#6bbf47";
				ctx.fillRect(v.x, py, vw * Math.min(1, v.progress), 4);
			}
			// Per-villager energy bar (A2), shown when tired
			if(v.energy < 99.5){
				var ey = v.y + this.spriteH(imgVillager) + 2;
				var e = v.energy / 100;
				ctx.fillStyle = "rgba(0,0,0,0.5)";
				ctx.fillRect(v.x, ey, vw, 3);
				ctx.fillStyle = e > 0.5 ? "#e0c040" : (e > 0.25 ? "#e08a2a" : "#d0402a");
				ctx.fillRect(v.x, ey, vw * e, 3);
			}
		}

		// Floaters
		ctx.font = "bold 14px sans-serif";
		ctx.textAlign = "left";
		for(i = 0; i < this.floaters.length; i++){
			var fl = this.floaters[i];
			ctx.globalAlpha = Math.max(0, Math.min(1, fl.life / 1.3));
			ctx.fillStyle = "#000";
			ctx.fillText(fl.text, fl.x + 1, fl.y + 1);
			ctx.fillStyle = fl.color;
			ctx.fillText(fl.text, fl.x, fl.y);
		}
		ctx.globalAlpha = 1;
	},
};
