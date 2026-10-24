"""标准折线图（matplotlib 实现）。

契约：只绘制图形本身（marks），标题 / 坐标范围 / 刻度 / 图例位置由专题的
presentation 规格统一施加，以保证与其他库的实现视觉对齐。
颜色一律从 ``params["tokens"]["color"]`` 读取，不写死十六进制值。
"""

import numpy as np

# 单组图表的元素 key（与前端 SINGLE_GROUP 一致）
SINGLE = "*"


def _style(params, key, group):
    return ((params.get("elements") or {}).get(key) or {}).get(str(group)) or {}


def _at(x, y, year):
    """返回最接近给定年份的数据点。"""
    i = int(np.argmin(np.abs(np.asarray(x) - year)))
    return float(x[i]), float(y[i])


def create_chart(ax, data, params):
    palette = params["tokens"]["color"]["palette"]
    grid = params["tokens"]["color"]["grid"]
    line_style = _style(params, "line", SINGLE)
    marker_style = _style(params, "marker", SINGLE)
    line_color = line_style.get("color") or palette[3]
    line_width = float(line_style.get("size", params.get("line_width", 3)))
    marker_size = float(marker_style.get("size", params.get("marker_size", 6)))
    # 折线上的空心节点描边跟随折线色；关键节点不带覆盖时用主题色板第 5 色
    node_color = marker_style.get("color") or line_color

    x = data["年份"].to_numpy(dtype=float)
    y = data["阿尔及利亚"].to_numpy(dtype=float)

    # 区间高亮：折线下方填充 + 两端虚线（发展期 / 衰退期）
    for lo, hi, name, color in [
        (2002, 2014, "发展期", palette[0]),
        (1987, 1995, "衰退期", palette[1]),
    ]:
        mask = (x >= lo) & (x <= hi)
        ax.fill_between(x[mask], y[mask], color=color, alpha=0.3, label=name, zorder=2)
        for edge, edge_y in ((lo, y[mask][0]), (hi, y[mask][-1])):
            ax.plot([edge, edge], [0, edge_y], color=color, linestyle="--", linewidth=1, zorder=3)

    # 主折线 + 空心节点
    ax.plot(
        x,
        y,
        color=line_color,
        linewidth=line_width,
        zorder=5,
        marker="o",
        markersize=marker_size,
        markerfacecolor="white",
        markeredgecolor=node_color,
        markeredgewidth=1.5,
        label="_nolegend_",
    )

    # 关键节点：实心点 + 文字标注
    key_color = marker_style.get("color") or palette[4]
    for year, ratio, va, ha, label in [
        (1987, 1.06, "bottom", "center", "衰退开始"),
        (1995, 0.94, "top", "center", "衰退结束"),
        (2008, 1.02, "bottom", "right", None),
    ]:
        xi, yi = _at(x, y, year)
        ax.scatter([xi], [yi], color=key_color, s=marker_size * 6, zorder=6)
        text = f"{label}：{yi:.1f}亿" if label else f"{int(xi)}年：{yi:.1f}亿"
        ax.text(xi, yi * ratio, text, ha=ha, va=va, color=key_color, fontsize=9, zorder=7)

    # 网格线
    ax.grid(axis="y", linestyle="--", linewidth=0.5, color=grid, zorder=0)
