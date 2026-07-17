# Tile-Based World + Living Road

**Status:** design, awaiting review
**Date:** 2026-07-17
**Depends on:** Phase 2 scene graph + Phase 3 regions. This is a rendering redesign
of `scene.js`; game logic/state is largely untouched.

## Problem

The world is four flat colored bands with sprites placed at free x/y positions.
It reads as "colored rectangles," and moving between regions is just a color
change — no sense of place or of a journey. Goal: render the world as a proper
**tile grid** with distinct terrain per region, connected by a **road that
physically extends as you claim regions**, so progression is something you see on
the map.

## Decisions (locked via brainstorming)

- **Tile grid**, not free placement — discrete textured tiles.
- **Procedural terrain** (canvas-drawn, no art assets); real tileset art is a
  later swap.
- **Living road + gateways** — a continuous road threads the regions and paves
  forward as each is scouted; a gateway marks each border and opens on claim.

## The grid

- Tile size ≈ 38px, tuned so columns divide the 1150×300 canvas evenly →
  roughly **30 columns × 8 rows**. `TILE`, `COLS`, `ROWS` derived from canvas
  size in `scene.init`.
- Regions are **column ranges** derived from the existing `REGIONS[*].zone`
  fractions × `COLS`:

  | Region | Columns (of 30) |
  |--------|-----------------|
  | Home | 0–8 |
  | Hills | 9–15 |
  | Mountains | 16–22 |
  | Crystal Cavern | 23–29 |

- A helper `regionAtCol(col)` maps a column back to its region id (for terrain +
  fog + road logic).

## Terrain rendering (procedural, no art)

Replace the flat `fillRect` per zone with a per-tile draw pass. For each tile:

- Base color from the tile's region palette.
- Subtle **deterministic** per-tile variation (a hash of `col,row` → small
  lightness jitter) so ground looks textured, not flat. Deterministic so it
  doesn't shimmer each frame.
- Soft 1px edge/shadow so tiles are legible as a grid without harsh lines.

Region palettes (starting points):

| Region | Ground |
|--------|--------|
| Home | grass greens (#3fbf3f base, jittered) |
| Hills | dirt/tan (#c9b37e) with occasional rock-fleck tiles |
| Mountains | grey stone (#9aa0a6) |
| Crystal Cavern | dark crystal rock (#4a3b63) |

## The living road

- A dedicated **road row** (≈ row 5 of 8, lower-middle) runs left→right. Road
  tiles are a distinct packed-dirt/cobble look, drawn *above* the terrain of
  that tile.
- The road is drawn only across **claimed** regions (Home is claimed at start).
  It stops at the **frontier** — the boundary of the furthest claimed region.
- At each region border sits a **gateway** (two posts + a lintel, drawn on the
  road row). A gateway is **open** if the region past it is claimed, otherwise
  **closed/blocked**, with the existing "Build a Mine to scout" hint shown at
  that gateway instead of centered in the fog.
- On claim (`scene.revealRegion`), the road paves into the newly claimed region
  up to its far gateway. (First cut: appears immediately; an optional
  tile-by-tile paving animation is a polish item.)

## Fog on locked regions

Unchanged in spirit: locked regions render their tiles dimmed/fogged over their
column range. The scout hint moves to sit at the region's gateway on the road
(clearer connection to "the path forward").

## Entities snap to tiles

Reuse the scene graph; quantize positions to tile cells.

- **Buildings**: each type keeps a region + a tile row (its "lane") and flows
  across free tile columns in that region on **plots** above/below the road row.
  `buildingConfig` lanes become tile rows; `layoutBuildings` snaps to cell
  centers.
- **Trees**: fill Home's top rows as a forest block, one per tile cell.
- **Villagers**: still move smoothly, but their targets are **tile centers**
  (home tile, workplace tile). Movement code is unchanged; only targets snap.

## Code mapping (scene.js)

- Add `TILE`, `COLS`, `ROWS`, `regionCols` (per-region [startCol,endCol]),
  `ROAD_ROW`, and `regionAtCol()`.
- New `drawTerrain(ctx)` (per-tile) replaces the flat fill in `drawZones`; fog +
  gateway hints fold into it.
- New `drawRoad(ctx)` draws road tiles across claimed regions + gateways.
- `cellCenter(col,row) -> {x,y}` and `snapToCell()` helpers.
- `buildingConfig`, `layoutBuildings`, `addVillager`, `updateVillager`,
  `buildTreeRow` reworked to think in tiles.
- **No required changes** to `state`, the registries, or the other files — the
  road/frontier is derived from `state.regions`, which already exists. (Scout
  hint text already lives in the fog path from a prior commit.)

## Implementation sub-phases (each verifiable + committable)

1. **T1 — Tile terrain:** grid + procedural per-region tiles + fog, replacing the
   flat bands. Entities still render on top at current positions.
2. **T2 — Road + gateways:** road row across claimed regions, gateways with
   open/closed state, scout hint at the gateway; road extends on claim.
3. **T3 — Snap entities:** buildings/trees/villagers onto the tile grid (plots
   beside the road, forest block, tile-center targets).
4. **T4 — Polish (stretch):** villagers walking the road between regions; a
   tile-by-tile paving animation on claim; decorative prop tiles.

## Open questions / risks

- **Legibility at 38px sprites on 38px tiles** — buildings may fill a whole
  cell; may want buildings drawn slightly inset or spanning tiles. Tune in T3.
- **Vertical fit** — 8 rows × 38px = 304px vs 300px canvas; tile size will be
  tuned (or a row dropped) so it fits cleanly.
- **Responsive** — grid math assumes the fixed 1150×300 canvas (same assumption
  as today); revisit if the canvas becomes responsive.
- **Art** — procedural tiles are the first cut; a real tileset is a later,
  isolated swap since all terrain drawing is centralized in `drawTerrain`.

## Definition of done

The world renders as a tile grid with distinct, textured terrain per region; a
road threads the claimed regions and visibly extends when a new region is scouted;
gateways mark borders and show the unlock hint; buildings, trees and villagers sit
on the grid. No console errors; save/load and the full game loop still work.
