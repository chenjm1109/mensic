"""基本柱状图（matplotlib 实现）。

契约：只绘制图形本身（marks），标题 / 坐标范围 / 图例位置由专题的
presentation 规格统一施加，以保证与其他库的实现视觉对齐。
"""

import matplotlib.patches as mpatches


def _style(params, key, group):
    """图形元素覆盖；没覆盖就返回空字典，走案例参数与语义色。"""
    return ((params.get("elements") or {}).get(key) or {}).get(str(group)) or {}


def create_chart(ax, data, params):
    palette = params["tokens"]["color"]["palette"]
    low = params.get("low", 10)
    high = params.get("high", 60)
    show_labels = params.get("show_labels", True)
    bar_width = params.get("bar_width", 0.8)

    style = _style(params, "bar", "*")
    width = float(style.get("size", bar_width))
    alpha = float(style.get("opacity", params.get("bar_alpha", 1)))

    labels = data["类别"].astype(str).tolist()
    values = data["数值"].tolist()

    colors = [
        palette[3] if v < low else palette[0] if v > high else palette[1] for v in values
    ]
    bars = ax.bar(labels, values, width=width, alpha=alpha, color=colors, zorder=3)

    if show_labels:
        for bar, value in zip(bars, values):
            ax.text(
                bar.get_x() + bar.get_width() / 2,
                bar.get_height() - 2.5,
                f"{int(value)}",
                ha="center",
                va="center",
                color="white",
                fontweight="bold",
                fontsize=10,
                zorder=4,
            )

    # 参考线
    ax.axhline(y=low, color=palette[3], linestyle="--", linewidth=1, zorder=2)
    ax.axhline(y=high, color=palette[0], linestyle="--", linewidth=1, zorder=2)

    # 自定义图例
    handles = [
        mpatches.Patch(color=palette[3], label="过低值"),
        mpatches.Patch(color=palette[1], label="正常值"),
        mpatches.Patch(color=palette[0], label="过高值"),
    ]
    ax.legend(handles=handles, loc="upper right", ncols=3, frameon=True)

    # 白色网格 + 隔行底色
    ax.grid(axis="y", color="#ffffff", linewidth=1.5, zorder=1)
    yticks = ax.get_yticks()
    for i in range(len(yticks) - 1):
        if i % 2 == 1:
            ax.axhspan(yticks[i], yticks[i + 1], facecolor="#f6f8fb", zorder=0)