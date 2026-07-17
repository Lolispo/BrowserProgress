# HUD redesign: minimize chrome, maximize map

**Status:** design, awaiting review
**Date:** 2026-07-17
**Goal:** give the map most of the screen. Shrink the top panels into a thin bar,
move interactions into overlays/toolbars that only take space when needed.

## Problem

The four stacked panels (Equipment / Village / Shop / Jobs) eat the top ~46vh even
capped, so the map — now the actual game — is squeezed. The player wanted the map to
be the focus with chrome pulled out of the way.

## Target layout

```
+-----------------------------------------------------------------------+
| 🪵 120  ⛏ 40  🍖 30   🪨 - 💰 - 💎 -    🪓x2 🗡x1     🛒 👷 🎯 💬 ⚙ |  top bar (thin)
+-----------------------------------------------------------------------+
|                                                                       |
|                          MAP  (fills the space)                       |
|                                                                       |
|            (Shop / Jobs / Goal / Messages open as overlays here)      |
|                                                                       |
+-----------------------------------------------------------------------+
|  [1 Chop] [2 Mine] [3 Hunt] [4 Claw] [5 Train..] [9 Sleep]            |  work toolbar
+-----------------------------------------------------------------------+
```

- **Top bar (thin):** resource **icons + counts** (wood/iron/food always; stone/gold/
  crystal appear as they unlock), the **tool counts** (🪓×N 🗡×N — this replaces the
  Equipment panel), then icon buttons: **🛒 Shop, 👷 Jobs, 🎯 Goal, 💬 Messages,
  ⚙ Settings**.
- **Map:** everything between the top bar and the work toolbar.
- **Work toolbar (bottom):** the action dispatch buttons in a horizontal row, always
  visible (with their number-key badges).
- **Overlays:** Shop, Jobs, Goal, and Messages open **over the map** (a floating panel)
  when their icon is clicked, and close again (click icon or an ✕). Settings holds
  **Reset Game** (restyled) and the dev speed toggle.

## What changes / goes away

- **Equipment panel removed** — tool counts (🪓×N, 🗡×N) move to the top bar; the
  durability detail can live in a tooltip or the Shop.
- **Resources** become the icon row in the top bar (no more text list).
- **Shop** stops living in the top row — a 🛒 icon opens it as a map overlay.
- **Jobs** likewise become a 👷 overlay.
- **Goal** and **Action Messages** become toggled overlays (💬/🎯), closed by default —
  messages are basically debug for now, so they don't hold space.
- **Reset Game** moves into ⚙ Settings and gets styled (it's currently a bare button).

## Phasing

- **UI-1 (this plan):** the top bar + bottom work toolbar + overlay panels
  (Shop/Jobs/Goal/Messages/Settings) + drop the Equipment panel. Pure layout/CSS +
  small JS for open/close toggles; game logic untouched. This alone hands most of the
  screen to the map.
- **UI-2 (separate, later):** **sector views** — let the world be much wider than the
  viewport and switch/pan between sectors (Home / Hills / Mountains / Cavern), so you
  focus one at a time ("view Hills only"). This is a camera/viewport change to the
  scene and is its own design + build.

## Code impact (UI-1)

- `index.html`: restructure the top region into a thin top bar; add a bottom work
  toolbar container; add overlay containers for shop/jobs/goal/messages/settings.
  The action bars + shop buttons + job rows keep their existing ids (so bars.js /
  shops.js / jobs.js keep working) — they just get re-parented into the toolbar /
  overlays.
- `style.css`: new top-bar, toolbar, and overlay styles; the map/canvas grows to fill.
- Small JS (controls.js or a new ui.js): open/close overlay toggles wired to the icon
  buttons; resource icons reuse the existing `#wood` etc. spans (moved into the bar).
- No changes to registries, scene, or save/load.

## Open questions

- Exact icon set / emoji (🛒 👷 🎯 💬 ⚙) — placeholders, easy to swap.
- Whether the work toolbar should also show per-action "×N working" badges (nice, can
  fold in).
- Overlay dismiss: click-outside vs an ✕ vs re-clicking the icon (I'd do icon-toggle +
  ✕).

## Definition of done

Top bar is a thin strip of resource icons + tool counts + menu icons; work actions are
a bottom toolbar; Shop/Jobs/Goal/Messages/Settings open as closable overlays over the
map; Equipment panel is gone; the map fills the space between. Everything still works
(dispatch, buy, jobs, save/load), no console errors.
