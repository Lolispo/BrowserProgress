# Per-Villager Specialization + Inspect Panel

**Status:** implemented
**Date:** 2026-07-21
**Depends on:** the villager actor model (`scene.js` villagers, `startTask`/`completeTask`),
the ACTIONS registry (`data/registry.js`), and persistence (`persistence.js`).

## Problem

Speed / Strength / Cardio are **global** stats: a villager does the *work* of
training at the Training Yard, but the payoff is a village-wide bonus everyone
shares. There's no specialization and no way to inspect or directly command an
individual villager. Goal: move the three trained stats **onto each villager**
(a Fallout-Shelter feel — you grow specialists), and add a **click-to-inspect
panel** that shows a villager's stats and lets you dispatch *that* villager to an
action. Rendering/sim + data change; the win condition and economy are untouched.

## Decisions (locked via brainstorming)

- **All three stats go per-villager** (speed, strength, cardio).
- **Persisted per villager** — training is permanent progress, so each villager's
  stats survive save/reload (villagers are currently rebuilt from a count only).
- **Inspect panel + keep the global bars** — click a villager for a stats panel
  with per-villager train/sleep actions; the bottom bars stay for "act with
  whoever's free".
- **Passive job income stays flat for v1** — manual actions use per-villager
  stats; Mason/Trader/etc. output does not scale with the assigned villager
  (a clean follow-up, explicitly out of scope here).
- Movement speed (`v.speed`, px/s) is unchanged; only the trained stats move.

## Part 1 — Per-villager stats + effect reroute

Each villager gains `v.stats = { speed: 100, strength: 100, cardio: 100 }` (set in
`scene.addVillager`), kept distinct from the existing `v.speed` (movement px/s).
Remove `state.speed` / `state.strength` / `state.cardio`.

Reroute the 10 read-sites from the global stat to the **acting villager**:

| Effect | Today (global) | New (per-villager) |
|--------|----------------|--------------------|
| Action duration | `maxTime(){ return woodSpeed/state.speed }` (registry.js:155/171/186/207) | `maxTime(spd){ return woodSpeed/spd }`; `scene.startTask` calls `a.maxTime(v.stats.speed)` |
| Gather amount | `gatherAmount(base)` uses `state.strength` (registry.js:115) | `gatherAmount(base, strength)`; `onDone(v)` passes `v.stats.strength` |
| Hunt success | `successHuntRate * state.strength/100` (registry.js:189) | uses `v.stats.strength` (via `onDone(v)`) |
| Energy recovery | `energy += (3 + state.cardio/50)*dt` (scene.js:471) | uses `v.stats.cardio` |
| Train Speed/Str/Cardio | `set("speed", state.speed + inc)` (registry.js:224/235/246) | bumps `v.stats.<x>` on the acting villager |

Mechanism: `ACTION.onStart`/`onDone` gain a villager param. `completeTask(v)` calls
`a.onDone(v)`; `updateTask` (arrival) calls `a.onStart(v)`. `startTask(v, id)`
computes `workDur` from `v.stats.speed`. Scouts (their own `onStart/onDone` set in
`initScouts`, `TimeBar`-driven) are untouched and ignore the param.

Training actions with a fixed `maxTime` (`speedSpeed` etc.) ignore the speed arg.
Existing behaviour where the global bars auto-dispatch the most-rested free
villager is unchanged — that villager now trains/gathers with *their own* stats,
so specialization emerges from who you send.

## Part 2 — Persistence of villager stats

Serialize each villager's persistent fields so training survives reload.

- New saved key `state.villagerData: []` (default `[]`).
- `scene.dumpVillagers()` → `[{ speed, strength, cardio, energy, hunger }, ...]`
  from `scene.villagers`.
- `saveGame()` sets `state.villagerData = scene.dumpVillagers()` before
  `JSON.stringify` (guarded: only if `scene` is initialised).
- `scene.addVillager(data)` — optional arg; if present, restores
  `stats`/`energy`/`hunger` from it, else uses defaults.
- `scene.rebuildFromState()` passes `state.villagerData[i]` to each `addVillager`.
- Old saves lack `villagerData` → villagers start at 100 (forward-compatible, the
  same "missing key keeps default" contract `loadGame` already relies on).

Job assignment (`jobTarget`/`slot`) stays derived from job counts via `syncJobs`,
not serialized.

## Part 3 — Click-to-inspect panel + per-villager dispatch

The game's first canvas hit-testing.

- **Click mapping** (`#canvas1` is `object-fit: contain`, internal 1150×460):
  compute `scale = min(rectW/1150, rectH/460)`, letterbox offsets
  `ox = (rectW - 1150*scale)/2`, `oy = (rectH - 460*scale)/2`, then
  `worldX = (clientX - rectLeft - ox)/scale` (same for Y). Hit-test villagers by
  sprite bbox; pick the topmost match. Click on empty space closes the panel.
- **`#villagerOverlay`** (a closable overlay like Gear/Jobs): shows the selected
  villager's Speed / Strength / Cardio numbers, energy + hunger bars, and status
  (Idle / Working / assigned job). Action buttons: **Train Speed / Strength /
  Cardio** (shown only if a Training Yard exists) and **Sleep**, each dispatching
  *that* villager via `dispatchActionFor(v, id)`.
- `dispatchActionFor(v, id)`: if `v.busy` or requirements/tool unmet, no-op (with
  a message); else `scene.startTask(v, id)`. Reuses the same gating as the global
  dispatch.
- The panel **live-refreshes while open** (from the throttled `refreshBarStates`
  tick, ~4×/sec) so stats/energy/hunger update as the villager acts. Selecting a
  villager sets `scene.selected`; closing clears it.

## Files touched

| File | Change |
|------|--------|
| `data/registry.js` | remove global `speed/strength/cardio`; `maxTime(spd)`, `gatherAmount(base, strength)`, `onStart(v)`/`onDone(v)` for the stat-using actions; add `villagerData: []` |
| `scene.js` | `v.stats` in `addVillager(data)`; reroute duration/gather/energy to the actor; `dumpVillagers`; `rebuildFromState` restores stats; canvas hit-test + `scene.selected`; `dispatchActionFor` |
| `persistence.js` | `saveGame` dumps villager data before stringify |
| `index.html` | `#villagerOverlay` markup; a canvas click target |
| `ui.js` | wire the villager overlay open/close + live refresh |
| `script.js` | render the villager panel; per-villager action buttons |
| `style.css` | villager panel + stat rows |

## Success criteria

- Training a specific villager raises **only that villager's** stat; their
  gather amount / action speed / energy recovery reflect their own stats.
- New villagers start at 100/100/100; trained stats **survive save/reload**.
- Clicking a villager opens a panel with their live stats and working
  train/sleep buttons that command that villager; clicking empty space closes it.
- The global action bars still work (dispatch the most-rested free villager, now
  using that villager's stats).
- Passive job income is unchanged (flat). Win condition and economy unaffected.
- No console errors; `node --check` clean on all touched JS.
