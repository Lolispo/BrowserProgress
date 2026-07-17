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

**Design spec:** [`docs/superpowers/specs/2026-07-12-phase3-core-loop-design.md`](docs/superpowers/specs/2026-07-12-phase3-core-loop-design.md)

One tight loop: grow the village → meet a scout requirement → scout a new region
(timed, costs villagers' time) → gain its new gating resource → build the next-tier
buildings → grow more → build the **Monument** to win. Chain:
`wood/iron/food (Home) → stone (Hills) → gold (Mountains) → crystal (Cavern) → Monument`.

### Sub-phases (each independently verifiable + committable)
- [x] **3a — Regions & resources scaffold:** `state` for stone/gold/crystal + `regions`,
      `REGIONS` registry, inventory labels, canvas region zones (tints + fog + labels),
      per-region building placement, `scene.revealRegion`. Verified in browser.
- [x] **3b — Scouting:** `SCOUTS` registry + scout bars (reuse `TimeBar` with a
      `rawTime` flag for real-ms duration); appear once the gate building exists;
      occupy N villagers, return on done; completion claims the region + unfogs its
      zone. Verified end-to-end (real click: Hills scouted → claimed).
- [x] **3c — New buildings & jobs:** Quarry (Mason→stone), Farm (+housing/+food),
      Blacksmith (−tool wear, +gather), Market (Trader→gold). Region-gated shop
      visibility. Verified: chain Hills→buildings→Mountains scout→Market, passive
      production (+2 stone/+1 gold/+2 food per tick), Blacksmith 5→3 wear / 10→12 gather.
      *(Bootstrap fix vs spec: Quarry costs wood+iron, not stone.)*
- [x] **3d — Monument & win:** crystal source (hand-mined "Mine Crystal" action bar,
      revealed on Cavern claim), Monument building (mixed all-region cost), and a
      victory overlay with a Keep Playing button. Verified end-to-end.
- [~] **3e — Balance pass:** first-pass cuts applied to the grindy Phase-3 numbers
      (mason 2→3/tick, trader 1→2/tick, market 1200→800 stone, blacksmith 500→400,
      farm 200→150, Monument cost cut across the board, crystal mine 8s→6s, cavern
      scout 15→12 villagers). Use `?nodev` to playtest and refine to feel — ongoing.

---

## Improvements pass (post-Phase-3)

- [x] Persistence: localStorage save/load + auto-save + Reset button.
- [x] Number formatting (12.3k / 2M).
- [x] Building counts (×N) on shop buttons.
- [x] Action bars grey out when their requirements aren't met.
- [x] Monument goal tracker (materials have/need, locked resources masked).
- [x] Scout discovery: fogged regions show which building unlocks scouting
      ("Build a Mine to scout" → "Scout it in Expeditions"); scout bars grey out
      until you have the villagers. Action hints moved to hover tooltips; the
      static bottom-right Information block removed.
- [ ] Real sprite art for stone/gold/crystal nodes + the 5 placeholder-box
      buildings (needs image assets; canvas-drawn icons are an option).
- [ ] Audio for actions (needs audio assets).

## Planned: Tile-based world + living road

**Design spec:** [`docs/superpowers/specs/2026-07-17-tile-world-design.md`](docs/superpowers/specs/2026-07-17-tile-world-design.md)

Render the world as a tile grid with procedural per-region terrain, connected by
a road that physically extends as each region is scouted (gateways at borders).
Rendering redesign of `scene.js`; game logic untouched. Sub-phases T1 terrain →
T2 road + gateways → T3 snap entities → T4 polish.

- [ ] T1 — Tile grid + procedural terrain replacing the flat bands.
- [ ] T2 — Living road + gateways; road extends on claim; hint at the gateway.
- [ ] T3 — Snap buildings / trees / villagers onto the grid.
- [ ] T4 — Polish (villagers walk the road, paving animation, prop tiles).

## Visual / HUD polish

- [x] Village-ledger HUD theme for the top chrome + buy menu: parchment panels,
      grass-green accent headers, resource numbers colored to match the on-map
      "+N" floaters, tactile buy list with affordable/locked/greyed states.
      (style.css now loads after Bootstrap so custom rules win.)
- [ ] Extend the panel theme to the right column (Action Messages + Goal) and
      frame the canvas to match.
- [ ] Offer alternate skins — theme is centralized in CSS variables, so a
      modern / cozy-night / playful reskin is a quick swap. Confirm direction.
- [ ] Push progress bars + typography further (heading face, bar detailing).
- [ ] Move the inline `width: 25%` column styles out of index.html into CSS
      (layout still depends on those inline widths; carried over from Phase 1).

## Later / deluxe (not scheduled)

- [ ] Balance 3e: playtest via `?nodev` and tune costs/rates to feel; add an
      early-game safety net if the opening drags.
- [ ] Optional highscore / speedrun timer.
- [ ] Replace text resource labels with icons.
- [ ] Responsive / mobile layout (top is a fixed 4-column grid; canvas is a
      fixed 1150px — desktop-only today).
- [ ] Replayability: prestige/ascension, achievements, random events.
- [ ] Full canvas width: buildings still cluster in the left of each region
      zone; spread them to use the space better.
