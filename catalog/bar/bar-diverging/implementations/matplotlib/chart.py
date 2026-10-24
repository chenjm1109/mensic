"""正负柱状图（matplotlib 实现）。

水平柱：以零基线为界，正值取发散色暖端，负值取冷端。
"""

import numpy as np


def _style(params, key, group):
    """图形元素覆盖；没覆盖就返回空字典，走案例参数与发散色。"""
    return ((params.get("elements") or {}).get(key) or {}).get(str(group)) or {}


def _banded_rows(ax):
    """白色网格 + 隔行底色（横向柱对应行带）。"""
    ax.grid(axis="y", color="#ffffff", linewidth=1.5, zorder=1)
    yticks = ax.get_yticks()
    for i in range(len(yticks) - 1):
        if i % 2 == 1:
            ax.axhspan(yticks[i], yticks[i + 1], facecolor="#f6f8fb", zorder=0)


def create_chart(ax, data, params):
    diverging = params["tokens"]["color"]["diverging"]
    bar_height = params.get("bar_height", 0.8)

    style = _style(params, "bar", "*")
    height = float(style.get("size", bar_height))
    alpha = float(style.get("opacity", params.get("bar_alpha", 1)))

    values = data["数值"].to_numpy(dtype=float)
    y = np.arange(len(values))
    colors = [diverging[-1] if v >= 0 else diverging[0] for v in values]

    ax.barh(y, values, height=height, alpha=alpha, color=colors, zorder=3)
    ax.axvline(0, color="#ffffff", linewidth=1, zorder=2)
    _banded_rows(ax)
