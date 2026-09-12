// Author Petter Andersson
"use strict"

// ===========================================================================
// Render2D — the original canvas-2D view of the village, top-down.
//
// One of two interchangeable renderers (see render3d.js). It owns everything
// the world deliberately does not: the canvas, the sprite images, the camera,
// colours, and the atmosphere passes. It reads the world and never writes to
// it, so the same village can be handed to another renderer mid-flight.
//
// The renderer contract, all any renderer must provide:
//   init(container)          create your surface inside this element
//   frame(world, dt, now)    advance your camera and draw one frame
//   pick(clientX, clientY)   hit-test a screen point -> villager | null
//   destroy()                tear your surface down again
// ===========================================================================

// Below this fit-scale the whole-world view is too small to read (roughly a
// half-width desktop window), so the camera zooms in to fill the height and pans
// horizontally instead. At or above it, nothing changes from the classic view.
var CAM_MIN_FIT = 0.9;
var CAM_MAX_ZOOM = 3;      // never zoom past this, however tall the viewport is
var CAM_DEADZONE = 0.5;    // middle fraction of the view the action can roam freely in
var CAM_LERP = 4;          // camera catch-up rate (per second)

// Hot-path sprite aliases, populated from the SPRITES manifest by loadAssets()
// (all other sprites are looked up via Render2D.assets[key]). Atmosphere reads
// these too, for its ground shadows.
var imgVillager = null;
var imgTree = null;

var Render2D = {
	name: "2d",
	canvas: null, ctx: null,
	assets: {}, // sprite key -> Image, populated from SPRITES by loadAssets()

	// Camera: world->screen mapping recomputed every frame from the element size.
	// camX is the world x at the left edge of the view; camScale/camOX/camOY are
	// derived. See updateCamera.
	camX: 0, camScale: 1, camOX: 0, camOY: 0, camViewW: WORLD_W,

	terrainPalette: {
		home:      { base: "#3fbf3f" },
		hills:     { base: "#c9b37e", fleck: "#a58a5b" },
		mountains: { base: "#9aa0a6", fleck: "#7d838a" },
		cavern:    { base: "#4a3b63", fleck: "#5e4b7e" },
	},

	// Load every sprite in the SPRITES manifest into an Image. drawImage handles
	// PNG / SVG / data-URI uniformly, so entries can be any of those. Sizes come
	// from the manifest, not from these Images — a sprite still decoding just
	// appears on a later frame without ever moving the village around.
	loadAssets: function(){
		this.assets = {};
		for(var key in SPRITES){
			var im = new Image();
			im.src = SPRITES[key].src;
			this.assets[key] = im;
		}
		imgVillager = this.assets.villager;
		imgTree = this.assets.tree;
	},

	init: function(container){
		var c = document.createElement("canvas");
		c.id = "canvas1";
		c.width = WORLD_W;
		c.height = WORLD_H;
		container.appendChild(c);
		this.canvas = c;
		this.ctx = c.getContext("2d");
		ctx = this.ctx; // legacy global (variables.js)
		this.camX = 0;
		this._camReady = false;
		this.loadAssets();
		Atmosphere.initCache(WORLD_W, WORLD_H);
	},

	destroy: function(){
		if(this.canvas && this.canvas.parentNode){ this.canvas.parentNode.removeChild(this.canvas); }
		this.canvas = null; this.ctx = null;
	},

	frame: function(world, dt, now){
		this.world = world;
		this.updateCamera(world, dt);
		this.draw(world, now);
	},

	// --- image + geometry helpers -----------------------------------------

	// A building's art is the manifest entry sharing its type name (see SPRITES).
	// Types with no sprite fall back to a labelled box in drawBuilding.
	buildingImg: function(type){ return this.assets[type]; },

	// --- camera --------------------------------------------------------------

	// Match the canvas backing store to the size the layout actually gave the
	// element (times the device pixel ratio, so the map isn't blurry on retina).
	// Cheap no-op when nothing changed, so it's safe to call every frame.
	syncCanvasSize: function(){
		var c = this.canvas;
		if(!c){ return; }
		var dpr = window.devicePixelRatio || 1;
		var cw = c.clientWidth || WORLD_W, ch = c.clientHeight || WORLD_H;
		var pw = Math.max(1, Math.round(cw * dpr)), ph = Math.max(1, Math.round(ch * dpr));
		if(c.width !== pw){ c.width = pw; }
		if(c.height !== ph){ c.height = ph; }
		this.cssW = cw;
		this.cssH = ch;
		this.dpr = dpr;
	},

	// Pick the zoom and pan for this frame.
	//
	// Wide windows keep the classic whole-world view: scale to *contain* the
	// world, letterbox, no panning. Once the window gets too narrow for that to
	// stay readable (fit < CAM_MIN_FIT) the camera zooms to fill the height and
	// pans horizontally, following the villagers — but only once they leave the
	// middle CAM_DEADZONE of the view, so it sits still during ordinary work.
	updateCamera: function(world, dt){
		this.syncCanvasSize();
		var cw = this.cssW, ch = this.cssH;
		var fit = Math.min(cw / world.W, ch / world.H);
		this.camScale = fit >= CAM_MIN_FIT ? fit : Math.min(ch / world.H, CAM_MAX_ZOOM);

		var viewW = cw / this.camScale;               // world units visible across
		this.camViewW = viewW;
		var maxX = Math.max(0, world.W - viewW);
		if(maxX <= 0){
			this.camX = 0;                            // world fits: centred, no pan
		} else {
			var target = this.camX;
			var focus = this.focusX(world);
			var pad = viewW * (1 - CAM_DEADZONE) / 2;
			if(focus < this.camX + pad){ target = focus - pad; }
			else if(focus > this.camX + viewW - pad){ target = focus - viewW + pad; }
			target = Math.max(0, Math.min(maxX, target));
			// Snap on the first frame / after a resize; ease otherwise.
			var k = Math.min(1, (dt || 0) * CAM_LERP);
			this.camX = this._camReady ? this.camX + (target - this.camX) * k : target;
		}
		this._camReady = true;
		this.camOX = Math.max(0, (cw - world.W * this.camScale) / 2);
		this.camOY = Math.max(0, (ch - world.H * this.camScale) / 2);
	},

	// What the camera follows: the middle of the villagers (they are the action).
	// With none on screen yet, hold on the home region.
	focusX: function(world){
		var n = world.villagers.length;
		if(!n){ return world.W * (REGIONS.home.zone[1] / 2); }
		var sum = 0;
		for(var i = 0; i < n; i++){ sum += world.villagers[i].x; }
		return sum / n;
	},

	// Install the world->device transform for a frame of drawing.
	applyCamera: function(ctx){
		var s = this.camScale * (this.dpr || 1);
		ctx.setTransform(s, 0, 0, s, (this.camOX - this.camX * this.camScale) * (this.dpr || 1), this.camOY * (this.dpr || 1));
	},

	// The 2D camera has no user-driven pan or zoom — it always either fits the
	// world or follows the villagers — so "reset the view" only has to re-snap it.
	// Present so either renderer can answer the same request (see the Home key).
	resetView: function(){ this._camReady = false; },

	// Hit-test a screen click to a villager: invert the camera transform to get
	// world coords, then return the topmost villager whose (slightly padded)
	// sprite box contains the point, or null for empty space.
	pick: function(clientX, clientY){
		var world = this.world;
		if(!this.canvas || !world){ return null; }
		var rect = this.canvas.getBoundingClientRect();
		var scale = this.camScale;
		var wx = (clientX - rect.left - this.camOX) / scale + this.camX;
		var wy = (clientY - rect.top - this.camOY) / scale;
		var vw = world.VW, vh = world.VH, pad = 4;
		for(var i = world.villagers.length - 1; i >= 0; i--){
			var v = world.villagers[i];
			if(wx >= v.x - pad && wx <= v.x + vw + pad && wy >= v.y - pad && wy <= v.y + vh + pad){ return v; }
		}
		return null;
	},

	// --- draw --------------------------------------------------------------

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

	// Procedural tile terrain, distinct per region, with subtle deterministic jitter.
	drawTerrain: function(ctx, world){
		var tw = world.tileW, th = world.tileH;
		for(var col = 0; col < world.COLS; col++){
			var pal = this.terrainPalette[world.regionAtCol(col)];
			for(var row = 0; row < world.ROWS; row++){
				var hash = world.tileHash(col, row);
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
	drawFog: function(ctx, world){
		for(var i = 0; i < REGION_ORDER.length; i++){
			var id = REGION_ORDER[i];
			var rc = world.regionCols[id];
			var x0 = rc[0] * world.tileW, x1 = rc[1] * world.tileW, w = x1 - x0;
			if(!state.regions[id]){
				ctx.fillStyle = "rgba(18,18,28,0.72)";
				ctx.fillRect(x0, 0, w, world.H);
				ctx.fillStyle = "#e8e8e8";
				ctx.textAlign = "center";
				ctx.font = "bold 15px sans-serif";
				ctx.fillText(REGIONS[id].label, x0 + w / 2, world.H / 2 - 6);
				var scout = (typeof SCOUTS !== "undefined") ? SCOUTS[id] : null;
				var hint = "Scout to unlock";
				if(scout){
					var gate = scout.gate.charAt(0).toUpperCase() + scout.gate.slice(1);
					hint = state[scout.gate] > 0 ? "Scout it in Expeditions" : ("Build a " + gate + " to scout");
				}
				ctx.font = "12px sans-serif";
				ctx.fillText(hint, x0 + w / 2, world.H / 2 + 14);
				ctx.textAlign = "left";
			}
			ctx.strokeStyle = "rgba(0,0,0,0.18)";
			ctx.beginPath(); ctx.moveTo(x1, 0); ctx.lineTo(x1, world.H); ctx.stroke();
		}
	},

	// The living road: packed-earth tiles along ROAD_ROW, drawn only across
	// claimed regions, so it visibly extends as each region is scouted.
	drawRoad: function(ctx, world){
		var tw = world.tileW, th = world.tileH, y = world.ROAD_ROW * th;
		for(var col = 0; col < world.COLS; col++){
			if(!state.regions[world.regionAtCol(col)]){ continue; }
			ctx.fillStyle = this.shade("#9c7f52", (world.tileHash(col, world.ROAD_ROW) % 9) - 4);
			ctx.fillRect(col * tw, y, tw + 0.6, th + 0.6);
			ctx.strokeStyle = "rgba(60, 45, 25, 0.25)"; // wheel ruts
			ctx.strokeRect(col * tw, y + th * 0.22, tw, th * 0.56);
		}
	},

	// Gateways straddle each region border on the road row; open when the region
	// past them is claimed, otherwise a closed barrier at the frontier.
	drawGateways: function(ctx, world){
		var tw = world.tileW, th = world.tileH, y = world.ROAD_ROW * th;
		for(var i = 1; i < REGION_ORDER.length; i++){
			var rid = REGION_ORDER[i];
			var bx = world.regionCols[rid][0] * tw;
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
	drawFeatures: function(ctx, world){
		var tw = world.tileW, th = world.tileH;
		var mx = world.homeMine.col * tw, my = world.homeMine.row * th;
		var hx = world.homeHunt.col * tw, hy = world.homeHunt.row * th;
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

	// One-shot spawn-pop scale for a freshly-built building (grows from the ground
	// with a little overshoot). Returns 1 once the ~0.45s animation is done, or for
	// buildings restored from a save (bornAt < 0).
	buildingScale: function(b, now){
		if(b.bornAt < 0){ return 1; }
		var age = now - b.bornAt;
		return age < 0.45 ? Anim.easeOutBack(Anim.clamp01(age / 0.45)) : 1;
	},

	// Draw a building sprite, or a labelled colored box when it has no art yet.
	drawBuilding: function(ctx, b, now){
		var s = this.buildingScale(b, now);
		var img = this.buildingImg(b.type);
		if(img && img.width){
			var w = b.w, h = b.h;
			// scale around the bottom-centre so it rises out of its plot
			ctx.drawImage(img, b.x + (w - w * s) / 2, b.y + (h - h * s), w * s, h * s);
			return;
		}
		var sp = SPRITE_PX * s, bx = b.x + (SPRITE_PX - sp) / 2, by = b.y + (SPRITE_PX - sp);
		var colors = { quarry: "#8d99ae", farm: "#7cb342", blacksmith: "#5d4037", market: "#c9a227", monument: "#7e57c2" };
		ctx.fillStyle = colors[b.type] || "#888";
		ctx.fillRect(bx, by, sp, sp);
		ctx.strokeStyle = "rgba(0,0,0,0.4)";
		ctx.strokeRect(bx, by, sp, sp);
		ctx.fillStyle = "#fff";
		ctx.font = "bold 16px sans-serif";
		ctx.textAlign = "center";
		ctx.fillText(b.type.charAt(0).toUpperCase(), bx + sp / 2, by + sp / 2 + 6);
		ctx.textAlign = "left";
	},

	draw: function(world, now){
		var ctx = this.ctx;
		if(!ctx){ return; }

		// Clear in device space (the letterbox bands live outside the world), then
		// draw everything below in world coords through the camera transform.
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
		this.applyCamera(ctx);

		// --- WORLD ---------------------------------------------------------
		this.drawTerrain(ctx, world);
		this.drawRoad(ctx, world);
		this.drawFog(ctx, world);
		this.drawGateways(ctx, world);
		this.drawFeatures(ctx, world); // Home mining/hunting areas

		// --- GROUND FX (over terrain, under entities) ----------------------
		Atmosphere.cloudShadows(ctx, world, now);
		Atmosphere.groundShadows(ctx, world, now);

		// Trees (grow from the bottom of their cell)
		var i, fullW = world.footprint("tree").w, fullH = world.footprint("tree").h;
		for(i = 0; i < world.trees.length; i++){
			var t = world.trees[i];
			if(!imgTree || !imgTree.width){ continue; }
			var h = fullH * (0.3 + 0.7 * t.growth);
			var tx = t.col * world.tileW + (world.tileW - fullW) / 2;
			var bottom = (t.row + 1) * world.tileH;
			ctx.drawImage(imgTree, tx, bottom - h, fullW, h);
		}

		// Buildings sit still (structures don't sway; villagers keep their bob)
		for(i = 0; i < world.buildings.length; i++){
			this.drawBuilding(ctx, world.buildings[i], now);
		}

		// Villagers: a gentle sway while working, a bouncy step cycle while walking.
		var vw = world.VW, sh = world.VH;
		for(i = 0; i < world.villagers.length; i++){
			var v = world.villagers[i];
			if(!imgVillager || !imgVillager.width){ continue; }
			var vbob = 0;
			if(v.working){ vbob = Anim.oscillate(now, 6, 1.5, v.phase); }        // gentle work sway
			else if(v.moving){ vbob = -Anim.pulse(now, 9, v.phase) * 2.2; }       // hop up on each step
			ctx.drawImage(imgVillager, v.x, v.y + vbob, vw, sh);
			// Per-villager work progress bar (A1). When villagers overlap (e.g. several
			// hunting on the same tile) the bars stack upward so each stays visible
			// instead of every one drawing over the last.
			if(v.busy && v.taskPhase === "work"){
				var level = 0;
				for(var j = 0; j < i; j++){
					var o = world.villagers[j];
					if(o.busy && o.taskPhase === "work" && Math.abs(o.x - v.x) < 14 && Math.abs(o.y - v.y) < 14){ level++; }
				}
				var py = v.y - 7 - level * 6;
				ctx.fillStyle = "rgba(0,0,0,0.55)";
				ctx.fillRect(v.x, py, vw, 4);
				ctx.fillStyle = "#6bbf47";
				ctx.fillRect(v.x, py, vw * Math.min(1, v.progress), 4);
			}
			// Two need-bars per villager, each tagged with an icon so they read apart at a
			// glance: ⚡ energy, 🍖 food. Normally stacked just under the sprite; if the
			// villager is too near the bottom edge to fit them, they flip above the head.
			var IW = 11;                       // left gutter holding the bar's icon
			var barX = v.x + IW, barW = vw - IW;
			var eY = (v.y + sh + 16 <= world.H) ? (v.y + sh + 2) : (v.y - 15);
			var hY = eY + 9;                   // hunger bar sits below energy, icons clear
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.font = "10px sans-serif";
			if(v.energy < 99.5){
				var e = v.energy / 100;
				ctx.fillStyle = "rgba(0,0,0,0.5)";
				ctx.fillRect(barX, eY, barW, 4);
				ctx.fillStyle = e > 0.5 ? "#e0c040" : (e > 0.25 ? "#e08a2a" : "#d0402a");
				ctx.fillRect(barX, eY, barW * e, 4);
				ctx.fillText("⚡", v.x + IW / 2, eY + 2);
			}
			if(v.hunger < 99.5){
				var hn = v.hunger / 100;
				ctx.fillStyle = "rgba(0,0,0,0.5)";
				ctx.fillRect(barX, hY, barW, 4);
				ctx.fillStyle = hn > 0.5 ? "#c9863a" : (hn > 0.25 ? "#c76b28" : "#a33");
				ctx.fillRect(barX, hY, barW * hn, 4);
				ctx.fillText("🍖", v.x + IW / 2, hY + 2);
			}
			ctx.textBaseline = "alphabetic";
			// One status marker above the villager for the more urgent need: 🍖 when
			// hungry, 💤 when tired (they also move slower, see moveToward). Pulses.
			if(v.energy < 35 || v.hunger < 35){
				var icon = (v.hunger < 35 && v.hunger <= v.energy) ? "🍖" : "💤";
				ctx.font = "13px sans-serif";
				ctx.textAlign = "center";
				ctx.globalAlpha = 0.55 + 0.45 * Anim.pulse(now, 3, v.phase);
				ctx.fillText(icon, v.x + vw / 2, v.y - 8);
				ctx.globalAlpha = 1;
				ctx.textAlign = "left";
			}
		}

		// --- OVER-ENTITY FX ------------------------------------------------
		Atmosphere.glow(ctx, world, now);
		Atmosphere.drawParticles(ctx, world, now);

		// Floaters
		ctx.font = "bold 14px sans-serif";
		ctx.textAlign = "left";
		for(i = 0; i < world.floaters.length; i++){
			var fl = world.floaters[i];
			// Drift up the screen over the floater's life (the world stores only
			// where it started and how long it has left).
			var age = world.FLOATER_LIFE - fl.life;
			var fy = fl.y - age * 24;
			ctx.globalAlpha = Anim.clamp01(fl.life / world.FLOATER_LIFE);
			ctx.fillStyle = "#000";
			ctx.fillText(fl.text, fl.x + 1, fy + 1);
			ctx.fillStyle = fl.color;
			ctx.fillText(fl.text, fl.x, fy);
		}
		ctx.globalAlpha = 1;

		// --- POST (frontmost) ----------------------------------------------
		Atmosphere.post(ctx, world, now);
	},
};
