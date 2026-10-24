"""表格型热力图（matplotlib 实现）。

契约：只绘制 marks（色块矩阵 + 白色网格线 + 单元格数值 + 色条），
标题 / 坐标轴标签由 presentation 统一施加。
"""

import numpy as np
from matplotlib.colors import LinearSegmentedColormap


def _style(params, key, group):
    return ((params.get("elements") or {}).get(key) or {}).get(str(group)) or {}


def create_chart(ax, data, params):
    sequential = params["tokens"]["color"]["sequential"]
    show_values = params.get("show_values", True)
    cell_alpha = params.get("cell_alpha", 1)
    cmap = LinearSegmentedColormap.from_list("sequential", sequential, N=256)

    style = _style(params, "cell", "*")
    cell_alpha = float(style.get("opacity", cell_alpha))

    grid = data.pivot(index="行", columns="列", values="数值").sort_index().sort_index(axis=1)
    values = grid.to_numpy(dtype=float)
    n_rows, n_cols = values.shape

    image = ax.imshow(values, cmap=cmap, aspect="auto", alpha=cell_alpha)

    # 白色网格线
    ax.set_xticks(np.arange(-0.5, n_cols, 1), minor=True)
    ax.set_yticks(np.arange(-0.5, n_rows, 1), minor=True)
    ax.grid(which="minor", color="#ffffff", linestyle="-", linewidth=1)
    ax.tick_params(which="minor", size=0)

    # 单元格编号（1 起始）
    ax.set_xticks(np.arange(n_cols))
    ax.set_yticks(np.arange(n_rows))
    ax.set_xticklabels([str(i + 1) for i in range(n_cols)], fontweight="bold")
    ax.set_yticklabels([str(i + 1) for i in range(n_rows)], fontweight="bold")
    ax.xaxis.set_ticks_position("bottom")

    if show_values:
        for i in range(n_rows):
            for j in range(n_cols):
                value = values[i, j]
                if -40 <= value < 0:
                    text_color = sequential[0]
                elif 0 <= value < 40:
                    text_color = sequential[-1]
                else:
                    text_color = "#ffffff"
                ax.text(
                    j,
                    i,
                    f"{int(value)}",
                    ha="center",
                    va="center",
                    size=6,
                    weight="bold",
                    color=text_color,
                )

    ax.figure.colorbar(image, ax=ax, pad=0.01, fraction=0.05)
