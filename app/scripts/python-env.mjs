// 统一的 Python 环境（唯一一个）：app/.renderer-venv
//
// 有三个地方要用 Python：
//   1. 冻结「本端原生渲染器」  scripts/build-renderer.mjs
//   2. 生成图鉴缩略图          scripts/gen-thumbnails.mjs
//   3. 解析 catalog 出清单      scripts/catalog-manifest.py（由 sync-catalog.mjs 调用）
// 都跑在这一个 venv 里，避免「系统 python 缺 pandas / mpl 版本不一致」这类事故。
//
// 依赖分两组：
//   RUNTIME_PINS —— 会被**冻结进 sidecar**（与 Pyodide 端对齐的版本）
//   TOOLING_PINS —— 只在构建期用（缩略图要 plotly + kaleido），不进 sidecar
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** app/ 的绝对路径（本文件在 app/scripts/ 下） */
export const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const IS_WIN = process.platform === "win32";
export const VENV_DIR = join(APP_ROOT, ".renderer-venv");
export const VENV_PY = IS_WIN ? join(VENV_DIR, "Scripts", "python.exe") : join(VENV_DIR, "bin", "python");

export const RUNTIME_PINS = ["matplotlib==3.10.8", "numpy==2.4.6", "pandas==3.0.2", "pyyaml==6.0.3"];
export const TOOLING_PINS = ["plotly>=6.0", "kaleido>=0.2.1"];

export function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd: APP_ROOT, ...opts });
  if (r.error) throw r.error;
  return r.status === 0;
}

function findPython() {
  for (const c of ["python", "py"]) {
    const r = spawnSync(c, ["--version"], { stdio: "ignore" });
    if (r.status === 0) return c === "py" ? ["py", "-3"] : ["python"];
  }
  throw new Error("未找到 Python，请先安装 Python 3.11+ 并加入 PATH");
}

/**
 * 确保 venv 存在且依赖装好，返回 venv 里的 python 路径。
 * @param {{ withPyInstaller?: boolean }} opts 冻结渲染器时才需要 pyinstaller
 */
export function ensurePythonEnv({ withPyInstaller = false } = {}) {
  if (!existsSync(VENV_PY)) {
    const [cmd, ...pre] = findPython();
    console.log(`[python] 创建虚拟环境：${VENV_DIR}`);
    mkdirSync(dirname(VENV_DIR), { recursive: true });
    if (!run(cmd, [...pre, "-m", "venv", VENV_DIR])) throw new Error("创建 venv 失败");
  }
  run(VENV_PY, ["-m", "pip", "install", "--upgrade", "pip", "--quiet"]);

  const wanted = [...RUNTIME_PINS, ...TOOLING_PINS, ...(withPyInstaller ? ["pyinstaller"] : [])];
  console.log(`[python] 安装依赖：${wanted.join(" ")}`);
  const ok = run(VENV_PY, ["-m", "pip", "install", "--quiet", ...wanted]);
  if (!ok) {
    console.warn("[python] 固定版本安装失败，改用最新版本（两端渲染可能有细微差异）");
    const latest = ["matplotlib", "numpy", "pandas", "pyyaml", "plotly", "kaleido", ...(withPyInstaller ? ["pyinstaller"] : [])];
    if (!run(VENV_PY, ["-m", "pip", "install", "--quiet", ...latest])) throw new Error("安装 Python 依赖失败");
  }
  return VENV_PY;
}
