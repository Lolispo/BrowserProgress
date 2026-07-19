# Atmosphere Passes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a layered atmosphere system (cloud shadows, ground shadows, building glow, per-region particles, vignette + color grade) to the top-down village map, delivered as a declarative render-pass module.

**Architecture:** A new `atmosphere.js` exposes a global `Atmosphere` object holding pass functions `(ctx, scene, now)` plus a particle simulation step, driven by three data tables (`ATMOSPHERE`, `GLOW_SOURCES`, `PARTICLE_KINDS`). `scene.draw()` is refactored into an explicit layer stack that calls these passes at fixed z-slots between the existing world and entity draws. Rendering only — no game `state` is read for mutation or written.

**Tech Stack:** Vanilla ES5 (`"use strict"`, `var`), HTML5 Canvas 2D, jQuery (already loaded, not needed here). No build step. Verified via headless Chromium (`browse` skill `$B`) — this repo has **no unit-test framework**, so each task's test cycle is: assert with `$B js` (function/pool existence, console-error count, robust pixel reads) + a screenshot for the visual gate.

## Global Constraints

- **Language:** ES5 only — `var`, no arrow functions, no `let`/`const`, no template literals. Match the existing file style (`// Author Petter Andersson`, `"use strict"` at top).
- **Rendering only:** passes read `scene` geometry + `state.regions` for visibility; they NEVER mutate game `state` and NEVER change the DOM.
- **Master switch:** every pass and the particle sim must early-return when `ATMOSPHERE_INTENSITY === 0`, leaving the game visually identical to today and playing identically.
- **Mobile budget:** particle pool hard-capped at 80; vignette gradient cached (built once, never per-frame).
- **Load order:** `atmosphere.js` MUST be included in `index.html` **before** `scene.js` (scene references the `Atmosphere` global at draw time; include order is the only guarantee since there are no modules).
- **Canvas is fixed size:** 1150×460 (`#canvas1`). `scene.W`/`scene.H` hold these after `init`.
- **Determinism where free:** terrain uses a per-tile hash to avoid shimmer; cloud-shadow positions are computed from `now` (no stored RNG) so they are reproducible and need no mutable state.
- **Verification server:** `python3 -m http.server 8099` from repo root; load `http://localhost:8099/index.html?nodev` (the `?nodev` flag forces the honest zero-resource economy). **After editing any `.js` file, run `$B restart`** before re-testing — headless Chromium serves `<script>` files from memory cache and a `?cb=` only busts `index.html` (stale-code symptom: "X is not defined").

---

## File Structure

| File | Responsibility |
|------|----------------|
| `atmosphere.js` | **new** — the `Atmosphere` object (all pass fns + `updateParticles` + cached vignette) and the `ATMOSPHERE` / `GLOW_SOURCES` / `PARTICLE_KINDS` data tables |
| `variables.js` | add the `ATMOSPHERE_INTENSITY` tuning constant |
| `index.html` | add `<script src="atmosphere.js">` before `scene.js` |
| `scene.js` | layer-stack refactor of `draw()`; `particles` array seeded in `init`; call `Atmosphere.updateParticles` from `update`; cache the vignette in `init` |

**`Atmosphere` public interface (final signatures — every task below must match these exactly):**

```
Atmosphere.initCache(W, H)                 // build + store the vignette gradient; call from scene.init
Atmosphere.cloudShadows(ctx, scene, now)   // layer slot: over terrain, under entities
Atmosphere.groundShadows(ctx, scene, now)  // layer slot: over terrain, under entities
Atmosphere.glow(ctx, scene, now)           // layer slot: over entities (additive)
Atmosphere.updateParticles(scene, dt)      // sim step; call from scene.update
Atmosphere.drawParticles(ctx, scene, now)  // layer slot: over glow, under floaters
Atmosphere.post(ctx, scene, now)           // layer slot: frontmost (grade + vignette)
```

Data tables (defined in `atmosphere.js`, read by the passes):

```
ATMOSPHERE[regionId]   = { grade: <rgbaStringOrNull>, particle: <kindKey> }
GLOW_SOURCES[typeName] = <hexColorString>
PARTICLE_KINDS[kind]   = { drift:[vx,vy], size, color, alpha, twinkle }
```

---

### Task 1: Layer-stack scaffold (no visual change)

Establish `atmosphere.js`, the intensity constant, the include, and refactor `scene.draw()` into the explicit layer stack — with all five atmosphere calls present but pointing at **no-op stubs**. Deliverable: the game looks byte-for-byte identical and throws no errors, but the seams for every later task exist.

**Files:**
- Create: `atmosphere.js`
- Modify: `variables.js` (append constant)
- Modify: `index.html:21-22` (add script tag before `scene.js`)
- Modify: `scene.js` `draw` (lines 655-724) and `init` (lines 79-97)

**Interfaces:**
- Produces: the global `Atmosphere` with all 7 methods as no-op stubs; `ATMOSPHERE_INTENSITY` global; `scene.particles = []`; `scene.draw()` calling the stubs at their slots.

- [ ] **Step 1: Create `atmosphere.js` with stubs and the intensity guard**

```javascript
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

var Atmosphere = {
	_vignette: null,

	// Whole layer off when intensity is 0 (weak devices / A-B compare).
	on: function(){ return typeof ATMOSPHERE_INTENSITY === "number" && ATMOSPHERE_INTENSITY > 0; },

	initCache: function(W, H){ /* Task 4 */ },
	cloudShadows: function(ctx, scene, now){ /* Task 5 */ },
	groundShadows: function(ctx, scene, now){ /* Task 2 */ },
	glow: function(ctx, scene, now){ /* Task 3 */ },
	updateParticles: function(scene, dt){ /* Task 6 */ },
	drawParticles: function(ctx, scene, now){ /* Task 6 */ },
	post: function(ctx, scene, now){ /* Task 4 */ },
};
```

- [ ] **Step 2: Append the intensity constant to `variables.js`**

After line 73 (the `imgTree` alias), add:

```javascript

// Atmosphere layer master intensity (0 = fully off, 1 = designed strength).
// See atmosphere.js. Kept here with the other rendering tuning constants.
var ATMOSPHERE_INTENSITY = 1;
```

- [ ] **Step 3: Include `atmosphere.js` before `scene.js` in `index.html`**

Change lines 21-22 from:

```html
    <script src="anim.js"></script>
    <script src="scene.js"></script>
```

to:

```html
    <script src="anim.js"></script>
    <script src="atmosphere.js"></script>
    <script src="scene.js"></script>
```

- [ ] **Step 4: Seed the particle pool + build the vignette in `scene.init`**

In `scene.js`, inside `init` (after `this.floaters = [];` on line 95, before `this.buildTreeRow();`), add:

```javascript
		this.particles = [];
		Atmosphere.initCache(this.W, this.H);
```

- [ ] **Step 5: Refactor `scene.draw()` into the explicit layer stack**

Replace the body of `draw` (`scene.js:655-724`) so the existing world/entity/floater draws are unchanged but the atmosphere passes are called at their slots. Replace from `draw: function(){` through the terrain/road/fog/gateways/features block down to just before the `// Trees` comment with:

```javascript
	draw: function(){
		var ctx = this.ctx;
		if(!ctx){ return; }
		var now = this.lastTime / 1000;

		// --- WORLD ---------------------------------------------------------
		this.drawTerrain(ctx);
		this.drawRoad(ctx);
		this.drawFog(ctx);
		this.drawGateways(ctx);
		this.drawFeatures(ctx); // Home mining/hunting areas

		// --- GROUND FX (over terrain, under entities) ----------------------
		Atmosphere.cloudShadows(ctx, this, now);
		Atmosphere.groundShadows(ctx, this, now);

```

Then leave the existing Trees / Buildings / Villagers blocks (lines 668-710) exactly as-is, and **after the villagers loop closes (line 710) but before the `// Floaters` block (line 712)**, insert:

```javascript
		// --- OVER-ENTITY FX ------------------------------------------------
		Atmosphere.glow(ctx, this, now);
		Atmosphere.drawParticles(ctx, this, now);

```

Finally, at the very end of `draw`, after `ctx.globalAlpha = 1;` (line 723) and before the closing `},`, insert:

```javascript

		// --- POST (frontmost) ----------------------------------------------
		Atmosphere.post(ctx, this, now);
```

- [ ] **Step 6: Call the particle sim from `scene.update`**

In `scene.js` `update` (lines 419-444), after the floaters loop closes (line 443, `}` ending the `for` over floaters) and before `update`'s closing `},` (line 444), add:

```javascript
		Atmosphere.updateParticles(this, dt);
```

- [ ] **Step 7: Verify no visual change and no errors**

```bash
python3 -m http.server 8099 >/dev/null 2>&1 &
$B restart
$B open "http://localhost:8099/index.html?nodev"
$B js "typeof Atmosphere.post + ' ' + typeof ATMOSPHERE_INTENSITY + ' ' + Array.isArray(scene.particles)"
$B js "window.__errs = window.__errs || []; window.addEventListener('error', function(e){__errs.push(''+e.message)}); '(listener installed)'"
$B screenshot task1-baseline.png
```

Expected: the `$B js` line prints `function number true`. Screenshot is a normal village map (identical to before). Console shows no errors.

- [ ] **Step 8: Commit**

```bash
git add atmosphere.js variables.js index.html scene.js
git commit -m "feat(atmosphere): layer-stack scaffold + no-op pass module"
```

---

### Task 2: Ground shadows

A soft ellipse under every building and villager base. Biggest "grounds the art" win; zero data-table dependency.

**Files:**
- Modify: `atmosphere.js` (`Atmosphere.groundShadows`)

**Interfaces:**
- Consumes: `scene.buildings[i]` `{img, x, y}`, `scene.villagers[i]` `{x, y}`, `scene.spriteW(img)`, `scene.spriteH(img)`, global `imgVillager`, `ATMOSPHERE_INTENSITY`.
- Produces: `Atmosphere.groundShadows` drawing under-sprite ellipses.

- [ ] **Step 1: Establish the failing assertion**

With the Task 1 build still served, confirm the pass is currently a no-op:

```bash
$B restart
$B open "http://localhost:8099/index.html?nodev"
$B js "Atmosphere.groundShadows.toString().indexOf('ellipse') >= 0"
```

Expected: `false` (stub has no drawing yet).

- [ ] **Step 2: Implement `Atmosphere.groundShadows`**

Replace the `groundShadows` stub in `atmosphere.js` with:

```javascript
	// A soft contact shadow under each building + villager base, so sprites sit
	// on the ground instead of floating. Ellipse at the sprite's bottom-centre.
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
```

- [ ] **Step 3: Verify the shadow renders + no errors**

```bash
$B restart
$B open "http://localhost:8099/index.html?nodev"
$B js "Atmosphere.groundShadows.toString().indexOf('ellipse') >= 0"
$B js "scene.addVillager(); scene.addBuilding('lumberMill', {animate:false}); 'entities added'"
$B screenshot task2-shadows.png
```

Expected: first `$B js` now `true`. Screenshot shows dark soft ellipses beneath buildings and villagers; no console errors.

- [ ] **Step 4: Verify the master switch disables it**

```bash
$B js "ATMOSPHERE_INTENSITY = 0; '(off)'"
$B screenshot task2-off.png
$B js "ATMOSPHERE_INTENSITY = 1; '(on)'"
```

Expected: `task2-off.png` has no shadows (matches Task 1 baseline look).

- [ ] **Step 5: Commit**

```bash
git add atmosphere.js
git commit -m "feat(atmosphere): soft ground shadows under buildings + villagers"
```

---

### Task 3: Building glow

An additive radial halo on each built `GLOW_SOURCES` type (monument, blacksmith, market).

**Files:**
- Modify: `atmosphere.js` (`Atmosphere.glow`)

**Interfaces:**
- Consumes: `scene.buildings`, `scene.spriteW/spriteH`, `GLOW_SOURCES`, `Anim.oscillate`, `ATMOSPHERE_INTENSITY`. `Anim` is a global from `anim.js` (loaded before `atmosphere.js`).
- Produces: `Atmosphere.glow`.

- [ ] **Step 1: Establish the failing assertion**

```bash
$B restart
$B open "http://localhost:8099/index.html?nodev"
$B js "Atmosphere.glow.toString().indexOf('lighter') >= 0"
```

Expected: `false`.

- [ ] **Step 2: Implement `Atmosphere.glow`**

Replace the `glow` stub with:

```javascript
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
```

- [ ] **Step 3: Verify glow renders on a glow-source building**

```bash
$B restart
$B open "http://localhost:8099/index.html?nodev"
$B js "Atmosphere.glow.toString().indexOf('lighter') >= 0"
$B js "scene.addBuilding('monument', {animate:false}); scene.revealRegion('cavern'); 'monument built'"
$B screenshot task3-glow.png
```

Expected: first line `true`. Screenshot shows a purple halo around the monument; `ctx.globalCompositeOperation` is restored (no additive bleed on later frames — confirm the rest of the map looks normal). No console errors.

- [ ] **Step 4: Commit**

```bash
git add atmosphere.js
git commit -m "feat(atmosphere): additive glow halo on landmark buildings"
```

---

### Task 4: Vignette + per-region color grade (POST)

A cached edge-darkening vignette plus a per-region column tint from `ATMOSPHERE[region].grade`, drawn frontmost. Only visible (unfogged) regions are graded.

**Files:**
- Modify: `atmosphere.js` (`Atmosphere.initCache`, `Atmosphere.post`)

**Interfaces:**
- Consumes: `scene.W/H`, `scene.tileW`, `scene.regionCols[id]`, `REGION_ORDER`, `state.regions[id]`, `ATMOSPHERE`, `ATMOSPHERE_INTENSITY`. `REGION_ORDER`, `REGIONS`, `state` are globals from `data/registry.js`.
- Produces: `Atmosphere._vignette` (a `CanvasGradient`), `Atmosphere.post`.

- [ ] **Step 1: Establish the failing assertion**

```bash
$B restart
$B open "http://localhost:8099/index.html?nodev"
$B js "Atmosphere._vignette === null"
```

Expected: `false` is what we WANT after the fix; right now `initCache` is a stub so this prints `true`. (Failing state = `true`.)

- [ ] **Step 2: Implement `initCache` + `post`**

Replace the `initCache` and `post` stubs with:

```javascript
	// Build the edge-darkening vignette once (canvas is fixed-size, so it never
	// needs rebuilding). Transparent centre -> dark corners.
	initCache: function(W, H){
		// Built on a scratch canvas context because initCache runs during
		// scene.init, when the module-global `ctx` may not yet be assigned.
		var c = document.createElement("canvas");
		var gctx = c.getContext("2d");
		var grad = gctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.62);
		grad.addColorStop(0, "rgba(0,0,0,0)");
		grad.addColorStop(1, "rgba(0,0,0,0.38)");
		this._vignette = grad;
		this._vw = W; this._vh = H;
	},

	// Frontmost pass: per-region colour grade over visible regions, then the
	// vignette on top. Grade unifies each area's palette; vignette focuses the eye.
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
```

Note: the vignette gradient is created on a scratch canvas context because `initCache` runs during `scene.init` when the module-global `ctx` may not yet be assigned. A `CanvasGradient` is portable across 2D contexts of the same document, so the scratch-built gradient draws correctly on `#canvas1`.

- [ ] **Step 3: Verify vignette darkens the corners more than the centre**

```bash
$B restart
$B open "http://localhost:8099/index.html?nodev"
$B js "Atmosphere._vignette === null"
$B js "var c=document.getElementById('canvas1'),g=c.getContext('2d'); var corner=g.getImageData(3,3,1,1).data, mid=g.getImageData(575,230,1,1).data; (corner[0]+corner[1]+corner[2]) < (mid[0]+mid[1]+mid[2])"
$B screenshot task4-vignette.png
```

Expected: first line `false` (vignette built). Second line `true` (corner darker than centre — objective vignette check). Screenshot shows darkened edges + subtle per-region tint. No console errors.

- [ ] **Step 4: Verify the cavern grade only applies once revealed**

```bash
$B js "state.regions.cavern"
$B js "scene.revealRegion('cavern'); '(cavern revealed)'"
$B screenshot task4-cavern-grade.png
```

Expected: before reveal the cavern columns stay under fog (no purple grade leaking through); after reveal the cavern band gets its purple tint.

- [ ] **Step 5: Commit**

```bash
git add atmosphere.js
git commit -m "feat(atmosphere): cached vignette + per-region colour grade"
```

---

### Task 5: Cloud-shadow drift

3 large soft dark ellipses translating slowly across the map (the top-down replacement for HK's parallax sky). Stateless — positions computed from `now`.

**Files:**
- Modify: `atmosphere.js` (`Atmosphere.cloudShadows`, add a `CLOUDS` const)

**Interfaces:**
- Consumes: `scene.W/H`, `ATMOSPHERE_INTENSITY`, `now`.
- Produces: `Atmosphere.cloudShadows`, module-const `CLOUDS`.

- [ ] **Step 1: Establish the failing assertion**

```bash
$B restart
$B open "http://localhost:8099/index.html?nodev"
$B js "Atmosphere.cloudShadows.toString().indexOf('createRadialGradient') >= 0"
```

Expected: `false`.

- [ ] **Step 2: Add the `CLOUDS` table + implement `cloudShadows`**

Add near the other data tables (after `PARTICLE_KINDS`) in `atmosphere.js`:

```javascript
// Drifting cloud shadows: the top-down stand-in for a parallax sky. Each cloud's
// x is derived from `now` (no stored state); yF/rxF/ryF are fractions of canvas.
var CLOUDS = [
	{ yF: 0.20, rxF: 0.34, ryF: 0.22, speed: 14, offset: 0.0,  alpha: 0.10 },
	{ yF: 0.55, rxF: 0.42, ryF: 0.26, speed: 9,  offset: 0.45, alpha: 0.08 },
	{ yF: 0.80, rxF: 0.30, ryF: 0.18, speed: 20, offset: 0.75, alpha: 0.09 },
];
```

Replace the `cloudShadows` stub with:

```javascript
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
```

- [ ] **Step 3: Verify clouds render and move over time**

```bash
$B restart
$B open "http://localhost:8099/index.html?nodev"
$B js "Atmosphere.cloudShadows.toString().indexOf('createRadialGradient') >= 0"
$B screenshot task5-clouds-a.png
$B js "var t0=scene.lastTime; scene.lastTime += 3000; 'advanced clock 3s'"
$B screenshot task5-clouds-b.png
```

Expected: first line `true`. The two screenshots show the soft dark cloud dapples in **different positions** (they drift). No console errors.

- [ ] **Step 4: Commit**

```bash
git add atmosphere.js
git commit -m "feat(atmosphere): drifting cloud shadows (top-down ambient motion)"
```

---

### Task 6: Per-region particles

A capped pool of drifting motes/spores/etc., one kind per visible region, topped up each frame and wrapped within its region's column band. Uses the same array/splice pattern as `scene.floaters`.

**Files:**
- Modify: `atmosphere.js` (`Atmosphere.updateParticles`, `Atmosphere.drawParticles`, helpers + tunables)

**Interfaces:**
- Consumes: `scene.particles` (seeded `[]` in Task 1), `scene.W/H`, `scene.tileW`, `scene.regionCols[id]`, `REGION_ORDER`, `state.regions[id]`, `ATMOSPHERE`, `PARTICLE_KINDS`, `Anim.pulse`, `ATMOSPHERE_INTENSITY`.
- Produces: `Atmosphere.updateParticles`, `Atmosphere.drawParticles`.

- [ ] **Step 1: Establish the failing assertion**

```bash
$B restart
$B open "http://localhost:8099/index.html?nodev"
$B js "scene.particles.length"
```

Expected: `0` (sim is still a stub — pool never fills). We want it > 0 after the fix.

- [ ] **Step 2: Add tunables + implement the sim and draw**

Add near the top of `atmosphere.js` (after `PARTICLE_KINDS`):

```javascript
// Particle pool sizing. Per visible region we aim for PER_REGION, hard-capped
// globally at MAX so mobile stays smooth.
var PARTICLES_PER_REGION = 16;
var PARTICLES_MAX = 80;
```

Replace the `updateParticles` and `drawParticles` stubs with:

```javascript
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
```

- [ ] **Step 3: Verify particles populate (home visible by default) + respect the cap**

```bash
$B restart
$B open "http://localhost:8099/index.html?nodev"
$B js "scene.particles.length > 0"
$B js "scene.revealRegion('hills'); scene.revealRegion('mountains'); scene.revealRegion('cavern'); '(all revealed)'"
$B js "var kinds={}; scene.particles.forEach(function(p){kinds[p.kind]=1}); Object.keys(kinds).sort().join(',')"
$B js "scene.particles.length <= 80"
$B screenshot task6-particles.png
```

Expected: pool `> 0`; after revealing all regions the distinct kinds include `dust,leaf,snow,spore`; pool `<= 80`. Screenshot shows drifting motes over each region (purple spores in the cavern). No console errors.

- [ ] **Step 4: Verify the master switch stops the sim**

```bash
$B js "ATMOSPHERE_INTENSITY = 0; scene.particles.length = 0; scene.particles.length"
$B js "ATMOSPHERE_INTENSITY = 0; var n0=scene.particles.length; scene.lastTime+=100; n0"
$B js "ATMOSPHERE_INTENSITY = 1; '(restored)'"
```

Expected: with intensity 0 the pool does not refill (stays 0 across frames). Restore to 1 after.

- [ ] **Step 5: Commit**

```bash
git add atmosphere.js
git commit -m "feat(atmosphere): per-region drifting particles with capped pool"
```

---

### Task 7: Full-scene verification + design doc status

Confirm the whole atmosphere layer reads well together at intensity 1, plays identically at 0, and mark the spec accepted.

**Files:**
- Modify: `docs/superpowers/specs/2026-07-19-atmosphere-passes-design.md` (status line)

- [ ] **Step 1: Full-suite visual check with everything unlocked**

```bash
$B restart
$B open "http://localhost:8099/index.html?nodev"
$B js "['hills','mountains','cavern'].forEach(function(r){scene.revealRegion(r)}); scene.addBuilding('monument',{animate:false}); scene.addBuilding('blacksmith',{animate:false}); scene.addVillager(); scene.addVillager(); '(scene populated)'"
$B screenshot task7-full-on.png
$B js "ATMOSPHERE_INTENSITY = 0; '(off)'"
$B screenshot task7-full-off.png
$B js "ATMOSPHERE_INTENSITY = 1; '(on)'"
```

Expected: `task7-full-on.png` shows shadows + clouds + glow + particles + vignette/grade composited cleanly; `task7-full-off.png` matches the pre-atmosphere baseline. No console errors in either state.

- [ ] **Step 2: Confirm no game-logic regression**

```bash
$B js "var before = state.wood; dispatchAction('chopWood'); 'dispatched, wood before=' + before"
$B js "typeof state.regions.home + ' ' + typeof scene.draw + ' ' + (typeof updateGoal === 'function')"
```

Expected: dispatch works (a villager is sent — atmosphere never touched `state` or the action pipeline); globals intact.

- [ ] **Step 3: Mark the spec accepted**

In `docs/superpowers/specs/2026-07-19-atmosphere-passes-design.md`, change:

```markdown
**Status:** design, awaiting review
```

to:

```markdown
**Status:** implemented
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-07-19-atmosphere-passes-design.md
git commit -m "docs(atmosphere): mark design spec implemented"
```

---

## Self-Review

**Spec coverage:**
- Layer stack (8 slots) → Task 1 (`draw` refactor). ✅
- Cloud shadows → Task 5. ✅
- Ground shadows → Task 2. ✅
- Building glow (`GLOW_SOURCES`) → Task 3. ✅
- Particles (`ATMOSPHERE`+`PARTICLE_KINDS`, floaters pattern, cap) → Task 6. ✅
- Vignette (cached) + per-region grade → Task 4. ✅
- `atmosphere.js` new module, `index.html` include before `scene.js`, `variables.js` `ATMOSPHERE_INTENSITY`, `scene.js` particles array + `updateParticles` + init cache → Tasks 1, 4, 6. ✅
- Success criteria: master-switch off = identical (verified Tasks 2,4,6,7); one-row extensibility (data tables in Task 1); no state mutation (Task 7 Step 2); mobile cap (Task 6). ✅

**Placeholder scan:** No TBD/TODO; every code step has complete code. The only intentionally-inert line (`initCache` first line) is annotated with why. ✅

**Type consistency:** Method names match the interface block everywhere — `initCache`, `cloudShadows`, `groundShadows`, `glow`, `updateParticles`, `drawParticles`, `post`, `_hexToRgba`, `_visibleRegions`, `_spawn`. `scene.particles` seeded in Task 1, consumed in Task 6. `ATMOSPHERE`/`GLOW_SOURCES`/`PARTICLE_KINDS`/`CLOUDS`/`PARTICLES_PER_REGION`/`PARTICLES_MAX` all defined before use. Draw-call order in `scene.draw` matches the 8-slot stack. ✅
