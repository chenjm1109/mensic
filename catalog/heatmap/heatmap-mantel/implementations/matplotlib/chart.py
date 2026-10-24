"""相关性网络热图（matplotlib 实现）。

契约：只绘制 marks（相关性方块、物种-特征连接线、特征标签、两组自定义图例、色条），
标题 / 坐标范围由 presentation 统一施加。

数据来自单一长表：表 in {pearson, p, r}，行/列为索引，数值为取值。
"""

import matplotlib.colors as mcolors
import matplotlib.lines as mlines
import matplotlib.patches as patches
import numpy as np
from matplotlib.cm import ScalarMappable

FEATURES = "N P K Ca Mg S Al Fe Mn Zn Mo pH".split()
SPECIES = ["spec1", "spec2", "spec3"]


def _style(params, key, group):
    return ((params.get("elements") or {}).get(key) or {}).get(str(group)) or {}


def _gradient_color(hex_colors, value):
    """在 [-1, 1] 上取渐变颜色。"""
    normalized = np.clip((value + 1) / 2, 0, 1)
    idx = int(normalized * (len(hex_colors) - 1))
    start, end = map(
        mcolors.hex2color,
        (hex_colors[idx], hex_colors[min(idx + 1, len(hex_colors) - 1)]),
    )
    interp = [
        (1 - (normalized % 1)) * s + (normalized % 1) * e for s, e in zip(start, end)
    ]
    return mcolors.to_hex(interp)


def _p_color(value, seq):
    return seq[3] if value < 0.01 else seq[1] if value < 0.05 else "#c7c7c7"


def _r_width(value):
    return 1.0 if value < 0.2 else 2.0 if value < 0.4 else 4.0


def _table(data, name):
    sub = data[data["表"] == name]
    return (
        sub.pivot(index="行", columns="列", values="数值")
        .sort_index()
        .sort_index(axis=1)
        .to_numpy(dtype=float)
    )


def create_chart(ax, data, params):
    seq = params["tokens"]["color"]["sequential"]
    divergent = params["tokens"]["color"]["diverging"]
    node_size = params.get("node_size", 4)
    cell_alpha = params.get("cell_alpha", 1)
    link_alpha = params.get("link_alpha", 1)

    cell_style = _style(params, "cell", "*")
    link_style = _style(params, "link", "*")
    cell_alpha = float(cell_style.get("opacity", cell_alpha))
    link_alpha = float(link_style.get("opacity", link_alpha))

    pearson = _table(data, "pearson")
    p_data = _table(data, "p")
    r_data = _table(data, "r")

    feature_count = len(FEATURES)

    # 物种-特征连接网络
    spec_pos_y = np.linspace(0, feature_count, len(SPECIES) + 2).tolist()
    for i, spec in enumerate(SPECIES):
        ax.text(
            spec_pos_y[i + 1] - 4.5,
            spec_pos_y[-2 - i] - 3.5,
            spec,
            va="center",
            ha="center",
        )
        for j in range(feature_count):
            ax.plot(
                [spec_pos_y[i + 1] - 4, -0.5 + j],
                [spec_pos_y[-2 - i] - 3, feature_count - j - 0.5],
                linestyle="-",
                linewidth=_r_width(r_data[i, j]),
                color=_p_color(p_data[i, j], seq),
                zorder=1 / p_data[i, j],
                marker="o",
                markersize=node_size,
                alpha=link_alpha,
            )

    # 相关性矩阵方块（右上三角）
    for i in range(feature_count):
        for j in range(i, feature_count):
            size = pearson[i, j]
            color = _gradient_color(divergent, pearson[i, j])
            ax.add_patch(
                patches.Rectangle(
                    (feature_count - i - 1, j), 1, 1,
                    linewidth=0.25, edgecolor="#999999", facecolor="#ffffff",
                )
            )
            ax.add_patch(
                patches.Rectangle(
                    (feature_count - i - 0.5 - size / 2, j + 0.5 - size / 2),
                    size, size,
                    linewidth=0.5, edgecolor="#999999", facecolor=color, alpha=cell_alpha,
                )
            )

    # 特征标签
    for i, label in enumerate(FEATURES):
        ax.text(0.5 + i, 0.5 + feature_count, label, va="center", ha="center")
        ax.text(
            feature_count + 0.5, feature_count - 0.5 - i, label,
            va="center", ha="center",
        )

    # Mantel's p 图例
    p_handles = [
        patches.Patch(color=seq[3], label="< 0.01"),
        patches.Patch(color=seq[1], label="0.01 - 0.05"),
        patches.Patch(color="lightgrey", label=">= 0.05"),
    ]
    p_legend = ax.legend(
        handles=p_handles, title="Mantel's p",
        bbox_to_anchor=(0.875, 1.0), handleheight=1.0, handlelength=1.0,
    )
    p_legend.get_frame().set_edgecolor("#ffffff")
    ax.add_artist(p_legend)

    # Mantel's r 图例
    r_handles = [
        mlines.Line2D([], [], color="#a9a9a9", linewidth=1, label="< 0.2"),
        mlines.Line2D([], [], color="#a9a9a9", linewidth=2, label="0.2 - 0.4"),
        mlines.Line2D([], [], color="#a9a9a9", linewidth=4, label=">= 0.4"),
    ]
    r_legend = ax.legend(
        handles=r_handles, title="Mantel's r", bbox_to_anchor=(0.875, 0.7)
    )
    r_legend.get_frame().set_edgecolor("#ffffff")
    ax.add_artist(r_legend)

    # Pearson's r 色条（独立轴）
    cmap = mcolors.LinearSegmentedColormap.from_list("diverging", divergent)
    norm = mcolors.Normalize(vmin=-1.0, vmax=1.0)
    cbar = ax.figure.colorbar(
        ScalarMappable(norm=norm, cmap=cmap),
        cax=ax.figure.add_axes([0.775, 0.1, 0.03, 0.2]),
    )
    cbar.ax.set_title("Pearson's r", fontdict={"fontsize": 10}, loc="center", pad=10)

    # 轴属性
    ax.set_xticklabels([])
    ax.set_yticklabels([])
    ax.xaxis.tick_top()
    ax.yaxis.tick_right()
    # 保持等比例，但不要动 presentation 固定的 x / y 范围：
    # `axis("equal")` 会把 adjustable 设成 datalim，绘制时 matplotlib 会为了保比例
    # 忽略固定范围并打印 "Ignoring fixed y limits ..." —— 这里改成调整绘图区盒子。
    ax.set_aspect("equal", adjustable="box")
