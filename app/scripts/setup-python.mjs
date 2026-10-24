// 准备 Python 环境（app/.renderer-venv）：缩略图 / 清单 / 冻结渲染器都用它。
//
//   npm run setup:python
//
// 首次克隆后跑一次即可；之后 sync:catalog / build:renderer 会复用它。
import { ensurePythonEnv, VENV_PY } from "./python-env.mjs";

ensurePythonEnv();
console.log(`\n[python] 就绪：${VENV_PY}`);
