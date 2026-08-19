# Development

## Prerequisites

Before you begin, make sure your environment matches the following versions:

- **Node.js**: `^22.12.0 || >=24.0.0` (22.x LTS recommended; `nvm use` reads
  `.nvmrc`). This is a development-only requirement — the published package is
  browser code. Node 20 no longer builds: `vite` needs `^20.19.0 || >=22.12.0`
  and `@commitlint/cli` needs `>=22.12.0`, so the commit hooks fail even on the
  newest 20.x. Node 21 and 23 are excluded by `vitest`.
- **npm**: >= 10.x (ships with Node 22)

Check your versions:

```bash
node --version
npm --version
```

> **Tip:** Use `nvm` or `volta` to manage and switch Node.js versions.

For reproducible installs, use:

```bash
npm ci
```


---

## Dependencies

Refer to `package.json` for the full list of dependencies and devDependencies.

---

## Setup

To prepare your environment after cloning the repo, run:

```bash
npm install
```

---

## Compiles and hot-reloads for development

```bash
npm run dev
```

---

## Compiles and minifies for production

```bash
npm run build
```

---

## Analyzing the production bundle

Generate a production bundle and produce a bundle size breakdown report:

```bash
npm run build:analyze
```

---

## Lints and fixes files

```bash
npm run lint
```

---

## Testing

```bash
# unit tests
npm run test

# e2e tests (Chrome)
npm run test:e2e:chrome
```

When running end-to-end tests, baseline images are saved to `tests/baseline`. Baseline diffs and actual snapshots are saved to `.tmp`.

When adding a new baseline image and test, the image should be pulled from GitHub Actions. Every test run will upload artifacts containing the snapshots taken, and those should be used when verifying and committing the baseline images.

#### Run one e2e spec file

```bash
npm run test:e2e:dev -- -- --spec ./tests/specs/remote-manifest.e2e.ts
```

---

## Versioning

Merging to `main` automatically publishes prerelease packages to NPM:

1. Merge creates a prerelease tag (e.g. v4.4.0-dev.<sha>)
2. Tag triggers automatic NPM publish with `@dev` dist-tag

```bash
npm install volview          # Gets latest stable release (e.g., 4.4.0)
npm install volview@dev      # Gets latest dev package (most recent commit to main branch)
```

To publish a new release via CI/CD, manually create and push a tag, e.g.:

```bash
git tag v4.5.0  # must match format 'v[0-9]+.[0-9]+.[0-9]+'
git push origin --tags
```

---

## Developing with VTK.js

Follow these steps to develop against a custom development branch of VTK.js:

1. Build and package VTK.js:

```bash
path/to/vtk-js > npm run build:esm
```

2. Create a symbolic link to the VTK.js distribution folder on your local system:

```bash
cd path/to/vtk-js/dist/esm
npm link
```

3. Reference the symbolic link in your local Volume Viewer build:

```bash
cd path/to/VolView
npm link --no-save @kitware/vtk.js
```

4. Build and run Volume Viewer:

```bash
npm run dev
```
