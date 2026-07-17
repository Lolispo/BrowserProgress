# Map: bigger area + zoned Home (forest / mine / hunt)

**Status:** design, awaiting review
**Date:** 2026-07-17
**Part of:** villager actor model A4 (the map-focus phase). Rendering + layout only.

## Problem / goal

Villagers are the actors now, so the map is the show — but it's a short strip, and
"Mine Iron" / "Go Hunting" send villagers to a bare tile with no visual node. Make the
map the focus and give Home clear, legible areas the villagers walk to.

## Decisions (locked via review)

- **Taller map, panels stay above.** Grow the canvas so villagers have room to roam.
- **Zoned Home:** forest (wood) along the top, a rock/ore **mining area** on one side,
  **hunting grounds** on the other, houses/home in the middle, road across.

## Sizing

- Canvas grows to **1150 × 460** (from 300). Grid becomes **30 cols × 12 rows** with
  near-square ~38px tiles (`tileW = 1150/30 ≈ 38.3`, `tileH = 460/12 ≈ 38.3`).
- `ROAD_ROW` moves to **row 6** (middle). Forest on row 0; building plots on rows
  1–5 (above road) and 7–11 (below).
- Sprite scale stays 2× (≈40px) — reads well against ~38px tiles.
- Canvas CSS: display width 100%, **height auto** (scale proportionally, no vertical
  squash). Villager/entity math uses the internal 1150×460 resolution as today.

## Zoned Home layout

Home is columns 0–8 (of 30), now 12 rows tall. Areas:

```
  ^^^^^^^^ FOREST (wood, row 0-1) ^^^^^^^^
  [rocks]                          ( bushes )
   MINE                              HUNT
  (cols 0-2, rows 3-5)      (cols 6-8, rows 3-5)
  ============== road (row 6) ==============>
   houses / home band (rows 7-11)
```

- **Forest (wood):** trees on the top rows across Home. Chop/Claw walk to a tree.
- **Mining area (iron):** a small cluster of **rock/ore nodes** (procedural grey
  boulders) on the left, mid-rows. Mine Iron walks to a rock node.
- **Hunting grounds (food):** **bush clumps + a small animal marker** (procedural) on
  the right, mid-rows. Go Hunting walks there.
- **Houses / home:** center + below the road (existing building plots), villager home
  band along the bottom.
- Faint labels ("Mine", "Hunt") drawn over each area for legibility, like the region
  fog labels.

These nodes are **decorative + the walk-to targets** — `scene.actionTarget` returns a
rock node for `mineIron` and a hunting spot for `hunt` (replacing today's bare tiles).

## Visuals (procedural, no art)

Consistent with the procedural terrain: rocks are grey rounded boulders; hunting
props are dark-green bush clumps with a small brown animal shape. Real sprite art
stays a later swap; all of this lives in the scene's draw pass.

## Code impact (scene.js + a little CSS/HTML)

- Canvas `height` in index.html → 460; `#canvas1` CSS height → auto.
- scene: `ROWS = 12`, `ROAD_ROW = 6`; recompute `tileH`.
- `buildingConfig` rows reassigned to the taller grid (above/below the new road row).
- New `homeFeatures` (rock nodes + hunting spots) with tile positions; a `drawFeatures`
  pass draws rocks, bushes, animal markers, and area labels.
- `actionTarget`: `mineIron` → a rock node; `hunt` → a hunting spot.
- Tree forest may span rows 0–1 for a fuller treeline.

## Not in this plan (tracked separately)

- **Balance/pacing pass** (early yields, walk times) — the actor model made the
  opening slow; its own focused pass.
- **Scout unification** onto the villager model (still decrements the unemployed
  count) — a later A4 follow-up.
- New-resource **region** nodes (stone/gold/crystal areas in Hills/Mountains/Cavern)
  can reuse this feature system once Home reads well.

## Definition of done

The map is taller and clearly the focus. Home shows a forest, a rock mining area, and
hunting grounds as distinct labelled zones. "Mine Iron" sends a villager to the rocks;
"Go Hunting" sends them to the hunting grounds; chopping to the forest. Layout holds,
save/load + the loop still work, no console errors.
