# BrowserProgress — Roadmap

A living checklist for restructuring the game and building it toward a real gameplay
loop. Phases are ordered by dependency: each one leans on the one before it. Check
items off as they land; delete stale notes as they're absorbed into code.

> **North star:** the village is the progression surface. Resources exist to feed
> **village growth** (population/building milestones, new tiers) and **expansion**
> (unlock new map regions with richer nodes). The animated map is where both are felt.

---

## Phase 0 — Ship an honest build (deploy without debug) ✅

Goal: the deployed game starts at zero, while local dev keeps its resource sandbox.

- [x] Replace the hardcoded `developer = true` flag (`variables.js`) with host detection:
      `true` only on `localhost` / `127.0.0.1` / `file://`, `false` on GitHub Pages.
- [x] Verify the live build starts with 0 wood/iron/food and the local build still
      gets the sandbox top-up. *(Verified in headless browser: localhost → true/100000;
      deployed host logic → false.)*

---

## Phase 1 — Data-driven registry + tooltips (the "steering" pass) ✅ (mostly)

Goal: one source of truth for every action, building, and shop item. Fixes the
structure (globals + `eval()` + 10× copy-pasted handlers) and makes tooltips fall out
for free. This is the foundation everything else reads from.

Landed in `data/registry.js` (state + `ACTIONS` + `SHOP_ITEMS` + `SHOP_NAV`) and
`tooltips.js`; `bars.js`/`shops.js`/`jobs.js`/`energy.js`/`script.js` rewritten as thin
renderers. Verified end-to-end in the browser (actions, buys, builds, jobs, tooltips,
affordability). Fixed two latent bugs along the way: `#axe` rendered "Axe: Axe: 1", and
the spear label said "130 spear" instead of "130 wood".

### Core structure
- [x] Central `state` object replacing scattered globals in `variables.js`.
- [x] Killed the `eval()`-on-variable-names clickability check — requirements are data.
- [x] Registries: `ACTIONS` (7 bars), `SHOP_ITEMS` (10, incl. buildings), `SHOP_NAV`.
- [x] Rewrote `bars.js` / `shops.js` / `jobs.js` to render from the registries.

### Tooltips (render from registry)
- [x] Hover tooltips on every action + shop item, generated from registry data
      (authored sentence + auto "Requires:" footer). New floating `#tooltipBox`.
- [x] Jobs hover: explains you need to build a LumberMill/Mine/HuntingLodge.

### Cost/affordability feedback (also falls out of data)
- [x] Grey out shop items when unaffordable (`.unaffordable`).
- [x] Main-shop category buttons highlight when they contain something affordable.
- [ ] Recolor action bars by whether requirements are met (equipment + energy).
      *(Energy-based bar recolour still lives in `energy.js`; unify with requires later.)*

### Absorbed from the old TODO wall (comment block now deleted from script.js)
- [x] Round resource gains (strength-scaled) to whole numbers.
- [x] Old TODO wall removed from `script.js` (folded into this roadmap).
- [ ] Hide things until relevant (e.g. no jobs column until first villager/building).
- [ ] Show counts of special buildings (e.g. "LumberMill: 1") in the interface.
- [ ] Shop items stay hidden until you have ~half the price, then always visible.
- [ ] Move remaining inline `width`/style attrs out of `index.html` into `style.css`.

---

## Phase 2 — Animated game screen (rAF render loop + sprite scene) ✅

Goal: replace the draw-once canvas with a real frame loop so the map feels alive.

Landed in `scene.js`: a `requestAnimationFrame` loop over a small scene graph
(buildings / villagers / trees / floaters). Shop `onBuy` pushes entities via
`scene.addBuilding` / `scene.addVillager` instead of drawing once; actions and job
income spawn effects via `scene.chopWoodFx` / `scene.gainFx`. Sprites draw at 2×
(`SPRITE_SCALE`). Verified in the browser (entities spawn, villagers retarget on job
assignment and walk, trees deplete + regrow, floaters render, no console errors).

- [x] Replaced the one-shot draw with a `requestAnimationFrame` loop.
- [x] Entities are objects with position + state; the loop redraws each frame.
- [x] Villagers walk to their job buildings when assigned (wander when unemployed).
- [x] Floating "+N resource" text pops on manual actions and passive income.
- [x] Trees deplete when chopped and regrow over time.
- [x] Subtle idle bob on buildings and working villagers.
- [x] Auto-layout of buildings by lane (removed hardcoded per-type coordinates).
- [x] 2× sprite scaling so the ~20px art reads as a real village.

### Phase 2 follow-ups (polish)
- [x] Spread building lanes horizontally (staggered per-type start x).
- [x] Villager spacing so workers line up beside a shared building (slot index).
- [x] Lane wrap when a type's row runs off the right edge.
- [x] Calmer idle wander for unemployed villagers (home anchor + rest pauses).
- [ ] Use the full canvas width — the settlement still sits in the left portion.
      *(Really a Phase 3 concern: expansion fills the map, so deferred.)*

---

## Phase 3 — Core gameplay loop (expansion + village-growth milestones)

Goal: the pull. Give resources somewhere to go and a reason to want more.

### Village growth & milestones
- [ ] Milestone system: population/building thresholds unlock new tiers.
- [ ] New tiers (from old TODO): Blacksmith, Farm, big housing, Trading Post.
- [ ] Job-building prerequisites (e.g. N villagers required for advanced buildings).

### Expansion / exploration
- [ ] Spend resources to unlock new map regions with richer resource nodes.
- [ ] The map grows on the Phase 2 canvas as regions unlock.
- [ ] (Stretch) Gold currency + trading post/caravans as a resource sink.

---

## Later / deluxe (not scheduled)

- [ ] Save/load progress (localStorage).
- [ ] Reset button; optional highscore / "finish" goal.
- [ ] Balance passes (early-game safety net, speed ratios, energy costs).
- [ ] Audio for actions (maybe).
- [ ] Replace text resource labels with icons.
