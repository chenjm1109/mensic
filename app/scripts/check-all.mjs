// 跑一遍 scripts/check-*.{ts,mjs,py} 全部验收脚本，最后汇总。
//
//   npm run check
//
// - `.ts`：先用 esbuild 打成 cjs 再跑（脚本都只 import 相对路径，能独立 bundle）
// - `.mjs`：直接跑
// - `.py`：用 app/.renderer-venv 的 python（缺则提示先 npm run setup:python）
// 目标：一件事一条命令，新人不用记 14 个脚本名。
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { APP_ROOT, IS_WIN, VENV_PY } from "./python-env.mjs";

const SCRIPTS = join(APP_ROOT, "scripts");
const TMP = join(APP_ROOT, ".check-tmp");
const ESBUILD_BIN = join(APP_ROOT, "node_modules", "esbuild", "bin", "esbuild");
const FONT = join(APP_ROOT, "public", "fonts", "NotoSansSC.ttf");

rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

const checks = readdirSync(SCRIPTS)
  .filter((n) => /^check-.*\.(ts|mjs|py)$/.test(n) && n !== "check-all.mjs")
  .sort();

const results = [];
for (const name of checks) {
  process.stdout.write(`\n\x1b[1m▶ ${name}\x1b[0m\n`);
  let status = 1;
  if (name.endsWith(".ts")) {
    const out = join(TMP, name.replace(/\.ts$/, ".cjs"));
    // 用 node 直接执行 esbuild 的 JS 入口：Windows 下 spawnSync 跑 .cmd 会 EINVAL
    const b = spawnSync(process.execPath, [ESBUILD_BIN, join(SCRIPTS, name), "--bundle", "--platform=node", "--format=cjs", `--outfile=${out}`], {
      cwd: APP_ROOT,
      stdio: "inherit",
    });
    status = b.status === 0 ? spawnSync(process.execPath, [out], { cwd: APP_ROOT, stdio: "inherit" }).status : 1;
  } else if (name.endsWith(".mjs")) {
    status = spawnSync(process.execPath, [join(SCRIPTS, name)], { cwd: APP_ROOT, stdio: "inherit" }).status;
  } else {
    status = spawnSync(VENV_PY, [join(SCRIPTS, name)], {
      cwd: APP_ROOT,
      stdio: "inherit",
      env: { ...process.env, MENSIC_FONT: FONT, PYTHONIOENCODING: "utf-8" },
    }).status;
  }
  results.push({ name, ok: status === 0 });
}

rmSync(TMP, { recursive: true, force: true });

const failed = results.filter((r) => !r.ok);
console.log(`\n\x1b[1m${results.length - failed.length}/${results.length} 项通过\x1b[0m`);
for (const r of failed) console.log(`  \x1b[31m✗\x1b[0m ${r.name}`);
if (failed.length) {
  console.log("\n提示：.py 项失败时先确认 `npm run setup:python`（需要 venv 里的 matplotlib/pandas）。\n");
  process.exit(1);
}
