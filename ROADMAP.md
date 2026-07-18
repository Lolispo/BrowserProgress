# BrowserProgress — Roadmap

A living checklist for restructuring the game and building it toward a real gameplay
loop. Phases are ordered by dependency: each one leans on the one before it. Check
items off as they land; delete stale notes as they're absorbed into code.

> **North star:** the village is the progression surface. Resources exist to feed
> **village growth** (population/building milestones, new tiers) and **expansion**
> (unlock new map regions with richer nodes). The animated map is where both are felt.

## Outstanding — pick up here

The core loop, animated tile map, villager actor model (A1–A3 + map A4), and the
HUD redesign (UI-1) all shipped. Biggest leftovers, roughly by value:

1. **Balance / pacing pass** — a coordinated opening pass shipped (faster villagers,
   higher early yields, cheaper first buildings): time-to-first-LumberMill ~8min →
   ~3min. Remaining: the wood trek is still ~80% of each trip (a layout fix, not
   numbers). See the Balance section.
2. **A4 remainder** — unify scouts onto the villager model; add resource-area nodes
   for Hills/Mountains/Cavern (stone/gold/crystal) like Home's Mine/Hunt.
3. **UI-2 — sector views** — a wider world you switch/pan between (view one sector).
   Plus: remove the map's letterbox bands.
4. **Art & animation** — villager walking animation; nicer sprites/icons throughout.
5. **Smaller** — shop-items-hidden-until-affordable, alternate skins, fuller keyboard
   play, responsive/mobile, prestige/achievements/events.

Detail for each lives in the phase sections below.

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
- [x] Action bars grey out when requirements aren't met / no worker is free
      (`refreshBarStates`).

### Absorbed from the old TODO wall (comment block now deleted from script.js)
- [x] Round resource gains (strength-scaled) to whole numbers.
- [x] Old TODO wall removed from `script.js` (folded into this roadmap).
- [x] Show counts of special buildings (×N on shop buttons).
- [x] Inline panel `width`/style attrs removed from `index.html` (via HUD redesign).
- [ ] Shop items stay hidden until you have ~half the price, then always visible.

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
- [ ] Walking animation for villagers (currently they slide; add a step/bob cycle).
- [ ] Nicer art/icons across the game — it's functional but not pretty
      (sprites, building art, resource icons, UI polish).

## Planned: HUD redesign (minimize chrome, maximize map)

**Design spec:** [`docs/superpowers/specs/2026-07-17-hud-redesign-design.md`](docs/superpowers/specs/2026-07-17-hud-redesign-design.md)

Thin top bar (resource icons + tool counts + menu icons: 🛒 Shop / 👷 Jobs / 🎯 Goal
/ 💬 Messages / ⚙ Settings), work actions as a bottom toolbar, Shop/Jobs/Goal/Messages
open as closable overlays over the map, Equipment panel dropped, Reset moved into
Settings. UI-1 = this layout (CSS/HTML + small toggle JS, logic untouched). UI-2
(later) = sector views: a wider world you switch/pan between (view Hills only, etc.).

- [x] UI-1 — thin top bar (resource + tool + housing chips, menu icons), bottom
      work toolbar, Shop/Jobs/Goal/Messages/Settings as closable map overlays
      (mutually exclusive), Equipment panel dropped, Reset + dev speed in Settings.
      New ui.js for the toggles. Map now fills the middle (letterboxed to aspect).
      Verified in browser.
- [ ] UI-2 — sector views / wider map with per-sector camera (view Hills only, etc.).
- [ ] Map fills without letterbox bands (widen canvas aspect or fit differently).

## Planned: Villager actor model (manual work done by villagers)

**Design spec:** [`docs/superpowers/specs/2026-07-17-villager-actor-model-design.md`](docs/superpowers/specs/2026-07-17-villager-actor-model-design.md)

No player character: start with 1 villager. Manual actions dispatch a free villager
who walks to the task, works, and returns; parallel work is limited by free villagers
+ tools (one tool per worker). Per-villager energy (tired = slower, never blocked;
idle recovery; Sleep rests the most-tired free villager). Job-assigned villagers leave
the free pool. Stats stay global.

- [x] A1 — Actor loop: start with 1 villager; action rows are dispatch buttons
      (click/hotkey sends the first free villager); villager walks to the action's
      spot, works with a per-villager progress bar, grants, and returns; parallel
      with multiple villagers; buttons grey when none free. Removed the global
      "sleeping" lock. Verified in browser.
- [x] A2 — Per-villager energy: each villager has energy; actions carry an
      `energyCost` drained on completion; tired = slower (workDur × (2−energy/100),
      never blocked); idle villagers recover (rate scales with cardio); Sleep sends
      the most-tired free villager to rest (energyCost −100). Work dispatch picks the
      most-rested villager. Global energy system removed (bar, energy.js, energy
      requires). Small energy bar drawn under tired villagers. Verified in browser.
- [x] A3 — One tool per worker: `state.axes`/`state.spears` are arrays of
      `{dur, inUse}`. Chop/mine reserve a free axe, hunt a free spear (most-durable
      free tool); the tool wears on completion and breaks (removed) at 0. Dispatch +
      greying gate on a free tool, so parallel gathering is capped by tools AND
      villagers. Equipment panel shows count + most-worn durability. Verified
      (2 villagers/1 axe → one chops; buy 2nd → both; save/load restores arrays).
- [x] A4 (map) — Taller canvas (1150×460, 30×12 tiles, road row 6, CSS height auto)
      so the map is the focus; zoned Home: forest (rows 0-1), a procedural rock
      **Mine** area + **Hunt** grounds (bushes + animal) with faint labels, houses
      below the road. Mine/Hunt now walk to those nodes. Verified in browser.
      Plan: [`docs/superpowers/specs/2026-07-17-map-areas-design.md`](docs/superpowers/specs/2026-07-17-map-areas-design.md)
- [x] Resource drop-off: villagers carry a gathered resource to a drop-off and the
      "+N" pops there — home by default, the resource's building once built
      (wood→lumber mill, iron→mine, food→hunting lodge). Verified.
- [x] Building placement can't overlap (occupancy grid); shop hover keeps its ring;
      HUD panels capped at 46vh (scroll in-panel) so the map stays visible.
- [ ] A4 (rest) — Unify scouts onto the villager model (they still reduce the
      unemployed *count* rather than occupying an entity); further per-villager UI
      polish; new-resource region nodes (stone/gold/crystal areas).

## Balance / pacing (own pass, flagged)

- [x] Coordinated opening pass (all three levers, moderate strength):
      villager speed 62-88 → 100-130 px/s; early yields chop 10→20, iron/food 10→15;
      iron/hunt work shortened (ironSpeed 6M→4M, huntSpeed 8M→6M); first-building
      costs cut ~40% (LumberMill 500/100→300/60, Mine 500/150→300/80, HuntingLodge
      800/200→500/120, houses 600/100→400/60, TrainingYard 1000/250→600/150).
      Verified via `?nodev` in-browser: no errors, chop yields 20 / iron 15,
      time-to-first-LumberMill ~8min → ~3min (50 chops → 15). Throughput ~1.0 →
      ~1.8 wood/s.
- [ ] Walk distance is still the dominant per-trip cost: even at the new speed the
      wood round trip is ~11s (≈80% walking), because the forest is pinned to rows
      0-1 while villagers live at the bottom. Next lever if the opening still drags:
      shorten the wood trek itself — bring some forest tiles nearer the home band,
      or lift the home band up. Left for a follow-up (it's a layout change, not
      number-tuning). Playtest via `?nodev`.

## Planned: Tile-based world + living road

**Design spec:** [`docs/superpowers/specs/2026-07-17-tile-world-design.md`](docs/superpowers/specs/2026-07-17-tile-world-design.md)

Render the world as a tile grid with procedural per-region terrain, connected by
a road that physically extends as each region is scouted (gateways at borders).
Rendering redesign of `scene.js`; game logic untouched. Sub-phases T1 terrain →
T2 road + gateways → T3 snap entities → T4 polish.

- [x] T1 — Tile grid (30×8) + procedural per-region terrain with deterministic
      per-tile jitter + rock flecks, replacing the flat bands. Fog/hints drawn
      over region column spans. Verified in browser.
- [x] T2 — Living road (packed-earth tiles on ROAD_ROW) drawn across claimed
      regions only, so it extends when a region is scouted; gateways straddle each
      border, open when the region past them is claimed, closed at the frontier.
      Verified: road paved into Hills on claim, frontier gate advanced.
- [x] T3 — Snap buildings / trees / villagers onto the tile grid: buildings on
      plots (tile row + column, staggered) above/below the road, flowing across
      columns for multiples; forest on Home's top row; villagers home in the
      Home tile band. Verified (incl. save/load rebuild) in browser.
- [ ] T4 — Polish (villagers walk the road, paving animation, prop tiles).

## Controls & dev tools

- [x] Hotkeys: 1–8 fire the work/action bars, Q/W/E fire region scouts (key
      badges on the bars + each tooltip ends with "[Key: X]"); `H` toggles a help
      overlay listing all bindings (`?` also works; `H` is Swedish-layout safe).
- [x] Dev-only speed toggle, pinned to a fixed top-right card (backtick or the
      button): 1x↔5x `timeScale` shortening bar/scout/income timers. Never ships.
- [x] Fresh game + Reset start at 0 resources (removed the localhost auto-grant;
      grind fast with the speed toggle instead).
- [x] Buildings no longer bob (villagers still do).
- [x] Buy-by-key for shop items (A buys an axe from anywhere); shop-item keys in
      tooltips + help.
- [x] "Go to Sleep" action (key 9): restores energy to full over ~3s, blocks
      other actions while asleep.
- [ ] Extend buy-hotkeys to more shop items / job steppers for fuller keyboard
      play (only axe wired so far).
- [x] Shop: merged the food-only Resources tab into "Goods"; emoji icons on all
      shop buttons.

## Visual / HUD polish

- [x] Village-ledger HUD theme for the top chrome + buy menu: parchment panels,
      grass-green accent headers, resource numbers colored to match the on-map
      "+N" floaters, tactile buy list with affordable/locked/greyed states.
      (style.css now loads after Bootstrap so custom rules win.)
- [ ] Offer alternate skins — theme is centralized in CSS variables, so a
      modern / cozy-night / playful reskin is a quick swap. Confirm direction.
- [ ] Push progress bars + typography further (heading face, bar detailing).
- [ ] Style the overlay panels + top/bottom bars further (they reuse the theme
      but could be polished now they're the main chrome).

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
