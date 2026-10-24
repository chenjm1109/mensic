# -*- coding: utf-8 -*-
"""mensic 本端原生渲染器（sidecar）。

在随包的原生 CPython 里运行，向 Tauri 主进程提供渲染服务。它与 Pyodide 后端、
与导出的 run.py **共用同一份渲染逻辑**（`renderer/render.py`），因此绘图效果同源。

协议（stdin/stdout 定长帧，二进制安全）：
    请求： [uint32 LE 长度][UTF-8 JSON: {"op": str, "spec": any}]
    响应： [uint8 状态][uint32 LE 长度][载荷]
          状态 0 = 成功（载荷为产物字节或 UTF-8 文本）；1 = 失败（载荷为错误信息）

注意：stdout 专供协议使用，任何 stray print 都会被改道到 stderr，避免污染帧流。
"""
import atexit
import json
import os
import shutil
import sys
import tempfile
import types
from pathlib import Path

# --------------------------------------------------------------------------- #
# 协议用的 stdout（仅桌面 sidecar 模式需要；导入时不碰流，便于被 Chaquopy 复用）
# --------------------------------------------------------------------------- #
_OUT = None


def _setup_protocol_stdio():
    """把 stdout 让给协议：所有常规输出（含第三方库的 print）改道 stderr。

    注意：只在 main() 里调用。Chaquopy 下 sys.stdout 是 Logcat 适配对象（没有 .buffer），
    若在导入期执行会直接报错——而那时我们也不需要帧协议。
    """
    global _OUT
    _OUT = sys.stdout.buffer
    sys.stdout = sys.stderr


def _resource_root() -> Path:
    """PyInstaller（onefile/onedir）运行时资源目录；源码运行时为脚本所在目录。"""
    base = getattr(sys, "_MEIPASS", None)
    if base:
        return Path(base)
    return Path(__file__).resolve().parent


def _first_existing(candidates):
    for p in candidates:
        if p.is_file():
            return p.resolve()
    return None


ROOT = _resource_root()
# 三种形态下的位置（ROOT 的含义随形态变）：
#   打包   → <bundle>/renderer/render.py（PyInstaller 的 --add-data）
#   安卓   → <data>/renderer/render.py.txt（Chaquopy 只把非 .py 当数据文件解压到磁盘）
#   源码   → app/renderer/render.py（ROOT = app/renderer，与 render.py 同目录）
RENDER_SRC_PATH = _first_existing(
    [
        ROOT / "renderer" / "render.py",
        ROOT / "renderer" / "render.py.txt",
        ROOT / "render.py",
    ]
)
if RENDER_SRC_PATH is None:
    raise SystemExit("未找到 render.py（渲染逻辑源码缺失）")

FONT_PATH = _first_existing(
    [
        ROOT / "fonts" / "NotoSansSC.ttf",  # 打包：<bundle>/fonts
        ROOT.parent / "public" / "fonts" / "NotoSansSC.ttf",  # 源码：app/public/fonts
    ]
)

# --------------------------------------------------------------------------- #
# 临时目录与产物路径（render.py 通过环境变量读取）
# --------------------------------------------------------------------------- #
WORK = Path(tempfile.mkdtemp(prefix="mensic-render-"))
atexit.register(lambda: shutil.rmtree(WORK, ignore_errors=True))

if FONT_PATH is not None:
    os.environ.setdefault("MENSIC_FONT", str(FONT_PATH))
os.environ["MENSIC_OUT_PNG"] = str(WORK / "out.png")
os.environ["MENSIC_OUT_SVG"] = str(WORK / "out.svg")
os.environ["MENSIC_OUT_PKG"] = str(WORK / "pkg.zip")
os.environ["MENSIC_PKG_ROOT"] = str(WORK / "pkg")

# --------------------------------------------------------------------------- #
# 载入与 App 同源的渲染逻辑
# --------------------------------------------------------------------------- #
RENDER_SRC = RENDER_SRC_PATH.read_text(encoding="utf-8")
RENDER = types.ModuleType("mensic_render")
RENDER.__dict__["__file__"] = str(RENDER_SRC_PATH)
# _RENDER_SRC 供 render.py 的 _shared_block() 内联「共享渲染逻辑」到 run.py
RENDER.__dict__["_RENDER_SRC"] = RENDER_SRC
exec(compile(RENDER_SRC, str(RENDER_SRC_PATH), "exec"), RENDER.__dict__)

# 随包可用的 Python 包（供上层判断某案例是否适合用本端原生渲染）
# 用 find_spec 探测而不是真的 import —— scipy/scikit-learn 的导入本身就要数秒。
import importlib.util

AVAILABLE_PACKAGES = ["numpy", "pandas", "matplotlib", "pyyaml"]


def _has(module: str) -> bool:
    try:
        return importlib.util.find_spec(module) is not None
    except Exception:
        return False


if _has("scipy"):
    AVAILABLE_PACKAGES.append("scipy")
if _has("sklearn"):
    AVAILABLE_PACKAGES.append("scikit-learn")


# --------------------------------------------------------------------------- #
# 各操作
# --------------------------------------------------------------------------- #
def _hash(text: str) -> str:
    import zlib

    return format(zlib.crc32(text.encode("utf-8")) & 0xFFFFFFFF, "x")


def _write_sources(spec):
    """把案例源码写入按内容指纹命名的临时文件，返回 (chartPath, tokensPath)。"""
    chart = WORK / f"case_chart_{_hash(spec['chartSource'])}.py"
    tokens = WORK / f"tokens_{_hash(spec['tokensSource'])}.yaml"
    if not chart.exists():
        chart.write_text(spec["chartSource"], encoding="utf-8")
    if not tokens.exists():
        tokens.write_text(spec["tokensSource"], encoding="utf-8")
    return str(chart), str(tokens)


def _case_spec(spec):
    chart_path, tokens_path = _write_sources(spec)
    return {
        "chartPath": chart_path,
        "tokensPath": tokens_path,
        "theme": spec.get("theme"),
        "tokensOverride": spec.get("tokensOverride"),
        "params": spec.get("params") or {},
        "presentation": spec.get("presentation"),
        "data": spec.get("data"),
    }


def _package_spec(spec):
    chart_path, tokens_path = _write_sources(spec)
    return {
        "chartPath": chart_path,
        "tokensPath": tokens_path,
        "theme": spec.get("theme"),
        "tokensOverride": spec.get("tokensOverride"),
        "params": spec.get("params") or {},
        "presentation": spec.get("presentation"),
        "dataCsv": spec.get("dataCsv", ""),
        "title": spec.get("title", "mensic 案例"),
        "requires": spec.get("requires") or [],
    }


def op_list_fonts(_spec):
    """本机可用字体族（供「文字与字体」里的字体选择）"""
    return RENDER.font_list().encode("utf-8")


def op_info(_spec):
    import platform

    import matplotlib

    return json.dumps(
        {
            "python": platform.python_version(),
            "matplotlib": matplotlib.__version__,
            "version": "1",
            "packages": AVAILABLE_PACKAGES,
        }
    ).encode("utf-8")


def op_render_png(spec):
    RENDER.render_case(json.dumps(_case_spec(spec)))
    return Path(RENDER.OUT_PNG).read_bytes()


def op_render_svg(spec):
    RENDER.render_case_svg(json.dumps(_case_spec(spec)))
    return Path(RENDER.OUT_SVG).read_bytes()


def op_case_script(spec):
    return RENDER.case_script(json.dumps(_package_spec(spec))).encode("utf-8")


def op_package_zip(spec):
    RENDER.build_package(json.dumps(_package_spec(spec)))
    return Path(RENDER.OUT_PKG).read_bytes()


OPS = {
    "info": op_info,
    "ping": op_info,
    "list_fonts": op_list_fonts,
    "render_png": op_render_png,
    "render_svg": op_render_svg,
    "case_script": op_case_script,
    "package_zip": op_package_zip,
}


# --------------------------------------------------------------------------- #
# 帧协议主循环
# --------------------------------------------------------------------------- #
def _read_exact(n: int):
    buf = sys.stdin.buffer.read(n)
    if not buf or len(buf) < n:
        return None
    return buf


def _send(status: int, payload: bytes):
    _OUT.write(bytes([status]))
    _OUT.write(len(payload).to_bytes(4, "little"))
    _OUT.write(payload)
    _OUT.flush()


def main():
    _setup_protocol_stdio()
    print(f"[mensic-render] ready (cwd={WORK}, root={ROOT})", file=sys.stderr, flush=True)
    while True:
        head = _read_exact(4)
        if head is None:
            break
        size = int.from_bytes(head, "little")
        body = _read_exact(size) if size else b"{}"
        if body is None:
            break
        try:
            req = json.loads(body.decode("utf-8"))
            op = req.get("op") or "info"
            fn = OPS.get(op)
            if fn is None:
                raise ValueError(f"未知操作：{op}")
            _send(0, fn(req.get("spec")) or b"")
        except Exception as exc:  # 把错误回传，而不是让进程退出
            import traceback

            _send(1, (str(exc) + "\n" + traceback.format_exc()).encode("utf-8"))


if __name__ == "__main__":
    main()
