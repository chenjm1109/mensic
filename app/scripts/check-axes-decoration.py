# -*- coding: utf-8 -*-
"""验收：绘图区边框 / 网格线的「接管」语义 + 不接管时不动模板自己的设计。

跑法：app/.renderer-venv/Scripts/python.exe scripts/check-axes-decoration.py
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pandas as pd
from matplotlib import colors as matplotlib_colors

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
sys.path.insert(0, str(ROOT / "renderer"))
spec = importlib.util.spec_from_file_location("vr", ROOT / "renderer" / "render.py")
render = importlib.util.module_from_spec(spec)
spec.loader.exec_module(render)

fail = 0


def check(name, ok, detail=""):
    global fail
    if not ok:
        fail += 1
    print(f"  {'ok  ' if ok else 'FAIL'}  {name}   {detail}")


def load(path: Path, alias: str):
    s = importlib.util.spec_from_file_location(alias, path)
    m = importlib.util.module_from_spec(s)
    s.loader.exec_module(m)
    return m


# 用一个柱状图：模板自己画了白色 y 轴网格（是最容易被「一律覆盖」毁掉的那种）
impl = REPO / "catalog" / "bar" / "bar-basic" / "implementations" / "matplotlib"
chart = load(impl / "chart.py", "chart_bar")
df = pd.read_csv(next((impl.parents[1] / "data").glob("*.csv")))
base = render._load_tokens_yaml(str(REPO / "design" / "tokens.yaml"), "rose")
pres = {"projection": "rect", "canvas": {"size": [8, 5], "dpi": 100}}


def render_with(font=None, grid=None, frame=None):
    toks = {**base, "font": {**base["font"]}, "grid": {**base["grid"]}}
    if grid:
        toks["grid"] = {**toks["grid"], **grid}
    if frame:
        toks["frame"] = frame
    params = {"tokens": toks, "elements": {}, "size": 80, "show_projection": False}
    fig, _ = render.build_figure(chart.create_chart, df, params, pres, toks)
    return fig.axes[0]


# 1) 不接管：模板自己的网格保持原样
ax = render_with()
white_y = [ln for ln in ax.get_ygridlines() if ln.get_visible()]
check("未接管网格：模板自己的网格还在", len(white_y) > 0, f"{len(white_y)} 条")
check("未接管网格：颜色仍是模板的白线", len(white_y) > 0 and white_y[0].get_color() in ("#ffffff", (1.0, 1.0, 1.0)), str(white_y[0].get_color()) if white_y else "-")

# 2) 接管网格（开）：按下面这套统一施加，颜色/线型/线宽都换成配置的
ax = render_with(grid={"on": True, "style": "--", "width": 1.5, "alpha": 0.4})
gl = ax.get_xgridlines()
check("接管网格（开）：x 轴也画了网格", any(ln.get_visible() for ln in gl), f"{sum(1 for ln in gl if ln.get_visible())} 条")
ln = next((l for l in gl if l.get_visible()), None)
check("接管网格（开）：线型按配置", ln is not None and ln.get_linestyle() == "--", ln.get_linestyle() if ln else "-")
check("接管网格（开）：颜色按 color.grid", ln is not None and ln.get_color() == base["color"]["grid"], str(ln.get_color()) if ln else "-")

# 3) 接管网格（关）：一律关掉
ax = render_with(grid={"on": False})
check("接管网格（关）：没有可见网格", not any(l.get_visible() for l in ax.get_xgridlines() + ax.get_ygridlines()))

# 4) 边框：接管 = 隐藏
ax = render_with(frame={"on": False})
check("接管边框（关）：spines 全部隐藏", all(not s.get_visible() for s in ax.spines.values()))
ax = render_with(frame={"on": True})
edge = base["color"]["edge"]

check("接管边框（开）：spines 可见", all(s.get_visible() for s in ax.spines.values()))
check("接管边框（开）：用 color.edge 上色", ax.spines["left"].get_edgecolor()[:3] == matplotlib_colors.to_rgb(edge), f"{ax.spines['left'].get_edgecolor()[:3]} vs {edge}")

# 5) 逐边开关：只关掉左边，其它三条不动
ax = render_with(frame={"spines": {"left": False}})
check("逐边：左边关掉", ax.spines["left"].get_visible() is False)
check("逐边：其余三边仍显示", all(ax.spines[s].get_visible() for s in ("top", "bottom", "right")))

# 6) 逐边 + 总开关：总开关关掉时，四边一律不显示
ax = render_with(frame={"on": False, "spines": {"left": False}})
check("总开关关掉：四边都不显示", all(not s.get_visible() for s in ax.spines.values()))

print("\n绘图区边框 / 网格线验收通过" if fail == 0 else f"\n失败 {fail} 项")
sys.exit(0 if fail == 0 else 1)
