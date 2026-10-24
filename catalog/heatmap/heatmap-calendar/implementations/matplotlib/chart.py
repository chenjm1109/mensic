"""日历热力图（matplotlib 实现，projection: figure）。

契约：只绘制 marks（3×4 月历色块 + 网格线 + 单元格数值 + 月份小标题），
全年总标题由 presentation 以 suptitle 施加。
需要多子图，故接收 fig 并自行 fig.subplots(3, 4)。
"""

import numpy as np
from matplotlib.colors import LinearSegmentedColormap, Normalize

MONTHS = [
    "一月", "二月", "三月", "四月", "五月", "六月",
    "七月", "八月", "九月", "十月", "十一月", "十二月",
]
WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"]


def _style(params, key, group):
    return ((params.get("elements") or {}).get(key) or {}).get(str(group)) or {}


def create_chart(fig, data, params):
    sequential = params["tokens"]["color"]["sequential"]
    show_values = params.get("show_values", True)
    cell_alpha = params.get("cell_alpha", 1)
    cmap = LinearSegmentedColormap.from_list("sequential", sequential, N=100)

    style = _style(params, "cell", "*")
    cell_alpha = float(style.get("opacity", cell_alpha))

    vmin = float(data["数值"].min())
    vmax = float(data["数值"].max())
    norm = Normalize(vmin=vmin, vmax=vmax)

    axes = fig.subplots(3, 4)
    for idx, ax in enumerate(axes.ravel()):
        month = idx + 1
        sub = data[data["月份"] == month]

        grid = np.full((6, 7), np.nan)
        for _, row in sub.iterrows():
            grid[int(row["周"]), int(row["星期"])] = row["数值"]

        ax.imshow(grid, cmap=cmap, norm=norm, aspect="auto", alpha=cell_alpha)

        ax.set_xticks(np.arange(-0.5, 7, 1), minor=True)
        ax.set_yticks(np.arange(-0.5, 6, 1), minor=True)
        ax.grid(which="minor", color="#ffffff", linestyle="-", linewidth=1)
        ax.tick_params(which="minor", size=0)

        ax.set_xticks(np.arange(7))
        ax.set_yticks([])
        ax.set_xticklabels(WEEKDAYS, fontweight="bold", fontsize=8)

        if show_values:
            for i in range(6):
                for j in range(7):
                    if np.isnan(grid[i, j]):
                        continue
                    value = int(grid[i, j])
                    if -40 <= value < 0:
                        text_color = sequential[0]
                    elif 0 <= value < 40:
                        text_color = sequential[-1]
                    else:
                        text_color = "#ffffff"
                    ax.text(
                        j, i, f"{value}",
                        ha="center", va="center",
                        color=text_color, size=6, weight="bold",
                    )

        ax.set_title(MONTHS[idx], fontsize=10)
