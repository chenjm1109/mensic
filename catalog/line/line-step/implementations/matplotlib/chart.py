"""阶梯折线图（matplotlib 实现）。

原脚本只取 2000 年之后的数据，这里同样按年份过滤；标题 / 范围 / 刻度 / 图例交给 presentation。
"""

import numpy as np

Y_REF = 250.0


def _style(params, key, group):
    return ((params.get("elements") or {}).get(key) or {}).get(str(group)) or {}


def create_chart(ax, data, params):
    palette = params["tokens"]["color"]["palette"]
    grid = params["tokens"]["color"]["grid"]
    line_width = params.get("line_width", 3)
    marker_size = params.get("marker_size", 5)

    x_all = data["年份"].to_numpy(dtype=float)
    mask = x_all >= 2000
    x = x_all[mask]
    series = [name for name in data.columns if name != "年份"]
    y_max = float(data.loc[mask, series].to_numpy().max())

    # 2016–2020 区间高亮
    ax.axvspan(2016, 2020, color=palette[1], alpha=0.1, zorder=0)
    for edge in (2016, 2020):
        ax.plot([edge, edge], [0, y_max * 1.1], color=palette[1], linestyle="--", linewidth=1, zorder=2)
        ax.text(edge - 0.2, y_max * 0.8, f"{edge}年", ha="right", va="bottom", color=palette[1], fontsize=9)

    # 阶梯多序列
    for i, name in enumerate(series):
        line_style = _style(params, "line", name)
        marker_style = _style(params, "marker", name)
        color = line_style.get("color") or palette[i % len(palette)]
        ax.step(
            x,
            data.loc[mask, name].to_numpy(dtype=float),
            where="mid",
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

    # 250 亿美元参考线
    ax.plot([1999, 2024], [Y_REF, Y_REF], color=palette[0], linestyle="--", linewidth=1, zorder=3)
    ax.text(2005, Y_REF * 1.01, "250亿美元", ha="right", va="bottom", color=palette[0], fontsize=9)

    ax.grid(axis="y", linestyle="--", linewidth=0.5, color=grid, zorder=0)
