# -*- coding: utf-8 -*-
"""验收：边缘分布（地毯线）必须贴着**数据区域的左边与下边**，而不是 x=0 / y=0 那两条线。

跑法：app/.renderer-venv/Scripts/python.exe <本文件>
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]          # app/
REPO = ROOT.parent
CONTENT = REPO / "catalog"

fail = 0


def check(name, ok, detail=""):
    global fail
    if not ok:
        fail += 1
    print(f"  {'ok  ' if ok else 'FAIL'}  {name}   {detail}")


def load(path: Path, alias: str):
    spec = importlib.util.spec_from_file_location(alias, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def col(df, *names):
    for n in names:
        if n in df.columns:
            return n
    raise KeyError(f"找不到列：{names}，实际列 {list(df.columns)}")


def render_case(case: str, impl_dir: Path):
    """用 desktop 的 render.py 渲染一个案例（和 App / 缩略图同一条路径）"""
    sys.path.insert(0, str(ROOT / "renderer"))
    render = load(ROOT / "renderer" / "render.py", "mensic_render_check")
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    chart = load(impl_dir / "chart.py", f"chart_{case}")
    tokens = render._load_tokens_yaml(str(REPO / "design" / "tokens.yaml"), "rose")
    data_dir = impl_dir.parents[1] / "data"
    csv = next(data_dir.glob("*.csv"))
    df = pd.read_csv(csv)
    params = {"tokens": tokens, "elements": {}, "point_size": 100, "alpha": 0.5, "show_projection": True}
    # 复现「有离群点」的数据：把首行改成一个远离主体范围的点
    xc, yc = col(df, "X轴", "X"), col(df, "Y轴", "Y", "大小")
    if yc == "大小":  # bubble-basic 的列是 X / Y / 大小
        yc = col(df, "Y")
    df.iloc[0, df.columns.get_loc(xc)] = -23.0
    df.iloc[0, df.columns.get_loc(yc)] = 28.0
    pres = {"projection": "rect", "canvas": {"size": [8, 5], "dpi": 150}}
    fig, _ = render.build_figure(chart.create_chart, df, params, pres, tokens)
    return fig, df, xc, yc


def rug_positions(fig):
    """返回 (x 轴的分布线所在 y, y 轴的分布线所在 x)"""
    ax = fig.axes[0]
    x_rug_y = None
    y_rug_x = None
    for coll in ax.collections:
        if coll.get_clip_path() is None and False:
            continue
        try:
            off = coll.get_offsets()
        except Exception:  # noqa: BLE001
            continue
        if len(off) == 0:
            continue
        if np.allclose(off[:, 1], off[0, 1]) and off[0, 1] not in (None,):
            x_rug_y = float(off[0, 1])
        if np.allclose(off[:, 0], off[0, 0]) and len(off) > 1:
            y_rug_x = float(off[0, 0])
    return x_rug_y, y_rug_x


print("== 边缘分布位置（应贴数据区域的左边与下边）==")
for case, impl in [
    ("scatter-basic", CONTENT / "scatter" / "scatter-basic" / "implementations" / "matplotlib"),
    ("scatter-group", CONTENT / "scatter" / "scatter-group" / "implementations" / "matplotlib"),
    ("bubble-basic", CONTENT / "scatter" / "bubble-basic" / "implementations" / "matplotlib"),
]:
    fig, df, xc, yc = render_case(case, impl)
    x_rug_y, y_rug_x = rug_positions(fig)
    ax = fig.axes[0]
    x0, x1 = float(df[xc].min()), float(df[xc].max())
    y0, y1 = float(df[yc].min()), float(df[yc].max())
    xlim, ylim = ax.get_xlim(), ax.get_ylim()
    check(f"{case}：x 的分布线贴下边（可视区）", x_rug_y is not None and abs(x_rug_y - (ylim[0] + (ylim[1] - ylim[0]) * 0.005)) < 1e-6,
          f"rug y={x_rug_y} 期望≈{ylim[0] + (ylim[1] - ylim[0]) * 0.005:.3f}（可视 y {ylim[0]:.2f}~{ylim[1]:.2f}）")
    check(f"{case}：y 的分布线贴左边（可视区）", y_rug_x is not None and abs(y_rug_x - (xlim[0] + (xlim[1] - xlim[0]) * 0.005)) < 1e-6,
          f"rug x={y_rug_x} 期望≈{xlim[0] + (xlim[1] - xlim[0]) * 0.005:.3f}（可视 x {xlim[0]:.2f}~{xlim[1]:.2f}）")
    check(f"{case}：没有画在原点线上", (x_rug_y is None or abs(x_rug_y) > 1e-9) and (y_rug_x is None or abs(y_rug_x) > 1e-9),
          "（旧实现会得到 y=0 / x=0）")
    # 地毯线不能把自动缩放撑大：视图应当≈数据范围 ± 默认 5% 边距
    span_x, span_y = xlim[1] - xlim[0], ylim[1] - ylim[0]
    check(f"{case}：地毯线没有撑大坐标范围",
          span_x < (x1 - x0) * 1.2 and span_y < (y1 - y0) * 1.2 and xlim[0] <= x0 and xlim[1] >= x1 and ylim[0] <= y0 and ylim[1] >= y1,
          f"x 跨度 {span_x:.2f}（数据 {x1 - x0:.2f}）、y 跨度 {span_y:.2f}（数据 {y1 - y0:.2f}）")

print("\n边缘分布验收通过 ✓" if fail == 0 else f"\n失败 {fail} 项")
sys.exit(0 if fail == 0 else 1)
