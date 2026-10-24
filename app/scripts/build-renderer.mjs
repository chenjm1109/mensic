// 构建「本端原生渲染器」：用 PyInstaller 把 CPython + matplotlib/numpy/pandas 冻结成 onedir 产物。
// 产物：src-tauri/binaries/mensic-render/mensic-render[.exe]
// 运行：npm run build:renderer（首次会先建 app/.renderer-venv 并装依赖）
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { APP_ROOT as root, IS_WIN as isWin, VENV_PY as py, ensurePythonEnv, run } from "./python-env.mjs";

const sep = isWin ? ";" : ":";

// 1) Python 环境（与缩略图、清单脚本共用 venv；这里额外要 pyinstaller）
ensurePythonEnv({ withPyInstaller: true });

// 2) 冻结（onedir：启动快、无需每次解包）
console.log("[renderer] PyInstaller 打包中（首次较慢，数分钟）…");
const distDir = join(root, "src-tauri", "binaries");
const workDir = join(root, "build", "pyinstaller");
const specDir = join(root, "build");
mkdirSync(distDir, { recursive: true });
rmSync(join(distDir, "mensic-render"), { recursive: true, force: true });

const args = [
  "-m",
  "PyInstaller",
  "--noconfirm",
  "--clean",
  "--name",
  "mensic-render",
  "--distpath",
  distDir,
  "--workpath",
  workDir,
  "--specpath",
  specDir,
  // 与 App 同源的渲染逻辑（源码文本，供 run.py 内联「共享渲染逻辑」）
  "--add-data",
  `${join(root, "renderer", "render.py")}${sep}renderer`,
  // 随包 CJK 字体（与 Pyodide 端同款）
  "--add-data",
  `${join(root, "public", "fonts", "NotoSansSC.ttf")}${sep}fonts`,
  // 这些依赖由运行期 exec 的源码动态导入，静态分析看不到，需显式声明。
  // PyInstaller 自带 pandas / numpy / matplotlib 的 hook，会用它们收集 C 扩展与数据文件，
  // 因此不用 --collect-all（那会把整包测试套件也收进来，日志刷屏且白占体积）。
  "--hidden-import",
  "pandas",
  "--hidden-import",
  "numpy",
  "--hidden-import",
  "yaml",
  "--hidden-import",
  "matplotlib.pyplot",
  "--hidden-import",
  "matplotlib.backends.backend_agg",
  // ⚠️ savefig(format=...) 的后端是**运行期惰性导入**的，静态分析看不到：
  // 这里没列出来的格式，冻结包里就缺那个后端，调用时会报
  // "No module named 'matplotlib.backends.backend_svg'"（导出 SVG 曾因此一直失败）。
  // 以后新增导出格式（pdf / ps …）记得在这里补上对应后端。
  "--hidden-import",
  "matplotlib.backends.backend_svg",
  "--collect-data",
  "matplotlib",
  // 瘦身：渲染只用 Agg（不需要任何 GUI 后端与 Tcl/Tk），也不需要 Pillow 的 AVIF 插件
  "--exclude-module",
  "tkinter",
  "--exclude-module",
  "_tkinter",
  "--exclude-module",
  "PIL._avif",
  "--exclude-module",
  "PIL.ImageTk",
  "--exclude-module",
  "PIL._imagingtk",
  join(root, "renderer", "sidecar.py"),
];

if (!run(py, args)) throw new Error("PyInstaller 打包失败");

const out = join(distDir, "mensic-render", isWin ? "mensic-render.exe" : "mensic-render");
console.log(`\n[renderer] 完成 ✅  ${out}`);
console.log("[renderer] 开发时可用以下方式临时指定系统 Python（免打包）：");
console.log('  $env:MENSIC_RENDER_BIN="<python.exe>"; $env:MENSIC_RENDER_ARGS="renderer/sidecar.py"');
