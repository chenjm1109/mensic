"""等值线热力图（matplotlib 实现）。

契约：只绘制 marks（填充等值线 + 白色等值线 + 色条），
标题 / 坐标范围 / 刻度由专题的 presentation 规格统一施加。
"""

import numpy as np
from matplotlib.colors import LinearSegmentedColormap


def _style(params, key, group):
    return ((params.get("elements") or {}).get(key) or {}).get(str(group)) or {}


def create_chart(ax, data, params):
    sequential = params["tokens"]["color"]["sequential"]
    cmap = LinearSegmentedColormap.from_list("sequential", sequential, N=256)

    fill_style = _style(params, "contour", "*")
    line_style = _style(params, "line", "*")
    fill_alpha = float(fill_style.get("opacity", params.get("contour_alpha", 1)))
    line_alpha = float(line_style.get("opacity", params.get("line_alpha", 1)))

    grid = data.pivot(index="y", columns="x", values="z").sort_index().sort_index(axis=1)
    x = grid.columns.to_numpy(dtype=float)
    y = grid.index.to_numpy(dtype=float)
    z = grid.to_numpy(dtype=float)
    X, Y = np.meshgrid(x, y)

    levels = int(params.get("levels", 50))
    contour = ax.contourf(X, Y, z, levels=levels, cmap=cmap, alpha=fill_alpha)

    line_levels = int(params.get("line_levels", 15))
    if line_levels > 0:
        lines = ax.contour(
            X, Y, z, levels=line_levels, colors="#ffffff", linewidths=0.8, alpha=line_alpha,
        )
        ax.clabel(lines, inline=True, fontsize=8, fmt="%.2f")

    ax.figure.colorbar(contour, ax=ax, pad=0.01, fraction=0.05)
