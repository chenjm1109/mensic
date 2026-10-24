"""环形柱状图（matplotlib 极坐标实现）。

每个环是一段从 0 角度起始的圆弧，角度跨度与数值成正比；颜色按阈值分类。
"""

import matplotlib.patches as mpatches
import numpy as np


def _style(params, key, group):
    """图形元素覆盖；没覆盖就返回空字典，走案例参数与阈值语义色。"""
    return ((params.get("elements") or {}).get(key) or {}).get(str(group)) or {}


def create_chart(ax, data, params):
    palette = params["tokens"]["color"]["palette"]
    ring_width = params.get("ring_width", 0.8)
    inner_offset = params.get("inner_offset", 2)

    categories = data["类别"].astype(str).tolist()
    values = data["数值"].to_numpy(dtype=float)
    max_value = float(values.max()) * 1.1

    # 从正上方开始、顺时针展开
    ax.set_theta_direction(-1)
    ax.set_theta_offset(np.pi / 2)

    style = _style(params, "ring", "*")
    height = float(style.get("size", ring_width))
    alpha = float(style.get("opacity", params.get("ring_alpha", 1)))

    for i, (_, value) in enumerate(zip(categories, values)):
        inner_radius = i + inner_offset
        theta_end = (value / max_value) * 2 * np.pi
        theta_mid = theta_end / 2
        theta_end_deg = np.degrees(theta_end)
        rotation = -theta_end_deg / 2 if theta_end_deg < 180 else -180 - theta_end_deg / 2

        if value < 15:
            color = palette[3]
        elif value > 25:
            color = palette[0]
        else:
            color = palette[1]
        color = style.get("color") or color

        ax.bar(
            theta_mid,
            height=height,
            width=theta_end,
            bottom=inner_radius,
            alpha=alpha,
            color=color,
            zorder=3,
        )
        ax.text(
            theta_mid,
            inner_radius + height / 2,
            f"{int(value)}",
            ha="center",
            va="center",
            color="white",
            fontsize=6,
            fontweight="bold",
            rotation=rotation,
            rotation_mode="anchor",
            zorder=4,
        )

    ax.set_xticks([])
    ax.set_yticks(np.arange(len(categories)) + inner_offset, categories)
    ax.set_rlabel_position(0)
    ax.tick_params(axis="y", labelsize=6)

    handles = [
        mpatches.Patch(color=palette[3], label="过低值"),
        mpatches.Patch(color=palette[1], label="正常值"),
        mpatches.Patch(color=palette[0], label="过高值"),
    ]
    ax.legend(handles=handles, loc="center right", ncols=1, handleheight=1, handlelength=1)
