"""南丁格尔玫瑰图（matplotlib 极坐标实现）。

每个类别的角度宽度与半径都随数值变化：角度宽度 = 2π·v/Σv，
条形高度 = 数值，从而形成花瓣状。自顶部起逆时针铺开。
只画 marks；标题 / 半径范围由 presentation 施加。
"""

import numpy as np


def _style(params, key, group):
    """图形元素覆盖；没覆盖就返回空字典，走主题色板与案例参数。"""
    return ((params.get("elements") or {}).get(key) or {}).get(str(group)) or {}


def create_chart(ax, data, params):
    palette = params["tokens"]["color"]["palette"]
    inner = params.get("inner_radius", 10)
    show_labels = params.get("show_labels", True)

    labels = data["类别"].astype(str).tolist()
    values = data["数值"].astype(float).to_numpy()
    total = values.sum()

    widths = 2 * np.pi * values / total
    r_offsets = [5.0, -5.0] + [0.0] * (len(values) - 2)

    start = 0.0
    for i, value in enumerate(values):
        style = _style(params, "wedge", labels[i])
        color = style.get("color") or palette[i % len(palette)]
        alpha = float(style.get("opacity", params.get("wedge_alpha", 1)))
        start += 0.5 * widths[i]
        ax.bar(
            start,
            value,
            width=widths[i],
            bottom=inner,
            linewidth=2,
            edgecolor="#ffffff",
            color=color,
            alpha=alpha,
            zorder=3,
        )
        if show_labels:
            label = f"{labels[i]}\n{value / total * 100:.1f}% | {value:.0f}"
            text = ax.text(
                start,
                value * 0.75 + inner + r_offsets[i],
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

    ax.set_theta_direction(1)  # 逆时针
    ax.set_theta_offset(np.pi * 0.5)  # 从顶部开始

    # 去掉极坐标的刻度 / 网格 / 轴线 / 底盘
    ax.set_xticks([])
    ax.set_yticks([])
    ax.grid(False)
    ax.spines["polar"].set_visible(False)
    ax.set_facecolor("none")
