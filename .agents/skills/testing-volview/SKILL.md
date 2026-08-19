---
name: testing-volview
description: How to run and manually test the VolView medical image viewer in a browser — dev server startup, loading sample data, finding the tool strip / Settings, and drawing ruler/rectangle/polygon annotations.
---

# Testing VolView in the browser

## Running the app
```bash
source ~/.nvm/nvm.sh && nvm use 22   # Node 22 required; older Node fails with MODULE_NOT_FOUND @rolldown/binding-linux-x64-gnu
cd <repo> && npm install             # only if node_modules is stale or Node was switched
npm run dev                          # vite on http://localhost:5173/, sets VITE_SHOW_SAMPLE_DATA=true
```
No credentials, backend, or secrets are needed — VolView is a pure client-side SPA. Nothing is required from
the user to test annotation/viewer features.

## Loading data
Left panel → **Data** tab → **Sample Data** accordion. `MRI PROSTATEx` (~3 MB) loads in ~10–15 s and is the
fastest usable volume; it opens in the four-up layout (Axial / Coronal / Sagittal / 3D volume).
Reloading the page discards all loaded images and annotations — re-load the sample after every reload.

## Left control strip (top → bottom, maximized 1024-wide Chrome window, x ≈ 311)
open files, save, layout, window/level, pan, zoom, crosshairs, **select**, paint, **rectangle**
(`mdi-vector-square`), **polygon** (`mdi-pentagon-outline`), **ruler** (`mdi-ruler`), crop, screenshot …
and at the very bottom notifications + **Settings cog** (y ≈ 685). Hovering a button shows a tooltip with its
name and single-key shortcut (e.g. `Ruler [m]`, `Select [s]`) — use hover to confirm positions instead of
guessing, since the strip's contents depend on the loaded data and layout.
The tool definitions live in `src/components/ControlsStripTools.vue`.

## Drawing annotations
- **Ruler**: select the tool, then **click** the first point and **click** the second point.
- **Rectangle**: use **click … click** (two separate clicks for opposite corners). A press-drag-release
  gesture appears to draw the rectangle while the button is held but the annotation may NOT be committed
  (it vanishes and never appears in the Measurements list). If a freshly drawn rectangle disappears,
  retry with two discrete clicks before reporting a bug.
- **Polygon**: click each vertex, then click the first vertex again to close/finish it.
- To move/resize an existing annotation, switch to the **Select** tool first; with a drawing tool still
  active, a click on empty canvas starts a *new* annotation instead of editing the existing one.
- Annotations are listed under left panel → **Annotations** tab → **Measurements**; rulers show
  `Length: NN.NN mm` there, useful for cross-checking on-canvas text.

## Zoom / pan
Mouse scroll changes the slice, it does not zoom. Use the **Zoom** tool (drag up = zoom in, down = zoom out)
and the **Pan** tool (drag) from the control strip, then switch back to Select.

## Settings
Cog at the bottom of the control strip opens a modal (`src/components/Settings.vue`) with the theme switch,
Camera Auto Reset and, on branches that have it, `Annotation Labels and Measurements (On/Off)`. These
switches are `useLocalStorage`-backed, so they survive a page reload; verifying persistence just means
reloading and re-opening the dialog. The modal covers the middle of the screen — close it (X, top-right)
before asserting anything about the render views.

## Devin Secrets Needed
None.
