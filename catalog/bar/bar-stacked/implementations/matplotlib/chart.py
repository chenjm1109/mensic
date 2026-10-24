"""堆叠柱状图（matplotlib 实现）。"""

import numpy as np


def _style(params, key, group):
    """图形元素覆盖；没覆盖就返回空字典，走案例参数与主题色板。"""
    return ((params.get("elements") or {}).get(key) or {}).get(str(group)) or {}


def _pivot(data):
    groups = list(dict.fromkeys(data["组别"].astype(str)))
    pivot = data.pivot(index="类别", columns="组别", values="数值").sort_index()
    pivot.columns = pivot.columns.astype(str)
    return pivot[groups], groups


def _banded_background(ax):
    ax.grid(axis="y", color="#ffffff", linewidth=1.5, zorder=1)
    yticks = ax.get_yticks()
    for i in range(len(yticks) - 1):
        if i % 2 == 1:
            ax.axhspan(yticks[i], yticks[i + 1], facecolor="#f6f8fb", zorder=0)


def create_chart(ax, data, params):
    palette = params["tokens"]["color"]["palette"]
    bar_width = params.get("bar_width", 0.7)

    pivot, groups = _pivot(data)
    slots = np.arange(len(pivot), dtype=float)
    bottom = np.zeros(len(pivot), dtype=float)

    for i, group in enumerate(groups):
        values = pivot[group].to_numpy(dtype=float)
        style = _style(params, "bar", group)
        width = float(style.get("size", bar_width))
        alpha = float(style.get("opacity", params.get("bar_alpha", 1)))
        ax.bar(
            slots,
            values,
            width=width,
            alpha=alpha,
            bottom=bottom,
            color=style.get("color") or palette[i % len(palette)],
            label=group,
            zorder=3,
        )
        bottom += values

    ax.set_xticks(slots, [str(c) for c in pivot.index])
    _banded_background(ax)
