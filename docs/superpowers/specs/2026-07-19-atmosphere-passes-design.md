# Atmosphere Passes — Layered Ambience for the Village Map

**Status:** implemented
**Date:** 2026-07-19
**Depends on:** the tile-world + region system (`scene.js`, `data/registry.js` `REGIONS`,
`terrainPalette`). This is a **rendering-only** addition — game logic/state is untouched.

## Problem

The map renders as a single flat painter's-order pass (`scene.draw`): terrain,
entities, floaters — all in one plane, no depth, no ambient life beyond the
villager bob. It reads as "correct but static." Goal: borrow the *atmosphere*
techniques that make Hollow Knight's world feel alive — depth, drifting motion,
localized light, unified per-area color — adapted honestly to a **top-down,
single-screen, camera-less, canvas-2D** game.

## What we deliberately are NOT doing

- **No parallax sky layer.** HK's signature background is a *side-view horizon*
  (sky gradient + parallax silhouettes). Our map is **top-down** — `drawTerrain`
  fills all rows, there is no sky to render into. The top-down/RTS equivalent of
  "ambient background motion" is **drifting cloud shadows**, which is what we build
  instead.
- **No real lighting/shaders.** Canvas 2D has no shader stage. Glow is *faked* with
  radial gradients + `globalCompositeOperation`. No WebGL rewrite.
- **No sprite frame animation, no minimap** (out of scope; no camera).

## Decisions (locked via brainstorming)

- **Full suite** delivered as a **declarative render-pass system**, not inline
  code — adding an effect is a table row, mirroring the `SPRITES` manifest and
  `anim.js` primitive philosophy.
- **Region-driven** — passes read a per-region `ATMOSPHERE` table keyed off the
  existing `REGIONS` ids, so mood ties into the region the player is looking at.
- **New module `atmosphere.js`** holds the passes + data tables, keeping the
  already-large `scene.js` (~725 lines) from growing further and matching the
  one-module-per-concern style (`anim.js`, `bars.js`, …).

## Architecture — an explicit layer stack

`scene.draw()` today is a flat sequence of nine calls. Refactor it into an
**ordered layer stack**; existing draws slot in unchanged, the five atmospheric
passes take named z-slots (back → front):

```
TERRAIN        ← existing (terrain / road / fog / gateways / features)
CLOUD_SHADOWS  ← NEW  drifting soft dark blobs (ambient motion)
GROUND_SHADOWS ← NEW  soft ellipse under each building/villager base
ENTITIES       ← existing (trees, buildings, villagers)
GLOW           ← NEW  additive halo on glow-source buildings ('lighter')
PARTICLES      ← NEW  per-region motes / spores / embers, drifting
FLOATERS       ← existing (floating text)
POST           ← NEW  per-region color grade + vignette
```

The atmospheric passes live in `atmosphere.js` as functions of the form
`pass(ctx, scene, now)` (pure of game state; they only read `scene`). `scene.draw`
calls them at the slots above. A global `ATMOSPHERE_INTENSITY` (in `variables.js`)
scales all passes; `0` disables the entire layer for weak devices.

## Data tables (the "one row = new mood" payoff)

In `atmosphere.js`:

```js
// Per-region ambience, keyed off REGIONS ids.
var ATMOSPHERE = {
  home:      { grade: null,                    particle: "leaf"  },
  hills:     { grade: "rgba(201,179,126,.10)", particle: "dust"  },
  mountains: { grade: "rgba(150,160,170,.12)", particle: "snow"  },
  cavern:    { grade: "rgba(90,60,120,.20)",   particle: "spore" },
};

// Buildings that emit an additive glow halo.
var GLOW_SOURCES = { monument: "#9b6dc9", blacksmith: "#ff7a1a", market: "#c9a227" };

// Particle kinds — defined once, like anim.js primitives.
// drift = px/s vector, size px, color, alpha, twinkle freq (0 = steady).
var PARTICLE_KINDS = {
  leaf:  { drift: [ 8,  6], size: 3, color: "#6a3", alpha: 0.5, twinkle: 0 },
  dust:  { drift: [ 5,  2], size: 2, color: "#d8c48a", alpha: 0.35, twinkle: 0 },
  snow:  { drift: [-4,  8], size: 2, color: "#eef", alpha: 0.7, twinkle: 0 },
  spore: { drift: [ 3, -5], size: 2, color: "#c9a7ff", alpha: 0.6, twinkle: 4 },
  ember: { drift: [ 2, -9], size: 2, color: "#ff9a3a", alpha: 0.8, twinkle: 6 },
};
```

Only **visible (claimed/unfogged) regions** emit particles/grade, so locked regions
stay dark under their fog.

## The five passes, concretely

1. **Cloud shadows** — 3–4 large soft ellipses (`radialGradient` transparent→dark,
   low alpha), each translating on a slow constant vector, wrapping around the
   canvas. Drawn over terrain, under entities, so it dapples the ground. ~25 lines.
2. **Ground shadows** — before each entity sprite draws, a low-alpha ellipse at the
   sprite's base center. Implemented as a pass that iterates `scene.buildings` +
   `scene.villagers` and reads their existing `x/y` + sprite dims. The single
   biggest "grounds the art" win; classic RTS look.
3. **Building glow** — for each built type in `GLOW_SOURCES`, a radial gradient in
   the glow color centered on the sprite, drawn with `globalCompositeOperation =
   'lighter'` (restored to `'source-over'` after). Monument + forge glow.
4. **Particles** — a lightweight `scene.particles` array using the **same
   update/splice pattern as `scene.floaters`**. Emitters (one per visible region)
   top the pool up toward a per-region target count from `ATMOSPHERE` +
   `PARTICLE_KINDS`; each particle drifts by its vector, optionally twinkles
   (`Anim.pulse`), and respawns on the opposite edge when it exits. Total pool
   capped (~50–80) for mobile.
5. **Vignette + grade** — a **cached** radial `CanvasGradient` (built once in
   `scene.init`, since the 1150×460 canvas is fixed-size) drawn edge-darkening each
   frame; plus per-region-column tint `fillRect`s from `ATMOSPHERE[region].grade`
   over each visible region's column span. Focuses the eye, unifies palette.

## Data flow

- `scene.init` → builds + caches the vignette gradient; seeds `scene.particles = []`.
- `scene.update(dt)` → new `updateParticles(dt)` step (drift, twinkle, wrap, top-up)
  alongside the existing tree/villager/floater updates.
- `scene.draw()` → iterates the layer stack, calling `Atmosphere.*` passes at their
  slots. Passes read `scene` state; they never mutate game `state`.
- Region visibility read from the existing `state.regions[id]` (same source the fog
  and road already use).

## Performance

- Vignette gradient cached (not rebuilt per frame).
- Cloud shadows: 3–4 ellipses/frame.
- Particles: hard cap ~80; each is a `fillRect`/small arc.
- Per-region grade: ≤4 `fillRect`s.
- `ATMOSPHERE_INTENSITY = 0` short-circuits every pass. Target: no measurable frame
  cost on mobile landscape (the existing rotate-hint target platform).

## Files touched

| File | Change |
|------|--------|
| `atmosphere.js` | **new** — passes + `ATMOSPHERE` / `GLOW_SOURCES` / `PARTICLE_KINDS` tables |
| `index.html` | add `<script src="atmosphere.js">` **before** `scene.js` |
| `scene.js` | layer-stack refactor of `draw()`; add `particles` array + `updateParticles`; cache vignette in `init`; call `Atmosphere.*` passes |
| `variables.js` | add `ATMOSPHERE_INTENSITY` tuning constant |

## Success criteria

- The map gains visible ambient motion (clouds drift), grounded sprites (shadows),
  glowing landmark buildings, per-region drifting particles, and an edge vignette +
  per-region color grade — **without** touching game logic/state.
- Adding a new region's mood, a new glow source, or a new particle kind is a
  **single table entry** in `atmosphere.js`.
- `ATMOSPHERE_INTENSITY = 0` fully disables the layer; game still plays identically.
- No frame-rate regression on mobile landscape.
