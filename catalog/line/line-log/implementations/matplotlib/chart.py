"""对数坐标折线图（matplotlib 实现）。

对数纵坐标属于轴类型设置，presentation 契约未覆盖，因此在实现中调用
``ax.set_yscale("log")`` 并显式指定值域；标题 / x 轴范围 / 刻度 / 图例仍交给 presentation。
"""

import numpy as np

Y_LOG_MIN = 0.3
Y_LOG_MAX = 2400.0


def _style(params, key, group):
    return ((params.get("elements") or {}).get(key) or {}).get(str(group)) or {}


def create_chart(ax, data, params):
    palette = params["tokens"]["color"]["palette"]
    grid = params["tokens"]["color"]["grid"]
    line_width = params.get("line_width", 3)
    marker_size = params.get("marker_size", 5)

    x = data["年份"].to_numpy(dtype=float)
    series = [name for name in data.columns if name != "年份"]

    # 对数纵坐标
    ax.set_yscale("log")
    ax.set_ylim(Y_LOG_MIN, Y_LOG_MAX)

    # 全球化时期高亮（贴近底部）
    ax.axvspan(2000, 2014, color=palette[4], alpha=0.2, zorder=0)
    for edge in (2000, 2014):
        ax.plot([edge, edge], [Y_LOG_MIN, Y_LOG_MAX], color=palette[4], linestyle="--", linewidth=1, zorder=2)
    ax.text(2000 - 0.5, Y_LOG_MIN * 2, "2000年", ha="right", va="bottom", color=palette[4], fontsize=9)
    ax.text(2014 + 0.5, Y_LOG_MIN * 2, "2014年", ha="left", va="bottom", color=palette[4], fontsize=9)
    ax.text(2007, Y_LOG_MIN * 4, "全球化时期", ha="center", va="bottom", color=palette[4], fontsize=9)

    # 多序列折线
    colors = []
    for i, name in enumerate(series):
        line_style = _style(params, "line", name)
        marker_style = _style(params, "marker", name)
        color = line_style.get("color") or palette[i % len(palette)]
        colors.append(color)
        ax.plot(
            x,
            data[name].to_numpy(dtype=float),
            color=color,
            marker="o",
            markersize=float(marker_style.get("size", marker_size)),
            markerfacecolor="white",
            markeredgecolor=marker_style.get("color") or color,
            markeredgewidth=1.2,
            linewidth=float(line_style.get("size", line_width)),
            label=name,
            zorder=4,
        )

    # 历史高位标注（喀麦隆，1993）
    cameroon = data["喀麦隆"].to_numpy(dtype=float)
    cam_color = colors[series.index("喀麦隆")]
    cam_size = float(_style(params, "marker", "喀麦隆").get("size", marker_size))
    idx = int(np.where(x == 1993)[0][0])
    ax.scatter([1993], [cameroon[idx]], color=cam_color, s=cam_size * 8, zorder=6)
    ax.text(
        1993,
        cameroon[idx] * 1.05,
        "历史高位",
        ha="center",
        va="bottom",
        color=cam_color,
        fontsize=9,
        zorder=7,
    )

    # 对数坐标同时显示主 / 次网格
    ax.grid(which="major", axis="y", linestyle="--", linewidth=0.5, color=grid, zorder=0)
    ax.grid(which="minor", axis="y", linestyle="--", linewidth=0.3, color=grid, zorder=0)
