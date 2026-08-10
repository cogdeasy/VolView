---
name: testing-volview
description: How to run and manually test the VolView web app locally (dev server, sample data, loading images, layers, Four Up views).
---

# Testing VolView locally

## Start the app
```bash
source ~/.nvm/nvm.sh && nvm use 22
cd <repo> && npm run dev     # vite at http://localhost:5173/, sets VITE_SHOW_SAMPLE_DATA=true
```
Node 22 is required (older Node fails with `MODULE_NOT_FOUND @rolldown/binding-linux-x64-gnu`).
No login or secrets are needed — VolView is fully client-side.

## Devin Secrets Needed
None.

## Loading data
The left sidebar's **Data** tab lists **Sample Data** (only when `VITE_SHOW_SAMPLE_DATA=true`).
Small/fast samples for manual testing:
- `MRI PROSTATEx` (~3 MB, ~10 s) — **one** series only (`t2_tse_tra`).
- `MRI Cardiac 3D and Cine` (~4 MB) — **two** series (`Ax FIESTA non gated`, `2 Chamber Fiesta Cine`).

If a test needs a base image plus two layers, load BOTH samples: three series total.
Sample list lives in `src/config.ts` (`SAMPLE_DATA`).

## Layers
- The "current image" is whichever series you last clicked in the Data browser; layers are attached to it.
- To add a layer: click the ⋮ (`data-testid="dataset-menu-button"`) on another series' card →
  **Add as layer** (`data-testid="dataset-menu-layer-item"`). The item is hidden for the current image itself.
- `addLayer` rejects images whose physical bounds do not intersect
  (`src/store/datasets-layers.ts`, `vtkBoundingBox.intersects`) and shows an error toast.
  In practice PROSTATEx + Cardiac series DO intersect, so cross-sample layering works — but verify
  rather than assume when using other datasets.
- Layer rows (name, opacity slider, remove button) render in the **Rendering** tab → **Layers** section
  (`src/components/LayerList.vue` / `LayerProperties.vue`). Default layer opacity is **0.3**
  (`src/store/view-configs/layers.ts`, `defaultLayersConfig`).

## Useful UI tips
- Each 2D view has its own image binding. After changing the current image, use the series ⋮ menu →
  **Show in all views** so all four Four Up panes render the same base image; otherwise only one pane
  updates and overlay assertions across views will be misleading.
- Vuetify `v-slider` thumb labels (e.g. the numeric opacity) only appear while dragging/focused. To read
  the exact value without changing it, do a 1-pixel `left_click_drag` on the thumb and screenshot — the
  label then shows e.g. `0.30`. Do not rely on the DOM alone for visual proof.
- The Rendering tab is scrollable; collapse **Cinematic Rendering** to bring **Layers** into view.
