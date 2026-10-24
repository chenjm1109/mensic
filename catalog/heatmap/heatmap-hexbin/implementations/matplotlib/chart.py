"""六边形热力图（matplotlib 实现）。

契约：只绘制 marks（六边形分箱 + 白色描边 + 色条），
标题 / 坐标范围由 presentation 统一施加。
"""

import numpy as np
from matplotlib.colors import LinearSegmentedColormap


def _style(params, key, group):
    return ((params.get("elements") or {}).get(key) or {}).get(str(group)) or {}


def create_chart(ax, data, params):
    sequential = params["tokens"]["color"]["sequential"]
    cmap = LinearSegmentedColormap.from_list("sequential", sequential, N=256)

    gridsize = int(params.get("gridsize", 50))
    hex_alpha = params.get("hex_alpha", 1)

    style = _style(params, "hex", "*")
    hex_alpha = float(style.get("opacity", hex_alpha))

    hb = ax.hexbin(
        data["x"].to_numpy(dtype=float),
        data["y"].to_numpy(dtype=float),
        C=data["数值"].to_numpy(dtype=float),
        gridsize=gridsize,
        cmap=cmap,
        reduce_C_function=np.mean,
        edgecolors="white",
        linewidths=0.5,
        alpha=hex_alpha,
    )

    ax.figure.colorbar(hb, ax=ax, orientation="vertical", pad=0.01, fraction=0.05)
