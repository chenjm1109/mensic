"""单轴分组气泡图（matplotlib 实现）。

y 轴是分类轴（分组），x 轴为数值；气泡大小编码数值。
只画 marks 与两个自定义图例，标题 / 刻度 / 图例位置交给 presentation。
"""

import numpy as np
from matplotlib.lines import Line2D


def _style(params, key, group):
    return ((params.get("elements") or {}).get(key) or {}).get(str(group)) or {}


def _dot(color, label, size):
    return Line2D(
        [0],
        [0],
        marker="o",
        color="#ffffff",
        markersize=size,
        markerfacecolor=color,
        markeredgecolor="#ffffff",
        label=label,
    )


def create_chart(ax, data, params):
    tokens = params["tokens"]["color"]
    palette = tokens["palette"]
    alpha = params.get("point_alpha", 0.5)
    size_scale = params.get("size_scale", 1.0)
    xcol, gcol, scol = "X", "分组", "大小"

    groups = list(dict.fromkeys(data[gcol].astype(str)))
    group_series = data[gcol].astype(str)
    color_map = {}
    for i, g in enumerate(groups):
        style = _style(params, "point", g)
        color_map[g] = style.get("color") or palette[i % len(palette)]
    colors = [color_map[g] for g in group_series]

    sizes = []
    for g in group_series:
        style = _style(params, "point", g)
        sizes.append(float(style.get("size", size_scale)))
    sizes = np.asarray(sizes)

    alphas = []
    for g in group_series:
        style = _style(params, "point", g)
        alphas.append(float(style.get("opacity", alpha)))

    ax.scatter(
        data[xcol].to_numpy(dtype=float),
        group_series.to_numpy(),
        s=data[scol].to_numpy(dtype=float) * sizes,
        c=colors,
        alpha=alphas,
        zorder=3,
    )

    # 分组图例（上）与尺寸图例（右下）
    group_handles = [_dot(color_map[g], g, 12) for g in groups]
    legend_group = ax.legend(handles=group_handles, loc="upper center", ncols=5)
    ax.add_artist(legend_group)
    size_handles = [
        _dot(tokens["grid"], "数值 20", 8),
        _dot(tokens["grid"], "数值 300", 14),
        _dot(tokens["grid"], "数值 500", 22),
    ]
    ax.legend(handles=size_handles, loc="lower right", ncols=1)

    # 只保留横向网格，强调分组条带
    ax.grid(axis="y", color="#ffffff", linewidth=1.5, zorder=1)
    ax.set_axisbelow(True)
