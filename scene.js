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

	// Vertical lane (top y) for each building type + the tree strip.
	lanes: {
		tree: 4,
		house: 58,
		lumberMill: 104,
		mine: 150,
		huntingLodge: 196,
		trainingYard: 242,
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

	// A forest strip across the top. Positions use a fixed cell so they don't
	// depend on the tree image being loaded yet.
	buildTreeRow: function(){
		this.trees = [];
		var cell = SPRITE_PX + 6;
		for(var x = 4; x + SPRITE_PX < this.W; x += cell){
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

	// Each building type gets its own vertical lane (y) and a staggered
	// horizontal start (x) so a one-of-each village reads as a spread-out
	// settlement instead of a column hugging the left edge.
	laneStartX: {
		house: 8, lumberMill: 46, mine: 84, huntingLodge: 122, trainingYard: 160,
	},

	addBuilding: function(type){
		this.buildings.push({
			type: type,
			img: this.buildingImg(type),
			x: 0, y: 0, // set by layoutBuildings
			phase: Math.random() * 6.28,
		});
		this.layoutBuildings();
	},

	// Flow each type's buildings left-to-right from its start x, wrapping to a
	// sub-row only when a lane runs off the right edge.
	layoutBuildings: function(){
		var cell = SPRITE_PX + 12;
		var seen = {};
		for(var i = 0; i < this.buildings.length; i++){
			var b = this.buildings[i];
			var lane = this.lanes[b.type] || 60;
			var baseX = this.laneStartX[b.type] || 8;
			var n = seen[b.type] | 0; seen[b.type] = n + 1;
			var cols = Math.max(1, Math.floor((this.W - baseX - SPRITE_PX) / cell) + 1);
			b.x = baseX + (n % cols) * cell;
			b.y = lane + Math.floor(n / cols) * (SPRITE_PX + 8);
		}
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
			this.floater("+" + amount + " wood", t.x - 4, this.lanes.tree + SPRITE_PX, "#2e7d32");
		} else {
			this.gainFx("wood", amount);
		}
	},

	// Generic resource gain: float over the relevant building, or top-left.
	gainFx: function(resource, amount){
		var colors = { wood: "#2e7d32", iron: "#607d8b", food: "#c76b28" };
		var homes = { iron: "mine", food: "huntingLodge", wood: "lumberMill" };
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

	draw: function(){
		var ctx = this.ctx;
		if(!ctx){ return; }
		var now = this.lastTime / 1000;

		// Background
		ctx.fillStyle = "#3fbf3f";
		ctx.fillRect(0, 0, this.W, this.H);

		// Trees (grow from the bottom of their cell)
		var i, fullH = this.spriteH(imgTree), fullW = this.spriteW(imgTree);
		for(i = 0; i < this.trees.length; i++){
			var t = this.trees[i];
			if(!imgTree || !imgTree.width){ continue; }
			var h = fullH * (0.3 + 0.7 * t.growth);
			ctx.drawImage(imgTree, t.x, this.lanes.tree + (fullH - h), fullW, h);
		}

		// Buildings (gentle idle bob)
		for(i = 0; i < this.buildings.length; i++){
			var b = this.buildings[i];
			if(!b.img || !b.img.width){ continue; }
			var bob = Math.sin(now * 2 + b.phase) * 1.2;
			ctx.drawImage(b.img, b.x, b.y + bob, this.spriteW(b.img), this.spriteH(b.img));
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
