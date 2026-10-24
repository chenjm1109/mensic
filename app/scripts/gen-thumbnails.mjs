// 生成图鉴缩略图（调 Python，跑在 app/.renderer-venv 里）。
//
//   npm run sync:catalog            # 全量重画
//   npm run dev                     # predev 只补缺失的（--missing）
//
// 缩略图与 App 内预览用**同一份渲染器**（app/renderer/render.py），所以风格一致。
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { APP_ROOT, VENV_PY, ensurePythonEnv } from "./python-env.mjs";

const font = join(APP_ROOT, "public", "fonts", "NotoSansSC.ttf");
if (!existsSync(font)) {
  console.warn(`[thumbnails] 缺少 ${font}（中文会变方块）—— 先跑 npm run setup:assets`);
}

ensurePythonEnv();
const r = spawnSync(VENV_PY, [join(APP_ROOT, "scripts", "gen-thumbnails.py"), ...process.argv.slice(2)], {
  cwd: APP_ROOT,
  stdio: "inherit",
  env: { ...process.env, MENSIC_FONT: font, PYTHONIOENCODING: "utf-8" },
});
if (r.status !== 0) {
  console.error("[thumbnails] 生成失败（见上面的 Python 报错）");
  process.exit(r.status ?? 1);
}
