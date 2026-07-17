# Villager Actor Model — manual work is done by villagers

**Status:** design, awaiting review
**Date:** 2026-07-17
**Depends on:** current scene (villager entities, tile world) + jobs + energy systems.
This reworks who performs manual actions and touches bars.js, energy.js, jobs.js,
the ACTIONS registry, state, save/load, and the scene UI.

## Problem / goal

Today "manual actions" (chop/mine/hunt/train/sleep/crystal) are done by an invisible
player: click a bar, a timer runs, resources appear. Villagers are a separate thing
you hire for passive jobs. The player isn't present on the map, and there's no reason
the two systems relate.

Goal: **villagers are the actors.** Manual work is performed by a free villager who
walks to the relevant spot and does it. Parallel work is limited by how many free
villagers (and tools) you have. Jobs and manual work draw from the same villager pool.
No player character for now; start with one villager.

## Decisions (locked via brainstorming)

- **No player.** Start with **1 villager** (unemployed). Hire more later.
- **Manual actions need a free villager.** Click an action → auto-dispatch the
  **most-rested free villager**; they walk to the target, work, then return to idle.
  Greyed when no villager (or tool) is free.
- **Parallelism = free villagers.** One free villager → one action at a time.
- **Jobs consume villagers.** A villager assigned to a job is not in the free pool.
- **Per-villager energy.** Each villager tires as they work.
- **Tired = slower, never blocked.** Low energy only slows a villager's work; it never
  stops them. Idle villagers recover slowly; the **Sleep** action fast-rests the
  **most-tired free villager**.
- **One tool per worker.** Chopping/mining needs a free axe; hunting needs a free
  spear. Tools are reserved for the duration of an action, then freed.
- **Stats stay global** (speed/strength/cardio are village-wide bonuses for now).

## Review refinements (approved)

- **Both** the global dispatch buttons and per-villager progress: the panel keeps
  "someone chop wood" style action buttons that grab any available worker, **and**
  each working villager shows its own progress bar on the map. (Confirmed.)
- **Walk time is part of the cost:** an action takes longer because the villager must
  travel to its spot first. Each action has a designated target location:

  | Action | Walks to |
  |--------|----------|
  | Chop Wood / Claw Tree | a tree in the Home forest |
  | Mine Iron | the Mine (if built) else a rock spot in Home |
  | Go Hunting | the Hunting Lodge (if built) else a hunting spot in Home |
  | Train Speed/Strength/Cardio | the Training Yard |
  | Mine Crystal | a crystal node in the Cavern |
  | Go to Sleep | the villager's home tile |

- **Tools as arrays** confirmed.
- **Game area & sprite sizing:** the map is becoming the focus, so the canvas /
  sprite scale likely need to grow to give villagers room to walk to distinct spots.
  Treated as an incremental concern ("get the map into this over time") — tuned as the
  actor loop lands, not a hard prerequisite for A1.

## Free villager pool

- A villager is **free** when it is unemployed (no job) **and** not currently busy
  with a manual action.
- `freeVillagers()` = unemployed villagers minus those mid-action.
- Assigning a villager to a job removes it from the pool (as today). Manual dispatch
  marks a villager `busy` for the action's lifetime.

## Action lifecycle

1. Player clicks the action (or presses its hotkey).
2. The game finds the **most-rested free villager** + a **free tool** (if the action
   needs one). If either is missing, nothing happens (the action row is greyed).
3. Reserve that villager (`busy`) and tool.
4. Villager **walks** to the action's target tile (a tree for wood, the mine for iron,
   the hunting grounds, the training yard, etc.).
5. On arrival, **work** for a duration = base × speed-stat factor × energy factor
   (tired → longer). A progress indicator shows above the villager.
6. On completion: apply the effect (grant resources / stats), **drain that villager's
   energy**, **damage the tool**, free the villager + tool. Villager walks back to idle.

Multiple free villagers can run the same action at once (e.g. two choppers), each an
independent dispatch.

## Per-villager energy

- Each villager has `energy` 0–100 (starts 100).
- **Drain:** each action has an `energyCost` applied on completion (starting points:
  chop 8, mine 10, claw 15, hunt 25, train 20, crystal 12).
- **Tired = slower:** work duration is multiplied by `2 - energy/100` (100 → ×1,
  50 → ×1.5, 0 → ×2). Never blocks.
- **Idle recovery:** free, idle villagers regain energy at a rate scaled by global
  cardio (starting: ~`3 + cardio/50` per second). Working/assigned villagers don't.
- **Sleep action:** dispatches the **most-tired free villager** to rest (short bar);
  on completion their energy → 100. Faster than idle recovery.
- The old hunt/claw/train energy *requirements* (≥80 / ≥50 / ≥100) are dropped in
  favour of the gradient; a tired villager can still hunt, just slowly.

## Tools (one per worker)

- Replace the single `axe`/`spear` count + shared durability with **arrays of tool
  durabilities**: `state.axes = [100]`, `state.spears = [100]` (start with one each).
- Chop/mine reserve a free axe (the one with the **highest** durability), hunting
  reserves a free spear. "Free" = not reserved by an in-flight action.
- On completion the used tool takes damage (`axeWoodDmg` etc.); at ≤0 it breaks and is
  removed from the array. Buying a tool pushes `100`.
- Dispatch requires a free villager **and** a free tool for tool actions; otherwise
  greyed. This makes tool count a real limiter on parallel work.

## Jobs

Unchanged in spirit: assigning a villager to a job (woodcutter/mason/…) removes it from
the free pool, so it can't take manual actions. Passive income continues as today.

## UI changes

The panel action rows and the map both change so parallel, per-villager work reads:

- **Action rows become dispatch buttons.** Clicking sends one free villager. A row
  shows a small **"×N"** when N villagers are currently doing it, and greys when no
  villager/tool is free. (Rows keep their hotkeys + tooltips.)
- **Progress moves onto the map.** Each working villager shows a small **progress bar**
  above them that fills as they work (replacing the single panel progress bar per
  action). Resource floaters fire on completion as today.
- **Energy shows on the map.** Each villager shows a small **energy bar** (or color
  tint) so you can see who's tired. Idle-recovering and sleeping villagers read clearly.
- **Equipment panel** shows tool counts + a worn-tool durability indicator (details in
  the UI phase).

> This is the biggest visible change and the main thing to confirm at review: moving
> per-action progress from the panel bars onto per-villager indicators on the map. The
> alternative (keep one panel bar per action, only ever one worker per action type) is
> simpler but breaks the "multiple villagers, same task" goal.

## Starting state

- `villagers = 1`, `unemployed = 1` (the one villager, free).
- `state.axes = [100]`, `state.spears = [100]`.
- Resources 0 (unchanged since the auto-grant was removed).

## Code impact

- **state:** add per-villager data (energy, busy) — villager entities in the scene
  already exist; extend them and treat the scene's villager list as the source of
  truth for the pool, or mirror a lightweight list in `state` for save/load. Replace
  `axe`/`spear`/`axeDurability`/`spearDurability` with `axes[]`/`spears[]`.
- **bars.js / TimeBar:** the biggest change. An action is no longer a self-contained
  timer; it becomes dispatch → walk → work → return, driven per villager. Likely split
  into an action-dispatch controller + per-villager task state in the scene.
- **scene.js:** villagers gain `energy`, `busy`, a current task + target tile, a
  progress value, and walk/work/return movement; draw progress + energy indicators.
- **energy.js:** reworked from one global energy bar to per-villager energy (drain,
  idle recovery, sleep-rest); the global energy bar UI is removed/repurposed.
- **jobs.js:** free-pool accounting (unemployed minus busy); assigning / unassigning
  interacts with in-flight tasks.
- **registry:** ACTIONS gain `energyCost`, `tool` (`"axe"|"spear"|null`), and a target
  location per action; drop the old energy `requires`.
- **save/load:** serialize villager energy + tool arrays; `rebuildFromState` recreates
  villagers with their energy and any in-flight tasks reset to idle.

## Implementation sub-phases (each verifiable + committable)

1. **A1 — Actor loop:** start with 1 villager; manual actions require + occupy a free
   villager; auto-dispatch most-rested; villager walks to target, works, returns;
   greyed when none free. (Tools/energy still simplified — occupancy only.)
2. **A2 — Per-villager energy:** drain on work, tired-slower gradient, idle recovery,
   Sleep rests the most-tired free villager; remove the global energy bar.
3. **A3 — One tool per worker:** tool arrays, reserve/free, per-tool durability, gate
   dispatch on a free tool.
4. **A4 — Map UI:** per-villager progress + energy indicators, "×N" on rows, tidy the
   equipment panel; retire the old panel progress bars for manual actions.

## Open questions / risks

- **UI fork (above):** confirm moving per-action progress onto per-villager map
  indicators vs keeping panel bars. Everything downstream assumes the map approach.
- **Save/load of in-flight tasks:** simplest is to reset all villagers to idle on load
  (don't persist mid-walk state); confirm that's acceptable.
- **Scale:** with many villagers all working, the scene draws more indicators — fine at
  this game's scale, but worth watching.
- **Training with global stats:** who "trains" — any free villager walks to the yard,
  but the stat gain is global. Acceptable for now given stats-stay-global.
- **Bar → dispatch feel:** clicking a row repeatedly to send multiple villagers should
  feel good; may want a "send all free" modifier later.

## Definition of done

Start with one villager. Clicking an action sends that villager walking to the task; it
completes, tires them, and returns them. With more villagers you can run several actions
at once, limited by free villagers and tools. Assigning a villager to a job removes it
from manual work. Tired villagers work slower and recover when idle or via Sleep. Save/
load and the full game loop still work. No console errors.
