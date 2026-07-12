# Phase 3 — Core Gameplay Loop (Expansion + Village Growth)

**Status:** design, awaiting review
**Date:** 2026-07-12
**Depends on:** Phase 1 (data-driven registry, `state`) and Phase 2 (animated scene).

## Problem

Resources accumulate with nowhere meaningful to go. There is no reason to want
more wood/iron/food beyond the buildings already available, and no destination for
the whole game. Phase 3 adds the pull: a reason to gather, expand, and grow, ending
in a win.

## The core loop

One tight spiral (not two parallel systems):

```
grow the village (population + new buildings)
   -> meet a scout's requirement
   -> scout a new region (timed action, costs villagers' time)
   -> gain that region's new resource
   -> build the next-tier buildings with it
   -> grow more ...
   -> finally build the Monument = WIN
```

Village growth is *what unlocks expansion*, and expansion is *what enables more
growth*. Each new building is simultaneously a growth milestone and the gate for the
next scout.

## Design decisions (locked)

- **Pull:** each new region introduces exactly one **new resource** that is the only
  way to build the next tier. You expand because old regions can't give you what the
  next buildings need.
- **End state:** a finite chain leading to a **Monument** you build to win. Play may
  continue after (no forced reset; no prestige in this phase).
- **Unlock mechanic:** a **scout** — a timed action (reusing the Phase 1 `TimeBar`)
  that appears when its requirement is met, occupies N villagers while it runs, and
  claims the region on completion.
- **Scout villagers:** **return** to the unemployed pool when the scout finishes
  (busy, not consumed). Cost is time + opportunity.
- **Loop shape:** milestones gate the scouts (unified loop).
- **Building effects:** **both** — resource buildings add passive-income jobs;
  Blacksmith/Farm give efficiency boosts.

## The chain

Three new regions past Home; one gating resource each. Numbers below are **starting
points for balancing**, not final.

The "Scout" column is the scout duration and the number of unemployed villagers it
occupies while running (they return when it finishes). The "Scout requirement" is the
total population + building you must already have for the scout to appear.

| Region | New resource | Scout requirement | Scout (time, villagers) | Unlocks (requires that resource) |
|--------|-------------|-------------------|-------------------------|----------------------------------|
| **Home** (start) | wood, iron, food | — | — | house, lumber mill, mine, hunting lodge, training yard |
| **Hills** | **Stone** | 4 villagers + a Mine | ~20s, 2 villagers | Quarry, Farm, Blacksmith |
| **Mountains** | **Gold** | 8 villagers + a Blacksmith | ~30s, 3 villagers | Market |
| **Crystal Cavern** | **Crystal** | 15 villagers + a Market | ~40s, 4 villagers | Monument |
| — | — | — | — | **Monument** → victory |

Monument cost (starting point): large mixed cost across every resource, e.g.
`2000 wood + 1000 iron + 1500 stone + 800 gold + 200 crystal`.

## New buildings and effects

All are new `SHOP_ITEMS` entries with costs in the new resources.

| Building | Cost (starting) | Effect |
|----------|-----------------|--------|
| **Quarry** | 400 wood + 300 stone | Unlocks **Mason** job → stone/tick (like WoodCutter). |
| **Farm** | 300 wood + 200 stone | +housing and passive food/tick; raises `foodInc`. Growth milestone. |
| **Blacksmith** | 500 stone + 100 iron | Boost: equipment takes less durability damage (e.g. ×0.6) and gathering yields a bit more. Gate for Mountains. |
| **Market** | 1200 stone + 300 iron | Unlocks **Trader** job → gold/tick. Gate for Crystal Cavern. |
| **Monument** | huge mixed | Build it → win screen. |

> Gold bootstrap: the Market must be buildable *before* you have any gold, so it costs
> stone + iron (no gold). Gold is produced *by* the Market's Trader job, so it exists
> only to spend on the Monument.

New jobs (extend the existing jobs system): **Mason** (stone), **Trader** (gold),
alongside WoodCutter / IronWorker / Hunter.

## The map (fills the empty canvas)

Divide the wide canvas into horizontal **region zones**, left → right:

```
| Home (0-30%) | Hills (30-52%) | Mountains (52-74%) | Cavern (74-100%) |
```

- Each zone has a distinct ground tint (green → tan hills → grey mountains → dark
  cavern) drawn as background bands.
- A **locked** zone renders fogged/dimmed with a "Scout to unlock" label.
- Claiming a region clears its fog; its buildings and resource markers render inside
  its x-range.
- Buildings place into their region's zone (existing Home buildings unchanged; Quarry
  in Hills, Market in Mountains, Monument in Cavern).
- No camera or scrolling — reuses the fixed canvas and the Phase 2 scene graph, and
  finally uses the full width.

Asset note: there are no stone/gold/crystal sprites yet. First cut represents new
resource nodes with simple colored shapes/labels and zone tints; real art is a later
polish item.

## How it maps to the code (reuses Phase 1 + 2)

- **`state`:** add `stone`, `gold`, `crystal` (0), job counts `mason`, `trader`, and
  building counts `quarry`, `farm`, `blacksmith`, `market`, `monument`. Add a
  `regions` map: `{ home:true, hills:false, mountains:false, cavern:false }`.
- **New `REGIONS` registry** (`data/registry.js`): `{ id, label, resource, zone:[x0,x1],
  tint, scout:{ requires, villagers, time } }` — same data-driven style as `ACTIONS`.
- **Scouts:** entries rendered as bars (a `SCOUTS` list or flagged `ACTIONS`). Gated by
  `meetsRequirements`; `onStart` occupies N unemployed villagers; `onDone` returns them,
  sets `state.regions[id]=true`, and reveals the zone. One-shot (hide after claimed).
- **New buildings/jobs:** new `SHOP_ITEMS` + extend the `JOBS` list in `jobs.js`.
- **Effects:** Blacksmith/Farm read from `state` in the relevant tuning spots
  (durability damage, `foodInc`, housing).
- **Scene:** add region zones (tinted bands + `locked` fog); place buildings by region;
  simple resource-node markers per region.
- **Win:** building the Monument shows a victory overlay.

New HTML: resource labels for stone/gold/crystal in the inventory column; job rows for
Mason/Trader; a hidden victory overlay div.

## Implementation sub-phases

1. **3a — Regions & resources scaffold:** add state (`stone/gold/crystal`, `regions`),
   the `REGIONS` registry, HTML labels, and zone rendering (tints + fog + labels). No
   scouting yet; regions can be flipped via console to verify zones draw.
2. **3b — Scouting:** scout bars, villager occupy/return, region claim reveals zone.
3. **3c — New buildings & jobs:** Quarry/Farm/Blacksmith/Market + Mason/Trader jobs +
   Blacksmith/Farm effects.
4. **3d — Monument & win:** Monument building + victory overlay.
5. **3e — Balance pass:** tune costs, scout times, income rates so the chain paces well
   from a fresh (non-dev) start.

Each sub-phase is independently verifiable in the browser and committable.

## Open questions / risks

- **Balancing** is the real work: the chain must feel earned but not grindy from a
  zero-resource start (dev sandbox hides this — must test with `developer=false`).
- **Market/gold bootstrap** resolved above (Market costs stone; gold comes from its job).
- **Art:** new resources have no sprites; first cut uses shapes/tints, art later.
- **Scene width:** region zones assume the current fixed 1150px canvas; if the canvas
  becomes responsive later, zone math must follow.

## Definition of done

From a fresh build (`developer=false`): a player can gather → grow → scout Hills →
Mountains → Cavern, build each tier's buildings, and finally build the Monument to
trigger a win screen, with the map visibly filling in region by region.
