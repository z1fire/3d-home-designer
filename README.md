# Design Office — 3D Home Remodeler

A small, self-contained home-design tool for planning remodels: draw rooms, cut in doors
and windows, furnish them, paint every surface, and give a room a vaulted ceiling — with a
live 3D view next to the floor plan.

**▶ Try it: https://z1fire.github.io/3d-home-designer/**

## Running it

Use the link above, or clone the repo and double-click **`index.html`**. That's it — no install,
no internet connection, no build step. Everything (including three.js in `js/vendor/`) is local,
and every plan you make stays in your own browser.

Tested in Chrome and Edge. Your work saves itself into the browser automatically; use
**Save file** for a portable `.json` copy you can back up, email, or reopen later.

## What's in it

**Floor plan (left)**
- **Room** drags out a rectangle; **Shape** clicks out any polygon (L-shaped rooms, bays, etc.).
- Drag a room to move it, drag a corner dot to reshape it, double-click a wall to add a corner,
  Alt+click a corner to remove one.
- **Door** / **Window** — click a wall to place one, then drag it along the wall. Openings are
  cut through the real wall geometry in 3D, with casing, sills, muntins and a swinging door slab.
- Live dimensions on every wall of the selected room; snapping to 3″.

**3D view (right)**
- Left-drag orbit, right-drag pan, wheel zoom. **Walk** drops you inside at eye height
  (W A S D to move, Q/E up-down, drag to look, Shift to move faster).
- *Cut away near walls* removes whatever stands between you and the room you're looking into.
- Sun slider moves the light around the house; shadows and ceilings toggle on and off.

**Paint**
- Pick a color from the chip palette (or any custom color), choose the **Paint** tool, then click a
  wall, floor or ceiling — in either view. One wall at a time, or tick *paint all walls in the room*.

**Flooring** — per room: hardwood (6″ plank, wide plank, narrow strip), parquet block, 12″ tile,
24″ stone tile, 3″ mosaic, carpet, polished concrete, or flat color. Every pattern is generated
procedurally at load time — no image files — and is tinted by the room's *Floor tint*, so the same
oak plank works in honey, walnut or gray-wash. Directional materials (planks, carpet) have a
**Direction** setting: left–right, up–down, or 45°/135° diagonal. Patterns are drawn at true scale,
so a 12″ tile really is a foot across, and the panel shows a swatch of about 4 ft of floor —
click it to flip through the materials.

**Ceilings** — per room, on the right-hand panel:

| Shape | What you get |
| --- | --- |
| Flat | plate height straight across |
| Vaulted gable | ridge down the middle, both sides slope to the walls |
| Vaulted — flat top | both sides slope up into a flat centre band (a clipped gable); set the flat width in feet and it reports the resulting roof slope in "in 12" |
| Shed / slanted | one wall high, the opposite wall low |
| Cathedral barrel | curved vault |
| Tray | flat perimeter band with a raised center |

*Rise* is how far the peak sits above the wall plate; *Direction* rotates the ridge. Wall tops —
including gable ends — are rebuilt to follow whatever ceiling you choose.

**Furnishing** — ~45 procedural pieces (sofas, beds, cabinets, appliances, fixtures, stairs,
ceiling fans and lights). Every piece can be resized, recolored, raised off the floor, and rotated.
*Against wall* snaps a piece back against the nearest wall of the room it's in. Ceiling-hung items
follow a vaulted ceiling's height automatically.

## Keys

`V` select · `1` room · `2` shape · `3` door · `4` window · `5` paint
`R` `[` `]` rotate selection · `Del` delete · `Ctrl+D` duplicate
`Ctrl+Z` / `Ctrl+Y` undo / redo · `Ctrl+S` save file · `0` fit views · `F` walkthrough · `Esc` cancel

Sizes accept `12'`, `12' 6"`, `12.5`, `30"` — anything reasonable.

## Files

```
index.html      layout + panels
styles.css      styling
js/core.js      units, geometry math, the project model, undo, autosave, sample home
js/textures.js  procedural floor materials (canvas-drawn, tinted, world-scaled)
js/furniture.js the catalog and every procedural furniture model
js/build.js     walls, openings, floors and the ceiling height field → three.js meshes
js/plan.js      2D floor-plan editor
js/view.js      3D viewport, camera, picking, painting
js/ui.js        panels, property sheet, keyboard, file open/save
js/vendor/      three.js r147
```

## Conventions worth knowing

- Everything is in **feet**; the plan lives in the X/Z plane and Y is up.
- A room's outline is the **outside face of its walls**, and walls are built inward from it — so two
  rooms drawn edge-to-edge share a clean, back-to-back wall instead of overlapping.
- Each room owns its own walls, so an interior partition between two rooms is two wall skins.
  Paint them independently — that's usually what you want when remodeling one room at a time.

## Credits

3D rendering by [three.js](https://threejs.org) r147 (MIT), vendored in `js/vendor/`.
Everything else — geometry, furniture models, floor textures, UI — is written from scratch here.
