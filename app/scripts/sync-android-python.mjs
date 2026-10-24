// 同步 Android 侧需要的 Python 运行时文件（保持「单一真相」）：
//   renderer/render.py            → android/python/renderer/render.py.txt
//   renderer/sidecar.py           → android/python/sidecar.py
//   public/fonts/NotoSansSC.ttf   → android/python/fonts/NotoSansSC.ttf
// 这些副本是**生成物**，不入库（见 android/python/.gitignore）。
// 运行：npm run android:sync-python（`npm run apk` 会自动先跑一次）
import { copyFileSync, mkdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pyDir = join(root, "android", "python");

const jobs = [
  // render.py 必须当「数据文件」随包：Chaquopy 会把 .py 当模块编译进 APK，
  // 运行时无法用 open() 读源码；而 run.py 的 SHARED-RUNTIME 内联需要源码文本。
  [join(root, "renderer", "render.py"), join(pyDir, "renderer", "render.py.txt")],
  [join(root, "renderer", "sidecar.py"), join(pyDir, "sidecar.py")],
  [join(root, "public", "fonts", "NotoSansSC.ttf"), join(pyDir, "fonts", "NotoSansSC.ttf")],
];

let failed = false;
for (const [src, dst] of jobs) {
  try {
    statSync(src);
  } catch {
    console.error(`[android:sync] 缺少源文件：${src}`);
    failed = true;
    continue;
  }
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(src, dst);
  console.log(`[android:sync] ${src.replace(root, ".")} → ${dst.replace(root, ".")}`);
}
if (failed) {
  console.error("[android:sync] 失败：public/ 资源可能尚未准备（见 README）");
  process.exit(1);
}
console.log("[android:sync] 完成");
