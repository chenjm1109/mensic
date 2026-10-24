"""瀑布图（matplotlib 实现）。

每根柱子从上一根柱子的累计值（bottom）出发，正负增量上下浮动。
"""

import numpy as np


def _style(params, key, group):
    """图形元素覆盖；没覆盖就返回空字典，走案例参数与正负语义色。"""
    return ((params.get("elements") or {}).get(key) or {}).get(str(group)) or {}


def _banded_background(ax):
    ax.grid(axis="y", color="#ffffff", linewidth=1.5, zorder=1)
    yticks = ax.get_yticks()
    for i in range(len(yticks) - 1):
        if i % 2 == 1:
            ax.axhspan(yticks[i], yticks[i + 1], facecolor="#f6f8fb", zorder=0)


def create_chart(ax, data, params):
    palette = params["tokens"]["color"]["palette"]
    bar_width = params.get("bar_width", 0.6)
    show_labels = params.get("show_labels", True)

    style = _style(params, "bar", "*")
    width = float(style.get("size", bar_width))
    alpha = float(style.get("opacity", params.get("bar_alpha", 1)))

    values = data["数值"].to_numpy(dtype=float)
    x = np.arange(len(values))

    bottoms = np.zeros(len(values), dtype=float)
    running = 0.0
    for i, value in enumerate(values):
        bottoms[i] = running
        running += value

    colors = [palette[1] if v >= 0 else palette[0] for v in values]
    ax.bar(x, values, width=width, alpha=alpha, bottom=bottoms, color=colors, zorder=3)

    if show_labels:
        for xi, value, bottom in zip(x, values, bottoms):
            ax.text(
                xi,
                bottom + value / 2,
                f"{abs(value):g}",
                ha="center",
                va="center",
                color="white",
                fontweight="bold",
                fontsize=9,
                zorder=4,
            )

    ax.set_xticks(x, [str(c) for c in data["步骤"]])
    _banded_background(ax)
