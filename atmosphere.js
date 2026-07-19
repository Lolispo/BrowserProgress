// Author Petter Andersson
"use strict"

// ===========================================================================
// Atmosphere: a small set of full-frame render passes the scene composes for
// mood — cloud-shadow drift, ground shadows, building glow, per-region
// particles, and a vignette + color grade. Adapted for a top-down, camera-less
// canvas (no parallax sky; clouds dapple the ground instead). Rendering only:
// passes read scene geometry + state.regions for visibility, never mutate state.
//
// Adding a mood is data, not code: one row in ATMOSPHERE / GLOW_SOURCES /
// PARTICLE_KINDS (mirrors the SPRITES manifest philosophy).
// ===========================================================================

// Per-region ambience, keyed off REGIONS ids. grade = a translucent tint drawn
// over that region's columns (null = none); particle = the PARTICLE_KINDS key it emits.
var ATMOSPHERE = {
	home:      { grade: null,                    particle: "leaf"  },
	hills:     { grade: "rgba(201,179,126,0.10)", particle: "dust"  },
	mountains: { grade: "rgba(150,160,170,0.12)", particle: "snow"  },
	cavern:    { grade: "rgba(90,60,120,0.20)",   particle: "spore" },
};

// Buildings that emit an additive glow halo (type -> hex color).
var GLOW_SOURCES = { monument: "#9b6dc9", blacksmith: "#ff7a1a", market: "#c9a227" };

// Particle kinds. drift = px/s [vx,vy]; twinkle = Hz of alpha pulse (0 = steady).
var PARTICLE_KINDS = {
	leaf:  { drift: [ 8,  6], size: 3, color: "#66aa33", alpha: 0.50, twinkle: 0 },
	dust:  { drift: [ 5,  2], size: 2, color: "#d8c48a", alpha: 0.35, twinkle: 0 },
	snow:  { drift: [-4,  8], size: 2, color: "#eeeeff", alpha: 0.70, twinkle: 0 },
	spore: { drift: [ 3, -5], size: 2, color: "#c9a7ff", alpha: 0.60, twinkle: 4 },
	ember: { drift: [ 2, -9], size: 2, color: "#ff9a3a", alpha: 0.80, twinkle: 6 },
};

// Particle pool sizing. Per visible region we aim for PER_REGION, hard-capped
// globally at MAX so mobile stays smooth.
var PARTICLES_PER_REGION = 16;
var PARTICLES_MAX = 80;

// Drifting cloud shadows: the top-down stand-in for a parallax sky. Each cloud's
// x is derived from `now` (no stored state); yF/rxF/ryF are fractions of canvas.
var CLOUDS = [
	{ yF: 0.20, rxF: 0.34, ryF: 0.22, speed: 14, offset: 0.0,  alpha: 0.10 },
	{ yF: 0.55, rxF: 0.42, ryF: 0.26, speed: 9,  offset: 0.45, alpha: 0.08 },
	{ yF: 0.80, rxF: 0.30, ryF: 0.18, speed: 20, offset: 0.75, alpha: 0.09 },
];

var Atmosphere = {
	_vignette: null,

	// Whole layer off when intensity is 0 (weak devices / A-B compare).
	on: function(){ return typeof ATMOSPHERE_INTENSITY === "number" && ATMOSPHERE_INTENSITY > 0; },

	initCache: function(W, H){
		// Built on a scratch canvas context because initCache runs during
		// scene.init, when the module-global `ctx` may not yet be assigned.
		var c = document.createElement("canvas");
		var gctx = c.getContext("2d");
		var grad = gctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.62);
		grad.addColorStop(0, "rgba(0,0,0,0)");
		grad.addColorStop(1, "rgba(0,0,0,0.38)");
		this._vignette = grad;
	},
	// Soft dark blobs sliding across the ground — ambient motion without a camera.
	// Each wraps horizontally over W + 2*margin so it eases on/off screen.
	cloudShadows: function(ctx, scene, now){
		if(!this.on()){ return; }
		var W = scene.W, H = scene.H;
		for(var i = 0; i < CLOUDS.length; i++){
			var c = CLOUDS[i];
			var rx = c.rxF * W, ry = c.ryF * H, margin = rx;
			var span = W + 2 * margin;
			var x = ((now * c.speed + c.offset * span) % span) - margin;
			var y = c.yF * H;
			var g = ctx.createRadialGradient(x, y, 0, x, y, rx);
			g.addColorStop(0, "rgba(20,24,32," + (c.alpha * ATMOSPHERE_INTENSITY) + ")");
			g.addColorStop(1, "rgba(20,24,32,0)");
			ctx.save();
			ctx.translate(x, y);
			ctx.scale(1, ry / rx);
			ctx.translate(-x, -y);
			ctx.fillStyle = g;
			ctx.beginPath();
			ctx.arc(x, y, rx, 0, 6.2832);
			ctx.fill();
			ctx.restore();
		}
	},
	groundShadows: function(ctx, scene, now){
		if(!this.on()){ return; }
		var a = 0.22 * ATMOSPHERE_INTENSITY;
		ctx.fillStyle = "rgba(0,0,0," + a + ")";
		var i, b, w, h, cx, by;
		for(i = 0; i < scene.buildings.length; i++){
			b = scene.buildings[i];
			w = scene.spriteW(b.img); h = scene.spriteH(b.img);
			cx = b.x + w / 2; by = b.y + h;
			ctx.beginPath();
			ctx.ellipse(cx, by, w * 0.42, h * 0.12, 0, 0, 6.2832);
			ctx.fill();
		}
		var vw = scene.spriteW(imgVillager), vh = scene.spriteH(imgVillager);
		for(i = 0; i < scene.villagers.length; i++){
			var v = scene.villagers[i];
			ctx.beginPath();
			ctx.ellipse(v.x + vw / 2, v.y + vh, vw * 0.45, vh * 0.14, 0, 0, 6.2832);
			ctx.fill();
		}
	},
	// Additive halo around landmark buildings (forge, monument, market). Uses a
	// radial gradient composited with 'lighter' so it reads as emitted light, not
	// paint. A slow breathe keeps it alive without flicker.
	glow: function(ctx, scene, now){
		if(!this.on()){ return; }
		var prev = ctx.globalCompositeOperation;
		ctx.globalCompositeOperation = "lighter";
		for(var i = 0; i < scene.buildings.length; i++){
			var b = scene.buildings[i];
			var col = GLOW_SOURCES[b.type];
			if(!col){ continue; }
			var w = scene.spriteW(b.img), h = scene.spriteH(b.img);
			var cx = b.x + w / 2, cy = b.y + h * 0.5;
			var breathe = 0.85 + 0.15 * Anim.oscillate(now, 1.2, 1, b.phase); // ~0.7..1.0
			var r = w * 1.15 * breathe;
			var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
			g.addColorStop(0, this._hexToRgba(col, 0.45 * ATMOSPHERE_INTENSITY));
			g.addColorStop(1, this._hexToRgba(col, 0));
			ctx.fillStyle = g;
			ctx.beginPath();
			ctx.arc(cx, cy, r, 0, 6.2832);
			ctx.fill();
		}
		ctx.globalCompositeOperation = prev;
	},

	// "#rrggbb" + alpha -> "rgba(r,g,b,a)". Used for gradient stops.
	_hexToRgba: function(hex, a){
		var n = parseInt(hex.slice(1), 16);
		return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
	},

	// List of currently-visible (claimed) region ids that define an ambience.
	_visibleRegions: function(){
		var out = [];
		for(var i = 0; i < REGION_ORDER.length; i++){
			var id = REGION_ORDER[i];
			if(state.regions[id] && ATMOSPHERE[id] && ATMOSPHERE[id].particle){ out.push(id); }
		}
		return out;
	},

	// Spawn one particle for a region: random position in its column band, drift
	// + twinkle from its kind. deterministic-free RNG is fine (particles are ephemeral).
	_spawn: function(scene, id){
		var kindKey = ATMOSPHERE[id].particle;
		var kind = PARTICLE_KINDS[kindKey];
		var rc = scene.regionCols[id];
		var x0 = rc[0] * scene.tileW, x1 = rc[1] * scene.tileW;
		scene.particles.push({
			region: id, kind: kindKey,
			x: x0 + Math.random() * (x1 - x0),
			y: Math.random() * scene.H,
			phase: Math.random() * 6.2832,
		});
	},

	updateParticles: function(scene, dt){
		if(!this.on()){ return; }
		var vis = this._visibleRegions();
		// Drift + wrap existing particles within their region band.
		for(var i = scene.particles.length - 1; i >= 0; i--){
			var p = scene.particles[i];
			// Drop particles whose region is no longer ambient (shouldn't happen —
			// regions only unlock — but keeps the pool honest).
			if(vis.indexOf(p.region) < 0){ scene.particles.splice(i, 1); continue; }
			var kind = PARTICLE_KINDS[p.kind];
			p.x += kind.drift[0] * dt;
			p.y += kind.drift[1] * dt;
			var rc = scene.regionCols[p.region];
			var x0 = rc[0] * scene.tileW, x1 = rc[1] * scene.tileW;
			if(p.x < x0){ p.x = x1; } else if(p.x > x1){ p.x = x0; }
			if(p.y < 0){ p.y = scene.H; } else if(p.y > scene.H){ p.y = 0; }
		}
		// Top up toward the per-region target, respecting the global cap.
		var target = Math.min(PARTICLES_MAX, vis.length * PARTICLES_PER_REGION);
		var guard = 0;
		while(scene.particles.length < target && guard++ < PARTICLES_MAX){
			this._spawn(scene, vis[scene.particles.length % vis.length]);
		}
	},
	drawParticles: function(ctx, scene, now){
		if(!this.on()){ return; }
		for(var i = 0; i < scene.particles.length; i++){
			var p = scene.particles[i];
			var kind = PARTICLE_KINDS[p.kind];
			var tw = kind.twinkle ? (0.4 + 0.6 * Anim.pulse(now, kind.twinkle, p.phase)) : 1;
			ctx.globalAlpha = kind.alpha * tw * ATMOSPHERE_INTENSITY;
			ctx.fillStyle = kind.color;
			ctx.fillRect(p.x, p.y, kind.size, kind.size);
		}
		ctx.globalAlpha = 1;
	},
	post: function(ctx, scene, now){
		if(!this.on()){ return; }
		var k = ATMOSPHERE_INTENSITY;
		// Per-region column grade (visible regions only).
		for(var i = 0; i < REGION_ORDER.length; i++){
			var id = REGION_ORDER[i];
			var cfg = ATMOSPHERE[id];
			if(!cfg || !cfg.grade || !state.regions[id]){ continue; }
			var rc = scene.regionCols[id];
			var x0 = rc[0] * scene.tileW, x1 = rc[1] * scene.tileW;
			ctx.globalAlpha = k;
			ctx.fillStyle = cfg.grade;
			ctx.fillRect(x0, 0, x1 - x0, scene.H);
		}
		ctx.globalAlpha = k;
		ctx.fillStyle = this._vignette;
		ctx.fillRect(0, 0, scene.W, scene.H);
		ctx.globalAlpha = 1;
	},
};
