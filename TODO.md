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
   The camera landed (fill-height + deadzone follow on narrow windows, letterbox
   bands gone there); what's left is *explicit* sector switching and a world wider
   than 1150×460 to switch between.
4. **Art & animation** — nicer sprites/icons throughout (walking animation shipped).
5. **3D polish** — the 3D renderer shipped, with a WC3-style camera and per-activity
   villager animation and per-building models (see the renderer-split section);
   what it still lacks is an ambience layer of its own and touch camera controls.
6. **Smaller** — shop-items-hidden-until-affordable, alternate skins, fuller keyboard
   play, prestige/achievements/events.

Detail for each lives in the phase sections below.

---

## Feedback pass — onboarding, feedback & controls (mostly shipped, 2026-07-19)

A batch from live play. Theme: the opening is slow and under-signposted, and the
game doesn't explain *why* things are (or aren't) available. Decisions in brackets
were made with the user; the tool model is intentionally unchanged.

- [x] **Onboarding — "Next goal" HUD hint.** Persistent centred `#nextGoal` line
      showing the recommended next purchase with have/need progress from turn 0
      (`Next: Hire Villager — 0/20 food`), advancing hire → LumberMill → Mine →
      HuntingLodge → grow, green when affordable. Ordered `NEXT_GOALS` in script.js,
      refreshed from `set()`. *(Decision: dedicated HUD hint, not reveal-threshold.)*
- [x] **Next-goal steps are sticky, and job steps have a finish line.** "Assign a
      Mason" used to un-complete the moment you reassigned that villager, so it
      read as a job you had to staff forever. Each `NEXT_GOALS` entry now carries
      an `id` and is banked into `state.milestones` (persisted) the first time it
      clears, so it never comes back. The Mason/Trader steps also clear on the
      stockpile alone (400 stone → Blacksmith, 200 gold → Monument) and show that
      progress inline, so there's a visible target instead of an open-ended nag.
- [x] **Equipment overlay (shared pool + durability).** Gear button opens a closable
      overlay listing each pooled axe/spear with a durability bar; refreshed from
      `updateToolDisplay` + on open. Notes tools are a shared pool. *(Decision: shared
      pool, per-tool view — not per-villager gear.)*
- [x] **Top bar — Shop + Goal moved left.** `#topLeft` holds Shop + Goal + the new Gear
      button, resource chips follow; Jobs/Messages/Settings stay right; next-goal hint
      centred between. *(Decision: just Shop + Goal.)*
- [x] **Blocked-reason in action tooltips.** `refreshBarStates` appends the specific
      reason to each bar's `data-tip` ("No axe — buy one in Shop" / "All axes in use" /
      "No free villager" / "Requires ..."), unified via `blockReason`.
- [x] **Auto-action toggle ("auto chop").** Per-bar 'A' toggle keeps dispatching while
      runnable (250ms `autoDriverTick`) and auto-stops on a permanent block (requirement
      lost / no tool exists). `canDispatch = !blockReason` shares the eligibility rule.
- [x] **Tiredness — gradual walk slowdown + tired marker.** `moveToward` scales walk
      speed with energy to a **30% floor** at empty; a pulsing 💤 marker shows above
      villagers under 35% energy. *(Decision: gradual to 30%, not a cliff.)*
- [ ] **Nicer building/house SVG icons.** The built-house art (and the flat Phase-3
      SVGs) aren't pretty. Upgrade to nicer vector icons — one-line swaps in the SPRITES
      manifest. *(Deferred per "later"; best done with visual iteration. Overlaps the
      "nicer/consistent art" items below.)*

**Answered (no code change):** the brown strip through the Home grass is the **road**
(`drawRoad`, row 6) — permanent, paves rightward as regions are claimed, buildings sit
on the grass plots around it. Villagers walking the road is the separate T4 polish item.
The "a villager without the tool did the task" observation is **expected**: tools are a
shared pool, and dispatch sends the most-rested free villager, so which one works
alternates (not per-villager ownership).

---

## Progression & depth pass (from 2026-07-21 playtest)

Feedback: opening felt slow/under-signposted, mid-late chain was invisible, and
regions are same-y ("get a resource here too"). Mechanically the whole
Home→Hills→Mountains→Cavern→Monument chain is complete and reachable — the gaps
were guidance and depth.

- [x] **Full-chain next-goal guidance.** The `#nextGoal` hint now walks the whole
      path (build Mine → Scout Hills → Quarry → Assign a Mason → Blacksmith → Scout
      Mountains → Market → Assign a Trader → Scout Cavern → Mine Crystal → Build the
      Monument), with scout/job/gather guidance steps, not just the opening. Fixes
      "quest jumped to the Monument / I didn't know how to get stone." Capitalised
      "Build the Monument".
- [x] **Wear most-worn tool first.** `freeTool` picks the lowest-durability free tool
      so nearly-spent tools get used up and replaced, not spread thin.
- [x] **Starter house visual** for the 2 base housing slots (persists across save/load).
- [x] **Farm Houses +8 → +2** per purchase — gentler population ramp.
- [x] **Hunger meter (per-villager food upkeep).** Villagers get a `hunger` meter
      that drains over time and eats from the **global food stockpile** (`scene.feed`);
      when food runs dry they slow to the shared ~30% floor (`moveToward` uses the
      worse of energy/hunger) with a 🍖 marker + hunger bar. Food is now ongoing
      upkeep, not just the hire cost. Rates in variables.js (`hungerDrain` etc.).
      *(Decisions: global food sink; soft slow-only, never blocked.)* Reviewed clean.
- [x] **Per-villager specialization + inspect panel.** Speed/Strength/Cardio moved
      from global `state` onto each villager (`v.stats`, persisted via
      `villagerData`); manual actions use the *acting* villager's stats and training
      improves that villager. Click a villager → a dweller panel (`#villagerOverlay`)
      with their live stats + energy/hunger and per-villager Train/Sleep actions
      (`dispatchActionFor`); the game's first canvas hit-testing (`scene.pickVillager`).
      Global bars kept; passive job income stays flat (v1). Spec:
      `docs/superpowers/specs/2026-07-21-villager-specialization-design.md`. Reviewed clean.
      *(Follow-up: scale passive job income by the assigned villager's stats.)*
- [ ] **Region events / discoveries (make regions feel different).** Beyond "another
      resource + job", each region gets one-time finds and small events on arrival —
      a ruin with a cache, a hazard to clear, a bonus — so scouting a region is an
      *event*, not a reskin. *(Chosen direction: per-region events/discoveries.
      Needs its own design pass: event framework + per-region content, one-time vs
      repeatable, reward types, how it surfaces on the map/messages.)*

---

## Build bar — the shop stopped being a menu ✅ (2026-09-12)

Buying a building used to be: open 🛒 Shop → Open Houses → click the item → Back
→ ✕. Four clicks, with the map hidden behind a modal the whole time. The modal
is gone. Everything buyable now sits in a bar over the top of the map, so a
purchase is **one click** and you watch the village while you build it.

- Chips render from `SHOP_ITEMS` (see `shops.js`) — a new item is still one
  registry entry and no markup. `SHOP_NAV`, the categories screen and the Back
  button are deleted.
- A chip shows icon · name · cost · `×N` built · hotkey. The cost is per
  resource, and **only the resource you are short of goes red**, so a chip
  answers "what am I still missing?" rather than just "no".
- **The bar shows what you could work toward now**, which is narrower than
  "everything". Hiding items until you held half their cost made "what am I saving
  for?" unanswerable; showing all fifteen swapped that for a wall. The rule:
  an item is **out of reach** when the building needs an unclaimed region, or its
  price is in a resource that region is the only source of — you cannot obtain a
  unit of stone before claiming the Hills, so a stone price is noise. Out of reach
  is off the bar; everything else gets a full chip. 10 items at the start, 13 after
  the Hills, 15 at the end. `halfAfforded` / `itemDiscovered` are deleted.
- **Becoming affordable is an event.** A chip that flips to buyable pops and
  flashes green (`.justAfforded`). Suppressed on the first pass, or a reload would
  set off every chip at once; the deferred cleanup takes an id rather than an
  element, because `var` in a `for-in` loop would hand the timer whatever the loop
  ended on.
- **Each chip shows its own progress** — a bar along its bottom edge, filled by
  the *worst* resource in its cost, since that's the one holding you up.
- **Region-locked buildings say which region**, rather than dangling a price you
  can't act on: `🔒 Hills`, dotted border, dimmed.
- **Hovering anything says exactly what's missing**: "Still need: 120 more wood,
  20 more iron" / "Locked until you claim the Hills" / "No housing free — build
  Farm Houses first" (that last one from a `blockedWhy` on the registry entry, so
  it stays data-driven). Live, appended to the authored tooltip on each refresh.
- **The next-goal hint and the button are the same object**: `goalBuy()` records
  which item the top-bar north-star points at, and that chip gets a gold ring.
- **Buyable vs not differs on four axes at once** — background, border style, text
  weight, and whether the icon has any colour in it. A greyed-out emoji turned out
  to be the strongest single signal: a full-colour icon on a dimmed chip still
  reads as live. Border *width* stays 1px in every state, or the bar would reflow
  each time you could suddenly afford something. Locked goes one step further down
  all four. A chip at ≥75% turns gold (`.nearly`) — the "one more trip" state.
- 🛒 Build toggles the bar; that choice survives the refresh that runs on every
  resource change.

### Bottom-left HUD cluster

Gear and the selected villager sit side by side on the map (`#hudDock`), not over
it. The villager inspector used to be a centred modal — you clicked a villager to
learn about them and the village they were standing in disappeared, which is the
wrong trade. Both panels share the build bar's visual language.

### Gear panel

Tool durability lived behind the 🎒 button — meaning the number that decides
whether your next chop succeeds was one click away, and therefore never watched.
It's now a small panel on the map, permanently showing the **most worn tool** in
each pool (the one that decides when the next breakage message arrives). Click it
or 🎒 Gear to expand into a per-tool list. The equipment overlay is deleted, along
with `toolReadout`'s writes to `#axeDurabilityBar` / `#spearDurabilityBar`, which
had not existed in the markup for some time and were silently no-ops.
- Capped at 34% of the map height (scrolls past that), and under 1180px the
  names drop so the icon + price carry it. One row on a laptop, two when the
  whole tech tree is open.
- Hotkeys (V / A / S / F) still buy from anywhere, unchanged.

## Renderer split + 3D village ✅ (2026-09-12)

The world and the graphics are now separate things. `scene.js` is the **simulation**
— entities, the task state machine, movement, hunger/energy, jobs — and owns no
pixels at all. A **renderer** is handed that world every frame and decides how it
looks. Two exist and are interchangeable at runtime:

- `render2d.js` — the original canvas-2D top-down view, unchanged in output.
- `render3d.js` — a three.js view of the same village (ES module, `lib/three.*.min.js`
  vendored, still no build step).

The whole seam is four methods: `init(container)`, `frame(world, dt, now)`,
`pick(clientX, clientY)`, `destroy()` — plus an optional `swallowClick()` for
renderers with a camera-drag gesture.

> **Gotcha for anything renderer-scoped:** `init()` must establish clean state
> rather than inherit the last session's. Caches that gate work are the dangerous
> ones — a stale `_cw`/`_ch` resize cache meant a rebuilt 3D renderer was never
> sized at all (it kept the canvas default of 300x150, stretched, camera stuck on
> aspect 1), which is why 3D looked low quality the *second* time you switched to
> it. Same class of bug for module-level geometry caches that `destroy()`'s
> traverse disposes but never nulls. Covered by three checks in the suite. Everything else — bars, shops, jobs,
overlays, saves — is renderer-agnostic and untouched.

- Switch with the **2D | 3D segmented control in the top bar**, by pressing **G**,
  or with `?render=2d` / `?render=3d`. The choice persists in `localStorage`;
  switching mid-game keeps the village exactly as it was. It used to be a button
  buried in Settings — the renderer is a view setting you flip while playing, not
  something to go hunting for. If 3D init fails (no WebGL) the 3D half disables
  itself, so you aren't invited to keep trying something this machine can't do.
- Sprite footprints are **declared** in `data/assets.js` (`w`/`h`) instead of being
  measured off loaded `Image`s, so layout no longer depends on decode timing — and
  a renderer that draws no images still gets the same village shape.
- The 3D renderer **reconciles** meshes against the world each frame (build what's
  new, drop what's gone), so loads, Resets and mid-game switches need no
  notification from the game.
- World `(x, y)` maps to three.js `(x, 0, y)`; height is invented by the renderer
  from a per-type massing table. The sim has no concept of height.
- No WebGL (or the module failed to load) falls back to 2D with a message rather
  than a blank map.

### 3D camera (Warcraft III style)

One control — zoom — and the pitch rides on it. Zooming in tilts the camera down
toward the horizon until you are at head height looking along the street (175
units out, 17° up); zooming out swings it back to a tactical near-top-down (820
units, 66°) that frames the whole strip. Both ends stop hard, and panning is
fenced to the map, so the view can never get lost or end up staring into space.

- Wheel zooms. Drag horizontally to spin, vertically to zoom. Shift- or
  middle-drag pans; double-click hands the camera back to following the villagers
  (same deadzone follow as the 2D camera).
- **The opening view frames the whole valley**, and **Home** (or Backspace) gets
  you back to it from anywhere. `fitZoom()` computes it from the real viewport and
  field of view rather than a magic number, so it stays right on any window shape.
- **Edge panning, Warcraft style**: push the pointer against the left or right
  edge of the map and the view slides that way, faster the further in you push,
  with the cursor changing to signal it. Sideways only — the world is a wide
  shallow strip, and the top and bottom of the viewport are where the build bar
  and work toolbar live, so a cursor there is heading for a button. It stays off
  while the whole valley is already on screen, since there is nowhere to go.
- **Zoom is magnitude-aware.** It used to step by `Math.sign(deltaY)`, so a
  trackpad — which fires dozens of small wheel events per flick — crossed the
  entire range in one gesture, and the zoom only ever felt like "nearest" or
  "furthest". Deltas are normalised to pixels (browsers report lines and pages
  too) and scaled, with a per-event ceiling.
- `Render3D.cam`, `setZoom(t)` and `focusOn(x, z)` are public, so the game can
  frame something later (the Monument on a win) without reaching into internals.
- Text is in world space, so it is scaled per frame to stay roughly screen-sized,
  and the map labels (region names, Mine / Hunt) fade out once you are down among
  the buildings.
- A gradient sky dome + matched fog, because at 17° you are looking at the horizon.

### Villager animation

Villagers are a rigged figure — torso, head, two arms, two legs on joint pivots,
a hat on about a third of them — posed every frame from state the sim already
had. Nothing was added to a villager to make this work.

- The walk cycle advances with **distance travelled**, not time, so feet never
  slide and a villager slowed by hunger or exhaustion plods automatically.
- Per-activity motions, so you can tell what someone is doing from across the map:
  overhead **swing** (chop / mine / quarry), **claw**, a crouched **stalk** with
  spear jabs (hunt), **jog** on the spot (speed), overhead **press** (strength),
  **star jumps** (cardio), **haggling** (market), and lying flat out **asleep**.
- Carrying home shows the load as a coloured block in their hands, arms out,
  leaning back against the weight.
- Idle villagers breathe, look around, and stretch every few seconds; tired ones
  slouch with their head down.
- Turning is eased rather than snapped, so they lean into corners.

### Building models

Every building has its own silhouette rather than a tinted box with a pyramid on
top, because a village of ten buildings has to be legible at a glance:

- **house** gable roof with an overhang, door, windows · **lumberMill** turning
  water wheel + log pile · **mine** spoil heap with a timbered headframe, dark
  adit and a minecart on rails · **huntingLodge** log cabin with antlers over the
  door · **trainingYard** sanded ring with a pell to hit · **quarry** stepped pit
  with a hoist arm · **farm** barn, ploughed rows and a scarecrow · **blacksmith**
  chimney, glowing hearth and an anvil · **market** striped stall awnings and
  crates · **monument** stepped plinth under a lit shard.
- Roofs are real gable prisms with a ridge (a 3-sided cylinder), not four-sided
  pyramids — those read as wizard hats on anything that wasn't square.
- Materials are shared by colour across the village, and `BUILD` / `SPREAD` in
  render3d.js are where a new building's shape and plot size go.
- The forest is three InstancedMeshes with two tree varieties: same picture, ~3
  draw calls instead of ~70.
- Villagers show the tool the sim reserved (axe or spear), swinging with the arm.
- The sun moved to the FRONT-left of the map. It used to sit behind the scene, so
  every face the default camera could see was in shadow, which is why dark roofs
  read as black slabs.

Possible later: merging each building's static parts into one mesh (needs
`BufferGeometryUtils`) would take a full village from ~230 draw calls to well
under 100. Not currently a bottleneck.

### Villager personality

Each villager has a permanent expression and headgear, both derived from the same
`phase` they already carried for animation — so it is stable for their whole life,
survives a save, and the simulation stores nothing new for it.

- Six base expressions (dots, wide eyes with highlights, squint, raised brow with
  a smirk, a wink, freckles), drawn to a canvas and mapped onto a **curved patch**
  sitting just proud of the head. A patch rather than a flat decal because a flat
  face separates visibly the moment the camera swings round.
- The current **mood overrides** the base expression, read from state that already
  existed: drooping lids and a flat mouth when exhausted, a frown when starving,
  and eyes-closed delight on the walk home carrying a full load.
- Hunting is a **spear thrust** — brace, wind back over the shoulder, drive
  forward and lean in. It was a crouch-and-twitch with both arms out front, which
  read as nothing in particular. The spear model was 20 long and 1.1 thick with a
  stubby head, which are a sword's proportions and exactly what it looked like;
  it is now long, thin, and carried angled. The shop icon was 🗡️ — a *dagger* —
  now 🔱, the nearest pole weapon Unicode has.
- Seven headgear options (bare ×2, straw, cap, headband, top hat, hood), coloured
  from a palette. Silhouette is what separates villagers at the distance you
  actually play at, so this is the variety that earns its place.
- Feature sizes are set for legibility at play distance, not anatomy — a
  naturalistic eye would be two pixels. Hats are positioned against the **eye
  line**: the hood and headband originally dipped below it, which made them
  blindfolds.
- Faces are skipped entirely past ~460 units of camera distance, where they'd be
  sub-pixel. Expression textures and the patch geometry are shared across every
  villager using them, so per-villager teardown must not dispose them.

### Motion everywhere else

The villagers were the only thing moving, which made the map they moved across
read as a diorama. What moves now:

- **Wind**, from a single `windAt(x, z, now)` shared by everything. The phase
  depends on world x, so gusts *travel* — you watch one cross the valley instead
  of everything wobbling on its own little timer, which is the tell that gives
  away per-object animation. Trees lean (taller ones further), farm crops bend,
  market canvas ripples, and drifting smoke is pushed along by it.
- **Felling.** The sim drops a chopped tree's growth to a stump in one step (it
  has no notion of time passing mid-chop). The renderer notices the drop and
  plays it out: a topple, and a burst of wood chips where the axe landed. No sim
  change — the renderer reacts to a world fact it observed.
- **Emitters.** Smoke off the blacksmith's chimney, sparks off its hearth, dust
  off the quarry and the mine head. A building declares `userData.emit` in its
  builder, so a new building smokes by *saying so* rather than being special-cased
  in the frame loop.
- **Blinking**, a ~130ms shut every few seconds, offset per villager so a crowd
  never blinks in unison. Two cached textures, swapped.
- **Arrival**: a new hire springs out of the ground on the same easeOutBack a new
  building uses. `bornAt` moved onto the villager (suppressed on load, exactly as
  `addBuilding` already did) — when someone joined is a fact about the village.
- **Idle villagers turn to face each other.** Two people standing near each other
  looking in random directions read as props; turned toward one another they read
  as a conversation, for the cost of one loop.
- **Birds**, three of them, on long ellipses over the valley. Nothing in the game
  knows about them; an empty sky reads as a menu.

Effects are pooled and recycled (cap 90) and skipped entirely when the camera is
far enough out that they'd be specks.

### Dev fast-forward

The backtick now **cycles 1x / 5x / 25x / 100x** rather than toggling, so the late
game (1200 wood and four claimed regions) is reachable in a sitting. Making that
honest meant fixing an inconsistency: task durations, income and walking already
divided by `timeScale`, but hunger and energy used raw real seconds — so at 100x
villagers got rich without ever getting hungry, and the late game you were
validating wasn't the one players meet. Upkeep now uses game time too. At 1x it
is exactly what it was.

### Mobile

Keyed off viewport **height** and pointer type rather than width: the problem on a
phone in landscape isn't that it's narrow (844px is plenty), it's that the map is
only ~215px tall and every panel that stacks vertically eats the thing you came to
look at. It was 34% of the map before this.

- Short screens: the build bar becomes **one horizontally-scrolling row** (a
  second row costs ~14% of the map; a scrollbar costs nothing), and the HUD dock
  spreads **across the width** — gear bottom-left, villager bottom-right — instead
  of stacking. The dock is fenced below the build bar, or the villager panel rises
  up behind the chips.
- Coarse pointers get 42px chips and bigger controls.
- **Touch camera in 3D**: one finger drags the map, two fingers pinch to zoom and
  twist to spin, a tap selects, a drag doesn't. Deliberately not a mirror of the
  mouse scheme — there is no hover to edge-scroll with and no wheel to zoom with,
  so the gestures have to carry everything the pointer does on a desktop.
- **Edge panning is disabled on touch.** A tap synthesises a single mousemove and
  then nothing, so a tap near the edge would latch the pointer there and scroll
  the map away forever with nothing to stop it.
- Tooltips respond to press, since touch has no hover and every "what am I still
  missing?" answer in this game lives in one.
- 2D needed no camera work: it already fits or follows on its own.

Left for later: the 3D view has no atmosphere layer (`atmosphere.js` is 2D-only —
clouds/particles/vignette); it has lighting, shadows, a sky and distance fog
instead. No touch controls for the 3D camera yet. Parity beyond that is
deliberately not a promise — 2D is the default view.

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
- [x] Shop items stay hidden until you have ~half the price, then always visible
      (sticky `state.discovered`, half-of-each-resource threshold; re-evaluated on
      every resource change + category switch; persists across save/load).

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
- [x] Asset pipeline: a single `SPRITES` manifest (`data/assets.js`) is the one
      source of truth — adding art is one line, buildings resolve by type name.
      Supports PNG / SVG / data-URI (drawImage rasterises all three). The 5
      placeholder-box buildings now have vector SVG art (quarry/farm/blacksmith/
      market/monument). Replaced the old `<img>`-tags + per-sprite globals +
      hardcoded buildingImg switch.
- [ ] Nicer/consistent art: the 5 new building SVGs are simple flat icons next to
      pixel-art PNGs — unify the style, and add real art for stone/gold/crystal
      nodes. All now one-line swaps in the SPRITES manifest.
- [ ] Prune unused image assets: `images/` still has orphaned PNGs (hunter,
      oldVillager, player, player2, player3, police) + the whole `nonTransparent/`
      folder — none referenced by the SPRITES manifest or code. Safe to delete
      (they deploy to Pages for nothing).
- [ ] Audio for actions (needs audio assets).
- [x] Walking animation for villagers: a bouncy step-hop while moving (walk/return/
      wander), distinct from the gentle sway while working. Driven by a `v.moving`
      flag set in moveToward; no logic change.
- [x] Animation toolkit (`anim.js`): reusable `Anim.oscillate/pulse/tween/clamp01`
      + easings, so new juice is "compose primitives" not inline trig. Villager
      bobs + floater fade refactored onto it; added a building spawn-pop
      (easeOutBack, grows from the ground, suppressed on load) as the first new
      effect built from it. Next capability when needed: sprite-sheet frame anim.
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
- [ ] UI-2 — sector views: explicit per-sector switching (arrows / click a region)
      and a world wider than 1150×460 to switch between. The camera it needs now
      exists (below) — this is the "choose what you're looking at" half.
- [x] **Camera / world→screen transform.** Built as designed: the world stays a
      fixed 1150×460 coordinate space, the canvas backing store is resized to the
      element (× DPR), and `scene.updateCamera` + `applyCamera` map one onto the
      other in `scene.draw`. Entities were untouched. `WORLD_W`/`WORLD_H` and the
      `CAM_*` tunables live at the top of scene.js.
      - Wide windows are unchanged: while the contain-fit scale is ≥ `CAM_MIN_FIT`
        (0.9) it stays the classic whole-world view, letterboxed, no panning.
      - Narrower than that (roughly a half-width desktop window) it zooms to fill
        the height and pans horizontally — no letterbox bands, ~2.7× the on-screen
        map area at 720px wide.
      - Panning follows the villagers with a `CAM_DEADZONE` (middle 50%), so it
        sits still during ordinary work in Home and slides only when the action
        leaves the middle. Eased at `CAM_LERP`.
      - `pickVillager` inverts the same transform; verified click-to-select still
        hits at 720px and at devicePixelRatio 2.
      Verified at 1920×1080 (unchanged), 1030/1000/900/720/640 wide, 900×500,
      500×700, live resize, and dpr 2.

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
- [x] **Cancel a villager's queued actions.** `scene.cancelTask(v)` aborts a task:
      releases the reserved tool *unworn*, grants nothing, and points the villager
      home (without the explicit re-target they'd finish walking to the abandoned
      target first, since the idle wander only re-aims on arrival). Clean by
      construction — every action's `onStart` is a no-op, and yield + tool wear +
      energy cost all land together in `completeTask`.
      - The **return leg is not cancellable** (`scene.canCancel`): the work is done
        and the reward already banked, so there's nothing to call off — they're
        just carrying it to the drop-off.
      - **Villager panel:** a "✖ Cancel task" button, bound once and enabled/disabled
        by the live refresh (so the ~4x/sec update can't eat the click). Its status
        line now reads the leg and the action's label — `Walking to: Chop wood`
        rather than the raw `chopWood` id.
      - **Action bar:** right-click steps the action back one notch —
        auto-repeat off → drop a queued order → recall a worker. Auto has to go
        first, or the 250ms driver re-dispatches and the cancel looks like a no-op.
        Clicking the orange queue badge does the queued-order step directly.
      - Cancelling the queue removes the *newest* matching order, so click-to-queue
        and click-to-cancel mirror each other.
      Verified: tool freed with durability unchanged, no resource/energy granted,
      villager walks home, return leg refuses both paths without corrupting state,
      panel button states, real right-click (browser menu suppressed) and badge
      click (doesn't also queue another).

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
- [x] Buy-hotkeys for the common goods: A axe, S spear, F food, V hire villager
      (badges in tooltips + help overlay, buy from anywhere via the shared handler).
- [ ] Extend buy-hotkeys further (buildings / job steppers) for fuller keyboard play.
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
- [x] Mobile (landscape-first): added the viewport meta tag (was missing — the
      big one), a mobile media query (tighter top/bottom bars, larger tap targets,
      100dvh), and a portrait "rotate your device" hint since the map is a wide
      2.5:1. Verified at 390×844 / 844×390 / 568×320. Also cleaned dead CSS
      (legacy .hudPanel, duplicate #canvas1 rule, the big commented block).
- [x] Small/split-screen windows: the map used to letterbox into a thin strip
      (720×288 inside a 790px-tall area) with the Home region only 216px wide.
      Fixed by the camera above — fill-height + deadzone follow. The next-goal
      hint also moved to its own full-width row under 820px, where it used to
      ellipsise away ("Hire Villager — 0/20...").
- [ ] Full portrait support (optional): the camera can now fill a tall container,
      but portrait still shows the rotate hint — landscape is the intended mode.
      Would need the toolbar/top bar reflowed for a tall narrow viewport.
- [ ] Replayability: prestige/ascension, achievements, random events.
- [ ] Full canvas width: buildings still cluster in the left of each region
      zone; spread them to use the space better.
