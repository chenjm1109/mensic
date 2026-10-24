"""半环饼图（matplotlib 极坐标实现）。

用极坐标 bar 把每个类别的角度宽度拼成 0~π 的半环：
角度宽度与数值成正比，条形从 radius 到 radius+thickness。
只画 marks，标题 / 半径范围 / 图例由 presentation 与图例定位处理。
"""

import numpy as np
import matplotlib.patches as mpatches


def _style(params, key, group):
    """图形元素覆盖；没覆盖就返回空字典，走主题色板与案例参数。"""
    return ((params.get("elements") or {}).get(key) or {}).get(str(group)) or {}


def create_chart(ax, data, params):
    palette = params["tokens"]["color"]["palette"]
    radius = params.get("radius", 20)
    thickness = params.get("thickness", 10)
    show_labels = params.get("show_labels", True)

    labels = data["类别"].astype(str).tolist()
    values = data["数值"].astype(float).to_numpy()
    total = values.sum()

    # 每个类别的角度宽度（半环：总和为 π）
    widths = np.pi * values / total
    start = 0.0
    colors = []
    for i, value in enumerate(values):
        style = _style(params, "wedge", labels[i])
        color = style.get("color") or palette[i % len(palette)]
        alpha = float(style.get("opacity", params.get("wedge_alpha", 1)))
        colors.append(color)
        start += 0.5 * widths[i]
        ax.bar(
            start,
            thickness,
            width=widths[i],
            bottom=radius,
            linewidth=2,
            edgecolor="#ffffff",
            color=color,
            alpha=alpha,
            zorder=3,
        )
        if show_labels:
            label = f"{widths[i] / np.pi * 100:.1f}% | {value:.0f}"
            text = ax.text(
                start,
                radius + thickness / 2,
                label,
                color="#ffffff",
                fontsize=8,
                ha="center",
                va="center",
                fontweight="bold",
                zorder=4,
            )
            text.set_bbox(
                dict(facecolor="#75879655", edgecolor="none", boxstyle="round,pad=0.5")
            )
        start += 0.5 * widths[i]

    # 半环不需要极坐标的刻度、网格、轴线与底盘
    ax.set_xticks([])
    ax.set_yticks([])
    ax.grid(False)
    ax.spines["polar"].set_visible(False)
    ax.set_facecolor("none")

    # 图例置于画布顶部；条形不注册 label，避免被 presentation 覆盖定位
    handles = [
        mpatches.Patch(facecolor=colors[i % len(colors)], edgecolor="#ffffff", label=label)
        for i, label in enumerate(labels)
    ]
    ax.legend(
        handles=handles,
        loc="lower center",
        bbox_to_anchor=(0.5, 1.14),
        ncols=len(labels),
        frameon=False,
    )
