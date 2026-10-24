"""分组柱状图（matplotlib 实现）。

契约：只画 marks；标题 / 坐标范围 / 刻度 / 图例位置由 presentation 施加。
类别轴刻度位置属于绘制几何的一部分，因此在此显式设置。
"""

import numpy as np


def _style(params, key, group):
    """图形元素覆盖；没覆盖就返回空字典，走案例参数与主题色板。"""
    return ((params.get("elements") or {}).get(key) or {}).get(str(group)) or {}


def _pivot(data):
    """按 类别 × 组别 透视，保持组别首次出现顺序。"""
    groups = list(dict.fromkeys(data["组别"].astype(str)))
    pivot = data.pivot(index="类别", columns="组别", values="数值").sort_index()
    pivot.columns = pivot.columns.astype(str)
    return pivot[groups], groups


def _banded_background(ax):
    """白色网格 + 隔行底色（与 bar 系列样板保持一致）。"""
    ax.grid(axis="y", color="#ffffff", linewidth=1.5, zorder=1)
    yticks = ax.get_yticks()
    for i in range(len(yticks) - 1):
        if i % 2 == 1:
            ax.axhspan(yticks[i], yticks[i + 1], facecolor="#f6f8fb", zorder=0)


def create_chart(ax, data, params):
    palette = params["tokens"]["color"]["palette"]
    bar_width = params.get("bar_width", 0.25)
    gap = params.get("gap", 0.05)

    pivot, groups = _pivot(data)
    n = len(groups)
    slots = np.arange(len(pivot), dtype=float)

    styles = [_style(params, "bar", group) for group in groups]
    widths = [float(s.get("size", bar_width)) for s in styles]
    # 宽度可逐系列调整：按「宽 + 间隙」累加排布，默认值下与等宽居中完全一致
    total = sum(widths) + gap * (n - 1) if n else 0.0
    cursor = -total / 2

    for i, group in enumerate(groups):
        style = styles[i]
        alpha = float(style.get("opacity", params.get("bar_alpha", 1)))
        color = style.get("color") or palette[i % len(palette)]
        ax.bar(
            slots + cursor + widths[i] / 2,
            pivot[group].to_numpy(dtype=float),
            width=widths[i],
            alpha=alpha,
            color=color,
            label=group,
            zorder=3,
        )
        cursor += widths[i] + gap

    ax.set_xticks(slots, [str(c) for c in pivot.index])
    _banded_background(ax)
