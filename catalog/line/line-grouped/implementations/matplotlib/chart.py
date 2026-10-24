"""分组折线图（matplotlib 实现）。

契约：只绘制图形本身（marks），标题 / 坐标范围 / 刻度 / 图例位置由专题的
presentation 规格统一施加。颜色一律来自 ``params["tokens"]["color"]``。
"""


def _style(params, key, group):
    return ((params.get("elements") or {}).get(key) or {}).get(str(group)) or {}


def create_chart(ax, data, params):
    palette = params["tokens"]["color"]["palette"]
    grid = params["tokens"]["color"]["grid"]
    line_width = params.get("line_width", 3)
    marker_size = params.get("marker_size", 5)

    x = data["年份"].to_numpy(dtype=float)
    series = [name for name in data.columns if name != "年份"]

    y_max = float(data[series].to_numpy().max()) * 1.1

    # 全球化时期高亮（全高竖带 + 两端虚线）
    ax.axvspan(2000, 2014, color=palette[4], alpha=0.2, zorder=0)
    for edge in (2000, 2014):
        ax.plot([edge, edge], [0, y_max], color=palette[4], linestyle="--", linewidth=1, zorder=2)
    ax.text(2000 - 0.5, y_max * 0.72, "2000年", ha="right", va="bottom", color=palette[4], fontsize=9)
    ax.text(2014 + 0.5, y_max * 0.72, "2014年", ha="left", va="bottom", color=palette[4], fontsize=9)
    ax.text(2007, y_max * 0.5, "全球化时期", ha="center", va="bottom", color=palette[4], fontsize=9)

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
    idx = int(x.tolist().index(1993))
    cameroon = data["喀麦隆"].to_numpy(dtype=float)
    cam_color = colors[series.index("喀麦隆")]
    cam_size = float(_style(params, "marker", "喀麦隆").get("size", marker_size))
    ax.scatter([x[idx]], [cameroon[idx]], color=cam_color, s=cam_size * 8, zorder=6)
    ax.text(
        x[idx],
        cameroon[idx] * 1.05,
        "历史高位",
        ha="center",
        va="bottom",
        color=cam_color,
        fontsize=9,
        zorder=7,
    )

    ax.grid(axis="y", linestyle="--", linewidth=0.5, color=grid, zorder=0)
