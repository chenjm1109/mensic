<div align="center">

# 涵数 · mensic

**数据可视化笔记本**


[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20Android-2ea44f.svg)](#平台)
[![Tauri](https://img.shields.io/badge/Tauri-2-24c8db.svg)](https://tauri.app)
[![React](https://img.shields.io/badge/React-18-61dafb.svg)](https://react.dev)
[![Python](https://img.shields.io/badge/Python-matplotlib%20%7C%20pyodide-3776ab.svg)](https://matplotlib.org)

[快速开始](#快速开始) · [界面截图](#界面截图) · [仓库结构](#仓库结构) · [下载](https://github.com/chenjm1109/mensic/releases/tag/v0.1.0) · [English](README.md)

</div>

---

## 这是什么

涵数（mensic）是一个**数据可视化编辑器**。其基本工作流程为：

1. 在**画廊**里挑一个案例（基本柱状图、热力矩阵、三维曲面……）
2. 换成你自己的数据（CSV / Excel）
3. 用右侧面板调参数、字号、页面尺寸、图形元素
4. 实时预览，导出 PNG / SVG / CSV，或导出**能独立运行的 Python 工程**

## 界面截图

![首页](https://github.com/chenjm1109/mensic/releases/download/v0.1.0/home-1080x700.webp)

![画廊](https://github.com/chenjm1109/mensic/releases/download/v0.1.0/gallery-1080x700.webp)

![编辑器](https://github.com/chenjm1109/mensic/releases/download/v0.1.0/editor-1080x700.webp)

## 平台

| 平台 | 状态 | 说明 |
| --- | --- | --- |
| Windows 10/11 | ✅ | Tauri 2 + WebView2；本端 CPython sidecar 渲染 |
| Android（arm64） | ✅ | 沉浸式全屏 + 锁定横屏；Pyodide 渲染|

## 快速开始

**环境要求**：Node.js ≥ 20、Python ≥ 3.11（构建渲染器 / 缩略图用）；
桌面开发还需要 Rust 工具链，打安卓包需要 Android SDK + JDK。

```bash
git clone https://github.com/chenjm1109/mensic.git
cd mensic/app
npm install
npm run setup:assets     # 下载运行期资源：Pyodide 运行时 + 轮子（sha256 校验）+ 中文字体
npm run setup:python     # 建唯一一个 Python 环境 app/.renderer-venv，装 matplotlib/pandas 等
npm run sync:catalog     # catalog/ → 案例资源 + 缩略图 + cases.json
```

`setup:assets` 会按 `node_modules/pyodide` 的版本
把 Pyodide core + 依赖轮子补到 `app/public/pyodide/`（约 35 MB），并下载 matplotlib 用的
`NotoSansSC.ttf`（OFL）。唯一需要**手动**放的是界面手写字体 `ZhuoKai.woff2`
（第三方字体，仓库不代下）—— 缺失会回退系统字体。

桌面端如果想用原生渲染（快很多）：

```bash
npm run build:renderer   # PyInstaller 冻结 → src-tauri/binaries/mensic-render/
```

然后：

```bash
npm run dev          # 浏览器预览 http://localhost:1420
npm run tauri dev    # 桌面应用（需要 Rust）
npm run tauri build  # 打 Windows 安装包（MSI / NSIS）
npm run apk          # 打安卓包 → app/apk/mensic-<版本>-arm64.apk
```


发版产物会自动汇总到 **`app/release/`**

## 常用命令

| 命令（在 `app/` 下） | 作用 |
| --- | --- |
| `npm run setup:assets` | 备齐 Pyodide 运行时与字体（缺什么补什么，校验 sha256） |
| `npm run check:assets` | 只检查运行期资源是否齐全 |
| `npm run setup:python` | 建/复用 `app/.renderer-venv` 并装依赖 |
| `npm run sync:catalog` | 把 `catalog/` 同步成案例资源、缩略图与 `cases.json`（全量，开发用） |
| `npm run sync:catalog:release` | 只同步 `status: published` 的案例（发版用） |
| `npm run dist` | 发布集 + Windows 安装包（MSI / NSIS）→ `app/release/` |
| `npm run build:renderer` | 冻结本端原生渲染器（PyInstaller onedir） |
| `npm run build` | 类型检查 + 前端构建 |
| `npm run check` | 跑 `scripts/check-*` 全部验收脚本 |
| `npm run apk` | 发布集 + 同步 Python → 编 `.so` → Gradle 打包（`app/apk/`，并汇总到 `app/release/`） |
| `npm run release:collect` | 把已有的安装包重新汇总到 `app/release/` |


## 仓库结构

```
.
├── app/           应用本体
│   ├── src/          React + TS 前端（pages / features / renderers / gallery / core）
│   ├── renderer/     渲染器唯一实现：render.py（各端共用）+ sidecar.py（桌面进程入口）
│   ├── scripts/      同步案例、生成缩略图、冻结渲染器、打安卓包、验收脚本
│   ├── src-tauri/    Tauri 外壳（Rust 命令、随包 sidecar）+ gen/android（安卓工程，入库）
│   └── android/      安卓用的 Python 运行时副本（生成物，APK 用）
├── catalog/       案例库：<分类>/<案例>/{meta.yaml, data/, implementations/}
├── design/        设计令牌 tokens.yaml（配色、字体、画布默认值）
└── docs/          实现方案 + 工程规则索引
```

- 改**案例内容** → 只动 `catalog/`，然后 `npm run sync:catalog`
- 改**应用** → 只动 `app/`；渲染逻辑在 `app/renderer/render.py`


## 许可

[MIT](LICENSE) © 2026 chenjm1109
