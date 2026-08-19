---
name: testing-volview
description: How to run and end-to-end test VolView (browser-based DICOM/3D radiology viewer) locally — Node version requirement, dev server, sample data, and the golden UI flow (2D slices, 3D volume rendering, ruler annotation).
---

# Testing VolView locally

## Node version (most common blocker)

VolView's vite/rolldown toolchain needs Node `^20.19 || >=22.12`. If the box's default Node is
older (e.g. 20.18.x), `npm run dev` dies with `MODULE_NOT_FOUND: @rolldown/binding-linux-x64-gnu`.
The native binding is not installed for the wrong Node version, so **`node_modules` must be
reinstalled with the correct Node**, not just re-sourced:

```bash
source ~/.nvm/nvm.sh && nvm install 22 && nvm use 22
cd /path/to/VolView && rm -rf node_modules && npm install
```

Source nvm and `nvm use 22` in **every** shell you run `npm` from. If a similar
`MODULE_NOT_FOUND` appears for another optional/native package, suspect the same root cause.

## Running the app

```bash
source ~/.nvm/nvm.sh && nvm use 22 && npm run dev   # vite on http://localhost:5173/
```

`npm run dev` sets `VITE_SHOW_SAMPLE_DATA=true` (see `package.json`), which is what makes the
**Sample Data** panel appear in the Data tab. If you serve a plain `vite preview` / production
build without that env var, there will be no sample datasets and you'll need local DICOM files.

Unit tests: `npx vitest run` (~70 s, ~820 tests). The wdio e2e suite
(`npm run test:e2e:chrome`) requires a full production build first and is slow — skip it unless
specifically asked.

## Golden end-to-end UI flow (good recording script)

1. **Load sample data.** Data tab → *Sample Data* → click a card. Datasets are defined in
   `src/config.ts` (`SAMPLE_DATA`). **MRI PROSTATEx (3 MB)** is the fastest real 3D volume — it
   loads in ~10 s and populates both 2D and 3D views. `Ultrasound Cine` (225 KB) is 2D cine only
   (no volume). `CTA Head and Neck` is 80 MB — avoid unless you specifically need a pretty CT
   volume render. Downloads hit `data.kitware.com`, so network egress must be allowed.
2. **Default layout is "Four Up"** (`src/config.ts` `DefaultNamedLayouts`): axial + coronal on
   top, sagittal + 3D volume on the bottom. One screenshot proves 2D and 3D at once — no layout
   switching needed.
3. **Assert slice changes objectively.** Each 2D pane's bottom-left overlay prints
   `Slice: n/N` and `W/L: ...` (`src/components/SliceViewerOverlay.vue`). Mouse-wheel over a pane
   changes the slice; screenshot the counter before/after AND compare the pixels, since a label
   change alone doesn't prove re-rendering.
4. **3D volume.** Rendering tab → **Color Presets** → pick a strongly-colored preset such as
   *CT Bones* to make the change obvious. The 3D pane's top-right corner label shows the active
   preset name, which is a good text assertion. Left-drag inside the 3D pane rotates; take a
   screenshot mid-drag (button held) to prove the interaction. Note VolView defaults MR series to
   the `CT-Coronary-Arteries-2` preset (`DEFAULT_PRESET_BY_MODALITY`) — odd-looking but intended.
5. **Annotations.** Tools live in the vertical controls strip between the left panel and the
   views (`src/components/ControlsStripTools.vue`); each button has
   `data-testid="control-button-<name>"` and a keyboard shortcut from `ACTION_TO_KEY`
   (ruler `m`, paint `p`, rectangle `r`, crop `b`, polygon `g`, zoom `z`, pan `n`). Click Ruler,
   then click two points on a 2D pane → a red ruler with an mm label is drawn and the
   Annotations tab → Measurements lists `Slice / Axis / Length`. Ruler, Rectangle, Polygon and
   Paint are **disabled in oblique layouts** and while no image is loaded.
6. **Error surface.** The bell icon at the bottom of the left rail opens the in-app notification
   center; "No notifications to display" with Error/Warning/Info all checked is solid evidence of
   a clean run. Sample-data failures surface there as "Failed to load sample data".

## Useful test ids

`samples-list`, `two-view-container`, `vtk-view vtk-two-view`, `vtk-view vtk-volume-view`,
`module-tab-<Data|Annotations|Rendering>`, `control-button-<tool name>`.

## Devin Secrets Needed

None — VolView is fully client-side, no login or API keys. Only outbound network access to
`data.kitware.com` (and `raw.githubusercontent.com` for the Ultrasound Cine sample) is required
to download sample datasets.
