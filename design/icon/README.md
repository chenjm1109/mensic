# 应用图标 / logo

`12-donut.svg` 是**唯一的矢量母版**（512 画布，圆角 114，圆心 = 画布中心）。
改图标只改它，然后按下面这条链重生成，不要手改任何 PNG。

## 重生成

```bash
# 1. 母版 → 1024 源图（用本机 Edge 截图，不依赖图像库）
node design/icon/render-1024.mjs

# 2. 安卓自适应图标的前景层 / 单色层（透明底）
node design/icon/render-png.mjs design/icon/android-foreground.svg design/icon/android-foreground-1024.png
node design/icon/render-png.mjs design/icon/android-monochrome.svg design/icon/android-monochrome-1024.png

# 3. 一次产出桌面全套 + 安卓各密度
cd app && npm run tauri icon ../design/icon/icon-manifest.json
```

- 桌面图标写进 `app/src-tauri/icons/`（32 / 64 / 128 / 128@2x / icon.ico / icon.icns / icon.png）
- 安卓直接写进 `app/src-tauri/gen/android/app/src/main/res/`（`mipmap-*` + `mipmap-anydpi-v26/ic_launcher.xml`）
- 背景色 `#FDFBF7` 由 `icon-manifest.json` 的 `bg_color` 带进 `values/ic_launcher_background.xml`
- 前景层按 **108dp 画布中间 72dp 可见区** 排版：圆环直径 = 72dp 的 63%（= 108dp 的 42%），和桌面图标的留白比例一致；外侧 18dp 是系统裁掉的出血
- 单色层给 Android 13 主题图标（同一套几何、同一比例）

## 界面里的 logo

`app/src/assets/mensic-mark.svg`（无底板版，同样两个路径）用在：

- 首页字标上方（图标 + 名字的锁定组合）
- 设置 → 关于
- `app/index.html` 的 favicon

## 约定

- 颜色是**品牌固定色**（`#E05F79` / `#F3AEB9`），不跟随用户自定义主题色 —— 图标和 logo 不参与换色。
- `design/icon/preview.html` 是所有方案的对照页（`node design/icon/build.mjs` 重生成），仅作存档，不参与构建。
