# -*- coding: utf-8 -*-
"""看看几个模板**实际渲染**出来的字号 / 字重是多少（用来给界面填默认值）。"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
sys.path.insert(0, str(ROOT / "renderer"))
spec = importlib.util.spec_from_file_location("vr", ROOT / "renderer" / "render.py")
render = importlib.util.module_from_spec(spec)
spec.loader.exec_module(render)

for case, cat in [
    ("scatter-basic", "scatter"),
    ("scatter-group", "scatter"),
    ("line-basic", "line"),
    ("bar-basic", "bar"),
    ("pie-basic", "pie"),
    ("heatmap-contour", "heatmap"),
]:
    impl = REPO / "catalog" / cat / case / "implementations" / "matplotlib"
    if not impl.exists():
        print(f"{case}: 无 matplotlib 实现")
        continue
    cspec = importlib.util.spec_from_file_location(f"c_{case}", impl / "chart.py")
    chart = importlib.util.module_from_spec(cspec)
    cspec.loader.exec_module(chart)
    tokens = render._load_tokens_yaml(str(REPO / "design" / "tokens.yaml"), "rose")
    csv = next((impl.parents[1] / "data").glob("*.csv"))
    df = pd.read_csv(csv)
    pres = {"projection": "rect", "canvas": {"size": [8, 5], "dpi": 150}}
    params = {"tokens": tokens, "elements": {}, "point_size": 100, "alpha": 0.5, "show_projection": True}
    try:
        fig, _ = render.build_figure(chart.create_chart, df, params, pres, tokens)
    except Exception as exc:  # noqa: BLE001
        print(f"{case}: 渲染失败 {exc}")
        continue
    ax = fig.axes[0]
    ticks = list(ax.get_xticklabels()) + list(ax.get_yticklabels())
    tick_size = ticks[0].get_fontsize() if ticks else None
    tick_weight = ticks[0].get_fontweight() if ticks else None
    print(
        f"{case:16s} 轴标签: {ax.xaxis.label.get_fontsize():>5} {str(ax.xaxis.label.get_fontweight()):>7}"
        f"   刻度: {str(tick_size):>5} {str(tick_weight):>7}"
    )
