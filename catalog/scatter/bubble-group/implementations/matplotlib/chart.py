"""分组气泡图（matplotlib 实现）。

契约：只画 marks（气泡 + 地毯线 + 类型/尺寸两个图例）；标题 / 坐标范围 /
刻度 / 图例位置交给 presentation。
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
    xcol, ycol, scol, gcol = "X", "Y", "大小", "类型"

    x = data[xcol].to_numpy(dtype=float)
    y = data[ycol].to_numpy(dtype=float)
    groups = data[gcol].astype(str).to_numpy()
    categories = list(dict.fromkeys(groups))

    colors = []
    for i, cat in enumerate(categories):
        style = _style(params, "point", cat)
        colors.append(style.get("color") or palette[i % len(palette)])

    for i, cat in enumerate(categories):
        mask = groups == cat
        style = _style(params, "point", cat)
        color = colors[i]
        group_scale = float(style.get("size", size_scale))
        group_alpha = float(style.get("opacity", alpha))
        s = data[scol].to_numpy(dtype=float) * group_scale
        ax.scatter(x[mask], y[mask], s=s[mask], c=color, alpha=group_alpha, zorder=3)
        # 该组的两轴地毯线
        ax.scatter(x[mask], np.zeros(mask.sum()), marker="|", color=color, alpha=group_alpha, s=300, zorder=3)
        ax.scatter(np.zeros(mask.sum()), y[mask], marker="_", color=color, alpha=group_alpha, s=300, zorder=3)

    # 类型图例（左上）
    type_handles = [_dot(colors[i], cat, 15) for i, cat in enumerate(categories)]
    legend_type = ax.legend(handles=type_handles, loc="upper left", ncols=1)
    ax.add_artist(legend_type)

    # 尺寸图例（右上，用中性色避免与类型混淆）
    size_handles = [
        _dot(tokens["grid"], "数值小", 10),
        _dot(tokens["grid"], "数值大", 16),
    ]
    ax.legend(handles=size_handles, loc="upper right", ncols=1)
