<div align="center">

# mensic · 涵数

**A data-visualization notebook**

[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20Android-2ea44f.svg)](#platforms)
[![Tauri](https://img.shields.io/badge/Tauri-2-24c8db.svg)](https://tauri.app)
[![React](https://img.shields.io/badge/React-18-61dafb.svg)](https://react.dev)
[![Python](https://img.shields.io/badge/Python-matplotlib%20%7C%20pyodide-3776ab.svg)](https://matplotlib.org)

[Quick start](#quick-start) · [Screenshots](#screenshots) · [Repository layout](#repository-layout) · [Download](https://github.com/chenjm1109/mensic/releases/tag/v0.1.0) · [中文](README.zh.md)

</div>

---

## What is this

mensic (涵数) is a **data-visualization editor**. The basic workflow is:

1. Pick a case in the **gallery** (basic bar chart, heatmap matrix, 3D surface, …)
2. Replace it with your own data (CSV / Excel)
3. Tune parameters, fonts, page size and graphic elements in the right-hand panel
4. Preview in real time, export PNG / SVG / CSV, or export a **standalone Python project**

## Screenshots

![Home](https://github.com/chenjm1109/mensic/releases/download/v0.1.0/home-en-1080x700.webp)

![Gallery](https://github.com/chenjm1109/mensic/releases/download/v0.1.0/gallery-en-1080x700.webp)

![Editor](https://github.com/chenjm1109/mensic/releases/download/v0.1.0/editor-en-1080x700.webp)

## Platforms

| Platform | Status | Notes |
| --- | --- | --- |
| Windows 10/11 | ✅ | Tauri 2 + WebView2; local CPython sidecar renderer |
| Android (arm64) | ✅ | Immersive fullscreen + landscape lock; Pyodide renderer |

## Quick start

**Requirements**: Node.js ≥ 20, Python ≥ 3.11 (for building the renderer / thumbnails);
the desktop build also needs the Rust toolchain, and the Android build needs the Android SDK + JDK.

```bash
git clone https://github.com/chenjm1109/mensic.git
cd mensic/app
npm install
npm run setup:assets     # download runtime assets: Pyodide runtime + wheels (sha256-checked) + CJK font
npm run setup:python     # create the single Python environment: app/.renderer-venv, with matplotlib/pandas etc.
npm run sync:catalog     # catalog/ → case assets + thumbnails + cases.json
```

`setup:assets` installs the Pyodide core and the dependency wheel closure that matches
`node_modules/pyodide` into `app/public/pyodide/` (about 35 MB), and downloads the
`NotoSansSC.ttf` used by matplotlib (OFL). The only asset you need to place **manually** is the
UI handwriting font `ZhuoKai.woff2` (third-party; the repository does not redistribute it) —
without it the UI falls back to a system font.

For the fast native renderer on desktop:

```bash
npm run build:renderer   # PyInstaller freeze → src-tauri/binaries/mensic-render/
```

Then:

```bash
npm run dev          # browser preview at http://localhost:1420
npm run tauri dev    # desktop app (needs Rust)
npm run tauri build  # build the Windows installers (MSI / NSIS)
npm run apk          # build the Android package → app/apk/mensic-<version>-arm64.apk
```

Release artifacts are collected automatically into **`app/release/`**.

## Commands

| Command (inside `app/`) | What it does |
| --- | --- |
| `npm run setup:assets` | Install the Pyodide runtime and fonts (fills in what is missing, verifies sha256) |
| `npm run check:assets` | Check that runtime assets are present |
| `npm run setup:python` | Create / reuse `app/.renderer-venv` and install dependencies |
| `npm run sync:catalog` | Sync `catalog/` into case assets, thumbnails and `cases.json` (all cases, for development) |
| `npm run sync:catalog:release` | Sync only cases with `status: published` (for releases) |
| `npm run dist` | Release set + Windows installers (MSI / NSIS) → `app/release/` |
| `npm run build:renderer` | Freeze the native renderer (PyInstaller onedir) |
| `npm run build` | Type-check + frontend build |
| `npm run check` | Run every `scripts/check-*` acceptance script |
| `npm run apk` | Release set + sync Python → build the `.so` → Gradle package (`app/apk/`, also collected into `app/release/`) |
| `npm run release:collect` | Re-collect existing installers into `app/release/` |

## Repository layout

```
.
├── app/           The application itself
│   ├── src/         React + TS frontend (pages / features / renderers / gallery / core)
│   ├── renderer/    The single renderer implementation: render.py (shared by all platforms) + sidecar.py (desktop process entry)
│   ├── scripts/     Catalog sync, thumbnail generation, renderer freeze, APK build, acceptance scripts
│   ├── src-tauri/   Tauri shell (Rust commands, bundled sidecar) + gen/android (committed Android project)
│   └── android/     Python runtime copies for Android (generated, used by the APK)
├── catalog/       Case library: <category>/<case>/{meta.yaml, data/, implementations/}
├── design/        Design tokens: tokens.yaml (colors, fonts, canvas defaults)
└── docs/          Implementation notes + engineering rules index
```

- Changing **case content** → touch only `catalog/`, then run `npm run sync:catalog`
- Changing **the app** → touch only `app/`; render logic lives in `app/renderer/render.py`

## License

[MIT](LICENSE) © 2026 chenjm1109
