"""径向热力图（matplotlib 实现，projection: polar）。

契约：只绘制 marks（一圈圈极坐标格块 + 径向/角度标注 + 色条），
标题由 presentation 统一施加。
"""

import numpy as np
from matplotlib.cm import ScalarMappable
from matplotlib.colors import LinearSegmentedColormap, Normalize


def _style(params, key, group):
    return ((params.get("elements") or {}).get(key) or {}).get(str(group)) or {}


def create_chart(ax, data, params):
    sequential = params["tokens"]["color"]["sequential"]
    cmap = LinearSegmentedColormap.from_list("sequential", sequential, N=256)

    cell_alpha = params.get("cell_alpha", 1)

    style = _style(params, "cell", "*")
    cell_alpha = float(style.get("opacity", cell_alpha))

    grid = data.pivot(index="环", columns="角度", values="数值").sort_index().sort_index(axis=1)
    values = grid.to_numpy(dtype=float)
    n_rows, n_cols = values.shape
    vmin, vmax = float(values.min()), float(values.max())

    gap_angle = float(params.get("gap_angle", 10))
    theta = np.linspace(0, 2 * np.pi * (360 - gap_angle) / 360, n_cols, endpoint=False)
    height = 2.0
    width = 2 * np.pi / n_cols * (360 - gap_angle) / 360

    for i in range(n_rows):
        radius = height * i + 10
        colors = cmap((values[i] - vmin) / (vmax - vmin))
        ax.bar(
            theta, height, bottom=radius, width=width,
            color=colors, edgecolor="white", linewidth=0.5, alpha=cell_alpha,
        )
        # 每圈的径向标签
        ax.text(
            theta[-1] + np.radians(gap_angle / 2), radius, str(i + 1),
            ha="left", va="center", fontsize=6, rotation=-10,
        )

    # 去掉半径刻度，仅保留角度网格格块
    ax.set_yticklabels([])
    ax.set_xticks(theta)
    ax.set_xticklabels([])

    last_radius = height * (n_rows - 1) + 10
    for angle, label in zip(theta, range(1, n_cols + 1)):
        rotation = np.degrees(angle)
        ha = "right" if 90 < rotation < 270 else "left"
        rot = rotation - 180 if 90 < rotation < 270 else rotation
        ax.text(
            angle, last_radius + 3, f"{label}",
            ha=ha, va="center", rotation=rot,
            rotation_mode="anchor", fontsize=8,
        )

    ax.spines["polar"].set_visible(False)
    ax.grid(False)

    sm = ScalarMappable(cmap=cmap, norm=Normalize(vmin=vmin, vmax=vmax))
    sm.set_array([])
    ax.figure.colorbar(sm, ax=ax, orientation="vertical", pad=0.2, fraction=0.1)
