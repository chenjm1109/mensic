# 安卓工程（`app/src-tauri/gen/android`）

Tauri 的安卓工程 `tauri android init` 生成，但里面有我们手改的东西，**所以随仓库提交**。
只有构建输出和「每台机器各自」的文件被忽略（见 `app/.gitignore` 与 `gen/android/.gitignore`）。

## 入库范围

| 入库 | 忽略 |
| --- | --- |
| `app/src/main/{java,res,AndroidManifest.xml}`、`*.gradle.kts`、`settings.gradle`、`gradle/wrapper/`、`buildSrc/` | `app/build/`、`.gradle/`、`.kotlin/`、`app/src/main/jniLibs/`（`libmensic_lib.so` 由 `npm run apk` 生成）、`app/src/main/assets/`、`generated/`（`tauri android build` 每次重写）、`local.properties`、`tauri.settings.gradle`（含本机 cargo 绝对路径）、`src-tauri/gen/schemas/` |

首次 clone 后不需要再 `tauri android init`，直接 `cd app && npm run apk` 即可
（缺工程时脚本会报错并给出命令，不会静默失败）。

## 我们改过的文件

| 文件 | 改了什么 |
| --- | --- |
| `app/build.gradle.kts` | `namespace` / `applicationId` = `com.mensic.app`；Chaquopy（进程内 CPython）与 `sourceSets.python.srcDir("../../../../android/python")`；release 用 debug keystore 签名；`.so` 不做 strip |
| `settings.gradle` | `pluginManagement.resolutionStrategy` 把 `com.chaquo.python` 映射到 Maven 坐标（Chaquopy 没有插件 marker） |
| `app/src/main/AndroidManifest.xml` | `screenOrientation="sensorLandscape"`；`windowSoftInputMode="adjustResize"`（Android 10 及以下的键盘避让）；`FileProvider`（`${applicationId}.fileprovider`，导出分享用） |
| `app/src/main/java/com/mensic/app/MainActivity.kt` | 沉浸式全屏 `goImmersive()`（`onResume` 重新收起）、`applyImeInsets()`（Android 11+ 按 IME insets 压矮 WebView，避免键盘盖住输入框）、`disableWebViewZoom()` |
| `app/proguard-rules.pro` | 保留 JNI 入口 `NativeRenderer`（`nativeRegister` / `call` / `shareFile`），否则 release 包导出会报 `no static "Lcom/mensic/app/renderer/NativeRenderer;..."` |
| `app/src/main/java/com/mensic/app/Share.kt` | 导出走系统分享面板：写 `cacheDir` → `ACTION_SEND` |
| `app/src/main/java/com/mensic/app/renderer/NativeRenderer.kt` | Chaquopy 渲染桥 + `shareFile` 转给 `Share` |
| `app/src/main/res/values/strings.xml`、`values-en/strings.xml` | 应用名「涵数」/「mensic」 |
| `app/src/main/res/values{,-night}/themes.xml` | `Theme.mensic`（Material3 DayNight、无标题栏） |
| `app/src/main/res/xml/file_paths.xml` | 允许分享 `cacheDir` 下的文件 |

## 重新生成后要做什么

`tauri android init --force`（或删掉 `gen/` 后重新 init）会把这些改动全部冲掉。此时：

1. 按上表把改动重新应用一遍（可从 git 历史里找回对应文件）；
2. 确认 `buildSrc/src/main/java/com/mensic/app/kotlin/` 下的 `RustPlugin.kt` / `BuildTask.kt` 还在（Tauri 生成物，默认无包名，路径只是照 identifier 排的）；
3. 跑 `cd app && npm run apk` 验证。

## 打包时的已知现象

`tauri android build` 最后一步会尝试建 `libmensic_lib.so` 的**符号链接**，
在没开 Windows「开发者模式」的机器上必然报
`Creation symbolic link is not allowed for this system`。
`scripts/build-apk.mjs` 把这**一条**报错当预期，改成自己复制 `.so` 到 `jniLibs/`，
再让 Gradle 跳过 `rustBuild*` 任务打包 —— 看到这行报错不代表构建失败。
