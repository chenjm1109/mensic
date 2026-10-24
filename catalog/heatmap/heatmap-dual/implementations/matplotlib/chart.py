"""双指标热力图（matplotlib 实现）。

契约：只绘制 marks（每格两个三角 + 数值 + 两条顶部色条），
标题 / 坐标范围由 presentation 统一施加。

数据：单一长表，列为 行 / 列 / 上方指标 / 下方指标
（由源 upper_data.csv、lower_data.csv 裁剪合并而来）。
"""

import numpy as np
from matplotlib.cm import ScalarMappable
from matplotlib.colors import LinearSegmentedColormap, Normalize
from matplotlib.patches import Polygon


def _style(params, key, group):
    return ((params.get("elements") or {}).get(key) or {}).get(str(group)) or {}


def _text_color(value, vmax, colors):
    norm_val = value / vmax
    if -0.4 <= norm_val <= 0:
        return colors[0]
    if 0 <= norm_val <= 0.4:
        return colors[-1]
    return "#ffffff"


def create_chart(ax, data, params):
    sequential = params["tokens"]["color"]["sequential"]
    diverging = params["tokens"]["color"]["diverging"]
    alpha = float(params.get("alpha", 0.75))
    show_labels = params.get("show_labels", True)

    style = _style(params, "cell", "*")
    alpha = float(style.get("opacity", alpha))

    upper_cmap = LinearSegmentedColormap.from_list("upper", sequential, N=256)
    lower_cmap = LinearSegmentedColormap.from_list("lower", diverging, N=256)
    norm = Normalize(-100, 100)

    rows = list(dict.fromkeys(data["行"]))
    cols = list(dict.fromkeys(data["列"]))
    upper = (
        data.pivot(index="行", columns="列", values="上方指标")
        .reindex(index=rows, columns=cols)
        .to_numpy(dtype=float)
    )
    lower = (
        data.pivot(index="行", columns="列", values="下方指标")
        .reindex(index=rows, columns=cols)
        .to_numpy(dtype=float)
    )
    n_rows, n_cols = upper.shape

    for i in range(n_rows):
        for j in range(n_cols):
            # 左上三角：上方指标
            ax.add_patch(
                Polygon(
                    [[j, i], [j + 1, i], [j, i + 1]],
                    facecolor=upper_cmap(norm(upper[i, j])),
                    edgecolor="#ffffff",
                    linewidth=0.5,
                    alpha=alpha,
                )
            )
            if show_labels:
                ax.text(
                    j + 0.1, i + 0.4, f"{upper[i, j]:.0f}",
                    fontsize=8,
                    color=_text_color(upper[i, j], 100, sequential),
                    fontweight="bold",
                )
            # 右下三角：下方指标
            ax.add_patch(
                Polygon(
                    [[j + 1, i], [j + 1, i + 1], [j, i + 1]],
                    facecolor=lower_cmap(norm(lower[i, j])),
                    edgecolor="#ffffff",
                    linewidth=0.5,
                    alpha=alpha,
                )
            )
            if show_labels:
                ax.text(
                    j + 0.5, i + 0.8, f"{lower[i, j]:.0f}",
                    fontsize=8,
                    color=_text_color(lower[i, j], 100, diverging),
                    fontweight="bold",
                )

    ax.set_xticks(np.arange(n_cols) + 0.5)
    ax.set_yticks(np.arange(n_rows) + 0.5)
    ax.set_xticklabels(cols, rotation=90, fontweight="bold")
    ax.set_yticklabels(rows, fontweight="bold")
    ax.invert_yaxis()
    ax.set_aspect("equal")

    # 顶部两条横向色条（置于右侧，避免与左上角标题重叠）
    fig = ax.figure
    cax_upper = fig.add_axes([0.42, 0.90, 0.25, 0.03])
    sm_upper = ScalarMappable(cmap=upper_cmap, norm=norm)
    sm_upper.set_array([])
    cbar_upper = fig.colorbar(sm_upper, cax=cax_upper, orientation="horizontal", alpha=alpha)
    cbar_upper.ax.set_title("左上方指标", fontsize=10)
    cbar_upper.ax.tick_params(labelsize=7)

    cax_lower = fig.add_axes([0.69, 0.90, 0.25, 0.03])
    sm_lower = ScalarMappable(cmap=lower_cmap, norm=norm)
    sm_lower.set_array([])
    cbar_lower = fig.colorbar(sm_lower, cax=cax_lower, orientation="horizontal", alpha=alpha)
    cbar_lower.ax.set_title("右下方指标", fontsize=10)
    cbar_lower.ax.tick_params(labelsize=7)
