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

	// Per building type: which region it sits in, its vertical lane (y), and a
	// horizontal offset within that region's zone. New Phase 3 buildings live in
	// the regions their resource comes from.
	buildingConfig: {
		house:        { region: "home",      lane: 58,  ox: 6 },
		lumberMill:   { region: "home",      lane: 104, ox: 40 },
		mine:         { region: "home",      lane: 150, ox: 74 },
		huntingLodge: { region: "home",      lane: 196, ox: 108 },
		trainingYard: { region: "home",      lane: 242, ox: 142 },
		quarry:       { region: "hills",     lane: 104, ox: 8 },
		farm:         { region: "hills",     lane: 150, ox: 8 },
		blacksmith:   { region: "hills",     lane: 196, ox: 8 },
		market:       { region: "mountains", lane: 120, ox: 8 },
		monument:     { region: "cavern",    lane: 120, ox: 8 },
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
		this.buildings = [];
		this.villagers = [];
		this.floaters = [];
		this.buildTreeRow();
	},

	// A forest strip across the Home zone (wood comes from Home). Positions use a
	// fixed cell so they don't depend on the tree image being loaded yet.
	buildTreeRow: function(){
		this.trees = [];
		var home = this.zonePx("home");
		var cell = SPRITE_PX + 6;
		for(var x = home[0] + 4; x + SPRITE_PX < home[1]; x += cell){
			this.trees.push({ x: x, growth: 1, phase: Math.random() * 6.28 });
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

	// Place each building inside its region's zone: flow left -> right from the
	// zone start + the type's offset, wrapping to a sub-row if the zone fills.
	layoutBuildings: function(){
		var cell = SPRITE_PX + 12;
		var seen = {};
		for(var i = 0; i < this.buildings.length; i++){
			var b = this.buildings[i];
			var cfg = this.buildingConfig[b.type] || { region: "home", lane: 60, ox: 8 };
			var zone = this.zonePx(cfg.region);
			var baseX = zone[0] + cfg.ox;
			var n = seen[b.type] | 0; seen[b.type] = n + 1;
			var cols = Math.max(1, Math.floor((zone[1] - baseX - SPRITE_PX) / cell) + 1);
			b.x = baseX + (n % cols) * cell;
			b.y = cfg.lane + Math.floor(n / cols) * (SPRITE_PX + 8);
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
		var hx = 12 + Math.random() * 90;
		this.villagers.push({
			x: hx,
			y: this.H - 44,
			tx: hx,
			ty: this.H - 44,
			home: { x: hx, y: this.H - 44 }, // anchor for the idle wander
			rest: Math.random() * 3,         // seconds to stand still before drifting
			jobTarget: null,
			working: false,
			phase: Math.random() * 6.28,
			speed: 18 + Math.random() * 10,
		});
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

	// Chopping wood: deplete a grown tree and float the gain over it.
	chopWoodFx: function(amount){
		var grown = this.trees.filter(function(t){ return t.growth > 0.5; });
		var t = grown.length ? grown[Math.floor(Math.random() * grown.length)] : this.trees[0];
		if(t){
			t.growth = 0.12;
			this.floater("+" + amount + " wood", t.x - 4, this.treeLane + SPRITE_PX, "#2e7d32");
		} else {
			this.gainFx("wood", amount);
		}
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
		if(v.jobTarget){
			var b = this.firstBuilding(v.jobTarget);
			if(b){
				// Line workers up beside the building; wrap every 4 into a second row.
				var slot = v.slot || 0;
				v.tx = Math.min(this.W - this.spriteW(imgVillager), b.x + 4 + (slot % 4) * 12);
				v.ty = b.y + this.spriteH(b.img) - this.spriteH(imgVillager) + 2 + Math.floor(slot / 4) * 10;
			}
		} else if(Math.abs(v.x - v.tx) < 2 && Math.abs(v.y - v.ty) < 2){
			// Unemployed: gentle wander. Stand still for a few seconds, then drift
			// to a new spot within a small radius of this villager's home.
			v.rest -= dt;
			if(v.rest <= 0){
				v.tx = Math.max(4, Math.min(this.W - 40, v.home.x + (Math.random() * 2 - 1) * 22));
				v.ty = v.home.y + (Math.random() * 2 - 1) * 12;
				v.rest = 2.5 + Math.random() * 3.5; // pause before the next stroll
			}
		}
		var dx = v.tx - v.x, dy = v.ty - v.y;
		var dist = Math.sqrt(dx * dx + dy * dy);
		var step = v.speed * dt;
		if(dist > step){ v.x += (dx / dist) * step; v.y += (dy / dist) * step; v.working = false; }
		else { v.x = v.tx; v.y = v.ty; v.working = !!v.jobTarget; }
	},

	// --- draw --------------------------------------------------------------

	// Tinted region bands; locked regions get a dark fog + a "Scout to unlock" label.
	drawZones: function(ctx){
		for(var i = 0; i < REGION_ORDER.length; i++){
			var id = REGION_ORDER[i];
			var r = REGIONS[id];
			var zx = this.zonePx(id);
			var w = zx[1] - zx[0];
			ctx.fillStyle = r.tint;
			ctx.fillRect(zx[0], 0, w, this.H);
			if(!state.regions[id]){
				ctx.fillStyle = "rgba(18,18,28,0.72)";
				ctx.fillRect(zx[0], 0, w, this.H);
				ctx.fillStyle = "#e8e8e8";
				ctx.textAlign = "center";
				ctx.font = "bold 15px sans-serif";
				ctx.fillText(r.label, zx[0] + w / 2, this.H / 2 - 6);
				ctx.font = "12px sans-serif";
				ctx.fillText("Scout to unlock", zx[0] + w / 2, this.H / 2 + 14);
				ctx.textAlign = "left";
			}
			ctx.strokeStyle = "rgba(0,0,0,0.15)";
			ctx.beginPath(); ctx.moveTo(zx[1], 0); ctx.lineTo(zx[1], this.H); ctx.stroke();
		}
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

		// Region zones (tinted bands; locked zones fogged with a label)
		this.drawZones(ctx);

		// Trees (grow from the bottom of their cell)
		var i, fullH = this.spriteH(imgTree), fullW = this.spriteW(imgTree);
		for(i = 0; i < this.trees.length; i++){
			var t = this.trees[i];
			if(!imgTree || !imgTree.width){ continue; }
			var h = fullH * (0.3 + 0.7 * t.growth);
			ctx.drawImage(imgTree, t.x, this.treeLane + (fullH - h), fullW, h);
		}

		// Buildings (gentle idle bob)
		for(i = 0; i < this.buildings.length; i++){
			var b = this.buildings[i];
			var bob = Math.sin(now * 2 + b.phase) * 1.2;
			this.drawBuilding(b, b.y + bob);
		}

		// Villagers (bob while working)
		for(i = 0; i < this.villagers.length; i++){
			var v = this.villagers[i];
			if(!imgVillager || !imgVillager.width){ continue; }
			var vbob = v.working ? Math.sin(now * 6 + v.phase) * 1.5 : 0;
			ctx.drawImage(imgVillager, v.x, v.y + vbob, this.spriteW(imgVillager), this.spriteH(imgVillager));
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
