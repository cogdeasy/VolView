---
name: testing-volview
description: How to run and end-to-end test the VolView / Philips Volume Viewer web app locally (dev server, sample data, themes, branding surfaces, mobile layout, browser-automation quirks).
---

# Testing VolView (Philips Volume Viewer) locally

## Devin Secrets Needed

None. The app is fully client-side; no login, API keys, or backend are required. Sample data is
downloaded from `data.kitware.com` over the public internet, so outbound network access is needed
for the golden-path test.

## Running the app

```bash
source ~/.nvm/nvm.sh && nvm use       # .nvmrc pins 22; see CONTRIBUTING.md
npm run dev                           # http://localhost:5173, sample data enabled
```

Node 20 does not work: `vite` needs `^20.19.0 || >=22.12.0` and `@commitlint/cli` needs
`>=22.12.0`, so even the newest 20.x fails the commit hooks. 21 and 23 are excluded by `vitest`.

`npm run dev` sets `VITE_SHOW_SAMPLE_DATA=true`, which is what populates the "Sample Data" list in
the left panel. A dev server may already be running — check with
`curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/` before starting another.

**Confirm the server serves the branch you think it does** before testing: `curl -s
http://localhost:5173/ | head -20` and check the `<title>` / injected meta tags. `index.html` is
templated through `createHtmlPlugin` in `vite.config.ts`, so branding changes show up in the raw
HTML — a cheap way to prove you are not testing a stale build.

## Fast sample data for the golden path

`src/config.ts` holds `SAMPLE_DATA`. Prefer the small ones so tests stay quick:
- **MRI Cardiac 3D and Cine** (4 MB) — two series, gives 3 slice views + 3D volume render.
- **3D US Fetus** (8 MB), **Ultrasound Cine** (225 KB).
- **CTA Head and Neck** (80 MB) — only when you specifically need a large CT / good cinematic
  renders. Budget ~50 s from click to a fully rendered four-up frame on the Devin VM, and expect the
  whole session to be slow (see "Large volumes and cinematic rendering" below). A numeric progress
  badge appears on the sample card while it downloads, so you can screenshot the in-flight state.

## Where the UI lives

- App bar (top): hamburger, lockup, keyboard-shortcuts icon, **(i) About** icon (far right).
- **Settings**: gear icon at the *bottom* of the left panel (not in the app bar). Contains the
  "Dark Theme" switch, Camera Auto Reset, DICOMWeb and Remote Server settings.
- **Data Privacy notice**: "LEARN MORE" button on the welcome screen (only visible when no image
  is loaded — reload the page to get it back).
- Slice indicator text (`Slice: n/N`) is rendered in the bottom-right corner of each 2D view; read
  it before/after scrolling to prove slice navigation actually moved.

## Exercising the viewer as a radiological viewer (not just branding)

Input bindings traced from source (re-check if these files change):
- **Slice scrub** = mouse **scroll** over a 2D view (`VtkSliceViewSlicingManipulator.vue`,
  `scrollEnabled: true`, `dragEnabled: false`, inverted). Read `Slice: n/N` before/after.
- **Window/level** = **left**-drag on a 2D view whenever the Window/Level tool is active (it is the
  default tool). Horizontal = level, vertical = width. Right-drag is **pan**, not W/L. Read
  `W/L: <width> / <level>` in the view overlay.
- **3D camera** (`VtkVolumeView.vue`): left-drag = trackball rotate, shift+left = pan, right = pan,
  scroll / button 3 = zoom.
- **RENDERING tab** (3rd left-panel tab) = opacity transfer-function editor + Shift/Width sliders +
  **Color Presets** grid + Cinematic Rendering controls. Clicking a preset thumbnail highlights it
  (blue border) and re-renders. Good visually distinct CT presets: `CT AAA` (default),
  `CT Bone`, `CT Bones`, `CT Coronary Arteries 3` (angio look).
- **Layouts** = toolbar button with `data-testid="control-button-Layouts"` (`mdi-view-dashboard`) →
  menu with Four Up / Axial Coronal Sagittal / Axial Only / 3D Only / Oblique / 3D Primary.
  Double-clicking a view in `LayoutGrid.vue` is also supposed to maximize/restore it, but the menu
  is far more reliable to drive from automation.
- When targeting the Shift/Width sliders, compute the coordinate from a **cropped screenshot offset**
  carefully — the opacity transfer-function canvas sits directly above them and it is easy to drag
  the histogram widget by mistake (which also changes the render, so the mistake is not obvious).

## Large volumes and cinematic rendering (GPU-less boxes)

> Timings and coordinates in this section were **observed on the Devin VM** (no GPU, software GL,
> 1600x1122 Chrome). Treat them as orders of magnitude, not invariants — re-measure on other
> hardware rather than reporting a deviation as a regression.

This environment has no GPU; vtk.js falls back to software GL. With the 80 MB CT:
- Each camera move / preset change kicks off a progressive cinematic accumulation that takes ~5–20 s
  to converge. Intermediate frames are blocky or near-black — **wait and re-screenshot before
  concluding "no change"**.
- The main thread saturates badly: page `setInterval` timers were observed running ~100x slower than
  scheduled. Native `xdotool` drags over the 3D canvas can then appear to do nothing (events
  coalesced/dropped) even though wheel-zoom on the same canvas still works. If a native drag will not
  rotate, dispatching `PointerEvent`s (`pointerdown`/`pointermove`.../`pointerup`) on the canvas from
  the console does reach vtk.js and is a valid fallback — but say so in the report, since it is not a
  pure UI interaction.
- **Views can go permanently black.** Observed twice on this branch: after a
  `Four Up → 3D Only → Four Up` layout round-trip, and once in `3D Only` shortly after a converged
  render. All panes draw nothing while overlays (`Slice: n/N`, `W/L`) keep updating, and there is
  **no console error**. Layout switching, scrolling and window resizing do not recover it; only a
  page reload (plus re-loading the sample) does. This looks like WebGL context exhaustion/loss and is
  most likely upstream/environmental — before blaming a PR, check `git diff main...HEAD` for
  `LayoutGrid.vue`, `src/components/vtk/*`, `src/store/*`, `VolumeViewer.vue`, `SliceViewer.vue`.
  Budget a reload + ~50 s reload of the sample if you need a clean final frame for a recording.

## Themes

- Theme names live in `src/constants.ts` (`philips-dark` / `philips-light`, formerly `kw-dark` /
  `kw-light`), persisted in `localStorage['app-theme']`, applied in `src/plugins/vuetify.js`.
- To test migration/fallback there is no UI path — setting `localStorage` from the browser console
  and reloading is the only way. Verify by reading back the stored value **and** the
  `v-theme--*` class on `.v-application`, not just by eyeballing the colors.
- Brand colors are centralized in `src/branding.ts`. To assert a themed color objectively, read
  `getComputedStyle(el).color` / `.backgroundColor` and compare to the hex in `branding.ts`, and
  compute WCAG contrast in a shell one-liner rather than eyeballing.

## Testing a deployed/production bundle instead of the dev server

VolView builds are sometimes committed into a host app and served from a subpath (at the time of
writing: the `/philips-radiology/` demo inside the `event-driven-devin` Express app, run locally
with `PORT=3100 node app/server.js` — a separate repo, so check it still exists before relying on it).
When the change under test is build-time behaviour, test the *committed* artifact, not a scratch copy —
that is what actually ships.

- **Verify the served bundle is not stale before you assert anything.** Hashed asset names change on
  every build, so grep the served JS for a distinctive minified fragment of the change:
  `curl -s http://host/<path>/assets/index-*.js | grep -c '<fragment>'`. A stale bundle will
  otherwise produce confident, wrong test results. Escalate a stale bundle rather than testing around it.
- **Always use the trailing slash.** Vite `base` is `'./'`, so `/philips-radiology` without it resolves
  assets against `/`. Hosts often serve static files with `{ index: false }` plus one explicit route
  for the entry point, so only the exact configured path works.
- **Do not drop extra build copies under the host repo's `public/`.** ESLint walks the minified
  workers and reports hundreds of CommonJS errors unless the directory is ignored in the *host*
  repo's flat config (`eslint.config.mjs` in `event-driven-devin`; VolView's own is
  `eslint.config.js`). Clean up any temporary copy before finishing.
- **Check subpath assets objectively** with the Resource Timing API rather than eyeballing:
  `performance.getEntriesByType('resource').filter(r => r.name.includes('/<subpath>/'))` and assert
  every `responseStatus` is 200.

## Build-time default datasets (`VITE_DEFAULT_URLS`)

A build may set `VITE_DEFAULT_URLS` / `VITE_DEFAULT_NAMES` so a bare visit auto-loads a study
(`withDefaultUrls` in `src/utils/urlParams.ts`, applied by `readLaunchParams` → `loadUrls` in
`App.vue`'s `onMounted`). The semantics are **key presence, not truthiness**, so when testing:

- Bare URL (no `urls` key) → the default applies and the study loads with no click.
- `?urls=` and bare `?urls` → the key exists, so the default is suppressed and you get the empty
  drag/drop landing page. This is the easy behaviour to get wrong; make it the headline test.
- A lone `?names=Foo` → default applies and the stale name is dropped; assert the label appears
  nowhere in the Data panel or title.
- Explicit `?urls=<other dataset>` → must win over the default.
- **`isValidUrl` uses `new URL(str, window.location.href)` with a base**, so junk like `nonsense`
  resolves as a *relative* URL and is accepted. To exercise the rejection path you need something
  genuinely unparseable such as `http://[`, which logs
  `Invalid URL in urls parameter: <value>`. Navigate via the browser so the bracket is encoded.
- Prove "the default did not load" with the network log, not just the screenshot:
  `performance.getEntriesByType('resource').filter(r => r.name.includes('<data host>')).length === 0`.

## Browser-automation quirks (important)

> As above: **observed on the Devin VM**. The scaling factor and screen-size flag follow from this
> box's Chrome launch options; confirm `window.innerWidth` yourself rather than assuming them.

- **Mouse wheel over vtk.js canvases**: synthetic CDP wheel events (the browser tool's `scroll`)
  do NOT change the slice. Use a real X11 wheel event instead:
  `DISPLAY=:0 xdotool mousemove <x> <y> && xdotool click 5` (5 = down, 4 = up). Screenshot
  coordinates are ~1.5625x smaller than real screen coordinates when the screenshot is 1024px wide
  on a 1600px display — scale before calling xdotool.
- **Window resizing does not change the viewport**: Chrome here is launched with
  `--ozone-override-screen-size=1600,1122`, so `xdotool windowsize` / `wmctrl` change the frame but
  leave `window.innerWidth` at 1600. To test the responsive/mobile layout, use CDP device emulation
  (the browser tool's `set_mobile`) and confirm the new `window.innerWidth` in the console. The
  Vuetify mobile breakpoint is `lg = 1024` (`src/plugins/vuetify.js`), so anything below 1024 CSS px
  exercises the mobile branch.
- **`wmctrl -l` fails** ("Cannot get client list properties") in this environment; use
  `xdotool search --name <window title>` if you need the window id.
- To capture browser chrome (tab strip, favicon) rather than just the page viewport, take an X11
  screenshot: `DISPLAY=:0 import -window root out.png`.

## Expected console noise

`[Vue warn] [Vuetify UPGRADE] 'theme.global.name.value = …' is deprecated` fires on every load and
on every theme toggle. It is pre-existing (the assignment pattern predates the rebrand) and is not
a regression — do not report it as a failure, though it is a valid cleanup suggestion.

## Known-broken things that are not your bug

- Doc links may point at a GitHub Pages site that is not published for the fork
  (`https://cogdeasy.github.io/VolView` 404s).
- `src/core/streaming/__tests__/cachedStreamFetcher.spec.ts` fetches from `data.kitware.com` and can
  time out under full-suite load.
- In the light theme, in-view controls ("Coronal"/"Sagittal"/"Volume" dropdowns) are low-contrast
  because of `surface: '#f0f0f0'` / `'on-surface-variant': '#d0d0d0'`. This is longstanding, not
  introduced by branding changes — check `git diff` before blaming a PR for it.
