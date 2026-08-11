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
- **Wall** runs walls point to point: click or drag to place each corner and it carries straight on
  from there, so a whole run is one gesture per corner. **Enter**, **Esc**, right-click or
  double-click ends the run. Hold **Shift** to lock a segment to 45°. It is centred on its line with
  two finished faces, both ends are draggable, length and angle are typeable, and doors, windows and
  openings can be cut into it. **Pony wall** drops it to 3′ 6″ for a half wall.
- **Walls join up.** Drop an end near another wall's end, a room corner, or anywhere along a wall or
  room face and it snaps exactly onto it — a green ring marks what it caught. Joined walls then
  **build as one structure**: each end is mitred into the joint so a corner comes out solid instead
  of leaving a notch, and baseboards run through. The joint also holds when you edit:
  drag either wall and the other follows, and a wall tee'd into the middle of another slides along it
  as that wall is moved or swung rather than tearing off. Moving a whole room takes its attached
  partitions with it.
- **Close a ring of walls and it becomes a room.** Draw walls around an area and the moment the last
  one closes the loop they turn into a room with a floor, a ceiling and its own finishes — any shape,
  not just rectangles. Each wall's paint carries over as a per-wall colour and its doors and windows
  land in the same place on the new outline. The outline is grown outward by half the wall thickness
  so nothing moves. Ctrl+Z puts the walls back; a wall already in a ring gets a **Make a room** button.
- Drag a room to move it, drag a corner dot to reshape it, double-click a wall to add a corner,
  Alt+click a corner to remove one.
- **Door** / **Window** / **Opening** — click a wall to place one, then drag it along the wall.
  Openings are cut through the real wall geometry in 3D, with casing, sills, muntins and a swinging
  door slab. **Opening** breaks a wall through for a hallway or pass-through.
- Where two rooms back onto each other there are **two wall skins**, so an opening on a shared wall
  is cut through both and the pair stays linked — move, resize, retype or delete one side and the
  other follows. If you draw the room on the far side afterwards, a **Cut far side too** button
  appears on the opening.
  Size them by **rough opening** *or* by **trim to trim** — type either and the other follows.
  Casing width is adjustable per opening (3½″ default), and the panel reports the glass size and
  where each trim edge lands along the wall. Untick **Trim** for a drywall-return opening with no
  casing at all — the reveal is then finished in the wall colour rather than trim white.
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

**Furnishing** — 60 procedural pieces across Living, Dining, Kitchen, Bedroom, **Office**, Bath and
Structure: sofas, beds, cabinets, appliances, fixtures, stairs, ceiling fans and lights, plus a full
office set (L-shaped / executive / standing desks, task and guest chairs, monitors, printer, file
cabinets, credenza, storage, shelving, conference table, whiteboard and an equipment rack).
Every piece can be resized, recolored, raised off the floor, and rotated.
A **Position in room** row places a piece exactly: *Against wall* backs it up to the nearest wall;
*Into corner* tucks it into the nearest corner with its back to one wall and its side to the other,
keeping whichever of the two orientations is closest to how it is already turned; *Center* centers it
in the room, and *Center ↔* / *Center ↕* center one axis while leaving the other where you put it —
so a sofa can sit centered on the wall it faces without leaving that wall. Ceiling-hung items follow
a vaulted ceiling's height automatically.

## Keys

`V` select · `1` room · `2` shape · `3` wall · `4` door · `5` window · `6` opening · `7` paint
`R` `[` `]` rotate selection · `Del` delete · `Ctrl+D` duplicate
`Ctrl+Z` / `Ctrl+Y` undo / redo · `Ctrl+S` save file · `0` fit views · `F` walkthrough · `Esc` cancel

Sizes accept anything a tape measure would say: `12'`, `12' 6"`, `12'6-1/2"`, `12 6 1/2`, `12.5`,
`30"`, `3½"`, `42 in`. Everything is displayed to the nearest eighth of an inch.

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

## Inside vs outside dimensions

The **Measure** switch (in the plan toolbar, and on every room's panel) decides whether *every*
dimension in the app is taken to the outside face of the walls or wall-to-wall inside the room:

| | Outside | Inside (clear) |
| --- | --- | --- |
| Room width / depth | framing to framing | what a tape measure reads across the finished room |
| Area | footprint | finished floor area |
| Wall length | full outside edge | the clear run between the adjacent walls |
| Door / window *Along wall* | from the outside corner | from the inside corner |
| Size shown while dragging a new room | the footprint | what it leaves you inside |

Set it to **inside**, type the sizes you measured, and the walls get added *outside* them — so a
room you enter as 13′ 2″ × 11′ 8″ really is that wall-to-wall. Switching modes never moves anything;
it only changes which face the numbers are read from. Interior corners are properly mitred, so
L-shaped and angled rooms report correctly too.

## Conventions worth knowing

- Everything is in **feet**; the plan lives in the X/Z plane and Y is up.
- A room's outline is stored as the **outside face of its walls**, and walls are built inward from it —
  so two rooms drawn edge-to-edge share a clean, back-to-back wall instead of overlapping. The
  Measure switch is a lens over that; it does not change how anything is stored.
- Each room owns its own walls, so an interior partition between two rooms is two wall skins.
  Paint them independently — that's usually what you want when remodeling one room at a time.

## Credits

3D rendering by [three.js](https://threejs.org) r147 (MIT), vendored in `js/vendor/`.
Everything else — geometry, furniture models, floor textures, UI — is written from scratch here.
