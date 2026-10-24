// 备齐运行期资源（都不入 git，见 app/.gitignore）：
//
//   public/pyodide/          Pyodide 运行时：core 从 node_modules/pyodide 复制（天然与 package.json 同版本），
//                            轮子按 pyodide-lock.json 的依赖闭包从 CDN 下载，逐个校验 sha256
//   public/fonts/            NotoSansSC.ttf（matplotlib 中文；google/fonts，OFL）自动下载
//                            ZhuoKai.woff2（界面手写字体）第三方，仓库不代下：缺失只警告
//
// 用法：
//   npm run setup:assets     缺什么补什么（已存在且哈希正确就跳过）
//   npm run check:assets     只查存在性（不联网、不哈希），缺必需项退出码 1
//
// 镜像（可选）：MENSIC_PYODIDE_CDN / MENSIC_FONT_CDN 改前缀，例如公司内网代理。
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { APP_ROOT } from "./python-env.mjs";

const CHECK_ONLY = process.argv.includes("--check");

const PUBLIC = join(APP_ROOT, "public");
const PYODIDE_DST = join(PUBLIC, "pyodide");
const FONTS_DST = join(PUBLIC, "fonts");
const PYODIDE_PKG = join(APP_ROOT, "node_modules", "pyodide");

/** App 运行时要加载的包：worker 启动时用 base，案例的 `requires` 里可能再要 scipy / scikit-learn */
const ROOT_PACKAGES = ["matplotlib", "pandas", "pyyaml", "scipy", "scikit-learn"];
/** Pyodide core：这几个文件随 npm 包一起发，直接复制，不下载 */
const CORE_FILES = ["pyodide.mjs", "pyodide.asm.mjs", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"];

/** matplotlib 的中文字体：google/fonts 的 NotoSansSC 可变字体（OFL） */
const FONT_NAME = "NotoSansSC.ttf";
const FONT_URL =
  "https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf";
/** 固定校验值：上游若改版，这里会提示「内容变了」，改版多半会影响渲染细节 */
const FONT_SHA = "a3041811a78c361b1de50f953c805e0244951c21c5bd412f7232ef0d899af0da";

/** 界面字体：第三方手写字体（授权原因不进自动下载） */
const MANUAL_FONTS = [{ name: "ZhuoKai.woff2", note: "江西拙楷体，界面字体" }];

const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function fileSha(path) {
  return sha256(readFileSync(path));
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** 读 Pyodide 包信息（版本、lock、依赖闭包）；缺 node_modules 时给明确提示 */
function loadPyodideMeta() {
  if (!existsSync(join(PYODIDE_PKG, "package.json"))) {
    console.error(red("✗ 没找到 node_modules/pyodide —— 先在 app/ 下跑 npm install"));
    process.exit(1);
  }
  const version = readJson(join(PYODIDE_PKG, "package.json")).version;
  const lock = readJson(join(PYODIDE_PKG, "pyodide-lock.json"));

  const seen = new Set();
  const stack = [...ROOT_PACKAGES];
  while (stack.length) {
    const name = stack.pop();
    if (seen.has(name)) continue;
    seen.add(name);
    for (const dep of lock.packages[name]?.depends ?? []) stack.push(dep);
  }

  const wheels = [...seen]
    .sort()
    .map((name) => {
      const pkg = lock.packages[name];
      if (!pkg) throw new Error(`pyodide-lock.json 里没有 ${name}`);
      return { name, file: pkg.file_name, sha: pkg.sha256 };
    });
  return { version, lock, wheels };
}

async function fetchBuffer(url, retries = 3) {
  let lastError;
  for (let i = 1; i <= retries; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      lastError = err;
      if (i < retries) {
        console.log(dim(`    第 ${i} 次失败（${err.message}），重试…`));
        await new Promise((r) => setTimeout(r, 800 * i));
      }
    }
  }
  throw lastError;
}

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/** 只读检查：返回 { missing: [...], optionalMissing: [...] } */
function inspect(meta) {
  const missing = [];
  for (const file of CORE_FILES) {
    const p = join(PYODIDE_DST, file);
    if (!existsSync(p) || statSync(p).size === 0) missing.push(`public/pyodide/${file}`);
  }
  for (const w of meta.wheels) {
    const p = join(PYODIDE_DST, w.file);
    if (!existsSync(p) || statSync(p).size === 0) missing.push(`public/pyodide/${w.file}`);
  }
  if (!existsSync(join(FONTS_DST, FONT_NAME))) missing.push(`public/fonts/${FONT_NAME}`);

  const optionalMissing = MANUAL_FONTS.filter((f) => !existsSync(join(FONTS_DST, f.name))).map(
    (f) => `public/fonts/${f.name}`,
  );

  // 版本漂移：public 里的 lock 与 node_modules 里的不一致 → 用户升级了 pyodide 但没重跑本脚本
  const publicLock = join(PYODIDE_DST, "pyodide-lock.json");
  let versionDrift = null;
  if (existsSync(publicLock)) {
    try {
      const a = readJson(publicLock).info?.abi_version;
      const b = meta.lock.info?.abi_version;
      if (a && b && a !== b) versionDrift = `${a} → ${b}`;
    } catch {
      versionDrift = "lock 文件损坏";
    }
  }
  return { missing, optionalMissing, versionDrift };
}

function printSummary(meta, { missing, optionalMissing, versionDrift }) {
  console.log(`\n${bold("运行期资源")}  ${dim(`（Pyodide ${meta.version} · ${meta.wheels.length + CORE_FILES.length} 个运行时文件）`)}`);
  console.log(`  ${green("✓")} public/pyodide/  ${missing.filter((m) => m.startsWith("public/pyodide")).length === 0 ? "齐全" : "缺少文件"}`);
  console.log(
    `  ${existsSync(join(FONTS_DST, FONT_NAME)) ? green("✓") : red("✗")} public/fonts/${FONT_NAME}  ${dim("matplotlib 中文（必需）")}`,
  );
  for (const f of MANUAL_FONTS) {
    const has = existsSync(join(FONTS_DST, f.name));
    console.log(`  ${has ? green("✓") : yellow("!")} public/fonts/${f.name}  ${dim(`${f.note}（可选，需手动放置）`)}`);
  }
  if (versionDrift) {
    console.log(`  ${yellow("!")} public/pyodide 的 lock 版本与 node_modules 不一致（${versionDrift}）→ 跑一次 npm run setup:assets`);
  }
  if (optionalMissing.length) {
    console.log(dim(`\n  ${optionalMissing.length} 个可选字体缺失：界面会回退系统字体（不影响出图）。`));
  }
}

async function main() {
  const meta = loadPyodideMeta();
  const state = inspect(meta);

  if (CHECK_ONLY) {
    printSummary(meta, state);
    if (state.missing.length) {
      console.log(`\n${red(`✗ 缺 ${state.missing.length} 个必需文件`)}（例如 ${state.missing[0]}）`);
      console.log(dim("  → 跑 npm run setup:assets 自动准备（需要联网下载约 65 MB）\n"));
      process.exit(1);
    }
    console.log(`\n${green("✓ 资源齐全")}\n`);
    return;
  }

  ensureDir(PYODIDE_DST);
  ensureDir(FONTS_DST);

  /* 1) core：从 node_modules 复制（不联网，版本天然一致） */
  console.log(bold(`\n▶ Pyodide core（${meta.version}）`));
  for (const file of CORE_FILES) {
    const src = join(PYODIDE_PKG, file);
    const dst = join(PYODIDE_DST, file);
    const same = existsSync(dst) && statSync(dst).size === statSync(src).size && fileSha(dst) === fileSha(src);
    if (same) {
      console.log(dim(`  = ${file}`));
      continue;
    }
    copyFileSync(src, dst);
    console.log(`  ${green("+")} ${file}  ${dim(mb(statSync(dst).size))}`);
  }

  /* 2) 轮子：缺的 / 哈希不对的才下载 */
  const cdn = (process.env.MENSIC_PYODIDE_CDN || "https://cdn.jsdelivr.net/pyodide").replace(/\/+$/, "");
  const base = `${cdn}/v${meta.version}/full/`;
  console.log(bold(`\n▶ Pyodide 轮子（${meta.wheels.length} 个依赖闭包）`));
  console.log(dim(`  源：${base}`));

  let downloaded = 0;
  let bytes = 0;
  for (const wheel of meta.wheels) {
    const dst = join(PYODIDE_DST, wheel.file);
    if (existsSync(dst) && fileSha(dst) === wheel.sha) {
      console.log(dim(`  = ${wheel.file}`));
      continue;
    }
    process.stdout.write(
      process.stdout.isTTY ? `  ${green("+")} ${wheel.file}  ${dim("下载…")}` : `  ${green("+")} ${wheel.file}\n`,
    );
    const buf = await fetchBuffer(base + wheel.file);
    const got = sha256(buf);
    if (got !== wheel.sha) {
      unlinkSync(dst);
      console.error(`\n${red(`✗ ${wheel.file} 校验失败`)}\n    期望 ${wheel.sha}\n    实际 ${got}`);
      process.exit(1);
    }
    writeFileSync(dst, buf);
    downloaded++;
    bytes += buf.length;
    console.log(
      process.stdout.isTTY
        ? `\r  ${green("+")} ${wheel.file}  ${dim(mb(buf.length))}${" ".repeat(24)}`
        : `  ${dim(`  ${mb(buf.length)}  sha256 ✓`)}`,
    );
  }
  if (downloaded === 0) console.log(dim("  （都已存在且哈希正确）"));
  else console.log(dim(`  本次下载 ${downloaded} 个，共 ${mb(bytes)}`));

  /* 3) 中文字体 */
  const fontDst = join(FONTS_DST, FONT_NAME);
  console.log(bold(`\n▶ 字体`));
  if (existsSync(fontDst) && fileSha(fontDst) === FONT_SHA) {
    console.log(dim(`  = ${FONT_NAME}`));
  } else {
    const url = process.env.MENSIC_FONT_CDN || FONT_URL;
    process.stdout.write(
      process.stdout.isTTY ? `  ${green("+")} ${FONT_NAME}  ${dim("下载…")}` : `  ${green("+")} ${FONT_NAME}\n`,
    );
    const buf = await fetchBuffer(url);
    const got = sha256(buf);
    if (got !== FONT_SHA) {
      // 上游改版：仍然装上（否则中文全变方块），但要说清楚影响
      console.log(yellow(`\n  ! 上游字体内容变了（sha ${got.slice(0, 12)}…，期望 ${FONT_SHA.slice(0, 12)}…）`));
      console.log(yellow("    已按新版本写入；渲染细节可能变化，建议跑 npm run sync:catalog 重生成缩略图"));
    } else {
      console.log(
        process.stdout.isTTY
          ? `\r  ${green("+")} ${FONT_NAME}  ${dim(mb(buf.length))}${" ".repeat(24)}`
          : `  ${dim(`  ${mb(buf.length)}  sha256 ✓`)}`,
      );
    }
    writeFileSync(fontDst, buf);
  }

  for (const f of MANUAL_FONTS) {
    if (existsSync(join(FONTS_DST, f.name))) console.log(dim(`  = ${f.name}`));
    else console.log(yellow(`  ! ${f.name} 缺失（${f.note}）→ 手动放进 public/fonts/，界面会回退系统字体`));
  }

  printSummary(meta, inspect(meta));
  if (!existsSync(join(APP_ROOT, "public", "cases"))) {
    console.log(dim("  提示：案例资源还没生成 → 跑 npm run sync:catalog\n"));
  }
}

main().catch((err) => {
  console.error(red(`\n✗ ${err?.message ?? err}\n`));
  process.exit(1);
});
