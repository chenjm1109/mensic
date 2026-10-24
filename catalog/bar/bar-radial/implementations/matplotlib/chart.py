"""径向柱状图（matplotlib 极坐标实现）。

柱子沿圆周均匀排布，柱长表示数值；颜色按阈值分类。
"""

import matplotlib.patches as mpatches
import numpy as np


def _style(params, key, group):
    """图形元素覆盖；没覆盖就返回空字典，走案例参数与阈值语义色。"""
    return ((params.get("elements") or {}).get(key) or {}).get(str(group)) or {}


def create_chart(ax, data, params):
    palette = params["tokens"]["color"]["palette"]
    base = params.get("base", 10)
    bar_ratio = params.get("bar_ratio", 1)

    values = data["数值"].to_numpy(dtype=float)
    count = len(values)
    angles = np.linspace(0, 2 * np.pi, count, endpoint=False)
    categories = data["类别"].astype(str).tolist()
    style = _style(params, "bar", "*")
    colors = [
        style.get("color")
        or (palette[3] if v < 15 else palette[0] if v > 25 else palette[1])
        for v in values
    ]
    widths = [2 * np.pi / count * float(style.get("size", bar_ratio)) for _ in values]
    alphas = [float(style.get("opacity", params.get("bar_alpha", 1))) for _ in values]

    bars = ax.bar(
        angles,
        values,
        width=widths,
        bottom=base,
        color=colors,
        edgecolor="#f1f5f9",
        linewidth=1,
        zorder=2,
    )
    for bar, alpha in zip(bars, alphas):
        bar.set_alpha(alpha)

    for bar, angle, value in zip(bars, angles, values):
        rotation = np.degrees(angle)
        ha = "right" if 90 < rotation < 270 else "left"
        if 90 < rotation < 270:
            rotation -= 180
        ax.text(
            angle,
            base + value - 3,
            f"{int(value)}",
            ha=ha,
            va="center",
            fontsize=8,
            fontweight="bold",
            rotation=rotation,
            rotation_mode="anchor",
            color="white",
            zorder=4,
        )

    ax.set_yticks([])
    ax.set_xticks(angles, [str(int(c)) for c in data["类别"]])
    ax.tick_params(axis="x", labelsize=8, pad=-5)

    handles = [
        mpatches.Patch(color=palette[3], label="过低值"),
        mpatches.Patch(color=palette[1], label="正常值"),
        mpatches.Patch(color=palette[0], label="过高值"),
    ]
    ax.legend(handles=handles, loc="center right", ncols=1, handleheight=1, handlelength=1)

    ax.grid(axis="x", linestyle="--", linewidth=0.5, color=palette[3], alpha=0.5, zorder=1)
