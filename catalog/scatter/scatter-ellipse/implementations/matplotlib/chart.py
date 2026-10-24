"""带分布椭圆散点图（matplotlib 实现）。

对每个类别：画散点与坐标轴边缘投影，再用该组协方差矩阵的
特征分解绘制 n_std 倍标准差椭圆（Ellipse patch）。
只画 marks，标题 / 坐标范围 / 刻度 / 图例位置由 presentation 施加。
"""

import numpy as np
from matplotlib.colors import to_rgba
from matplotlib.patches import Ellipse


def _style(params, key, group):
    return ((params.get("elements") or {}).get(key) or {}).get(str(group)) or {}


def _ellipse_params(x, y, n_std):
    cov = np.cov(x, y)
    vals, vecs = np.linalg.eigh(cov)
    order = vals.argsort()[::-1]
    vals, vecs = vals[order], vecs[:, order]
    theta = np.degrees(np.arctan2(vecs[1, 0], vecs[0, 0]))
    width, height = 2 * n_std * np.sqrt(vals)
    return float(np.mean(x)), float(np.mean(y)), float(width), float(height), float(theta)


def create_chart(ax, data, params):
    palette = params["tokens"]["color"]["palette"]
    size = float(params.get("point_size", 100))
    alpha = float(params.get("alpha", 0.5))
    n_std = float(params.get("n_std", 2.0))
    show_projection = bool(params.get("show_projection", True))

    x_min = float(data["主成分1"].min()) - 0.3
    y_min = float(data["主成分2"].min())

    for i, category in enumerate(data["类别"].unique()):
        sub = data[data["类别"] == category]
        x = sub["主成分1"].astype(float).to_numpy()
        y = sub["主成分2"].astype(float).to_numpy()
        style = _style(params, "point", category)
        color = style.get("color") or palette[i % len(palette)]
        point_size = float(style.get("size", size))
        point_alpha = float(style.get("opacity", alpha))

        if show_projection:
            ax.scatter(x, np.full_like(x, y_min), marker="|", c=color,
                       alpha=point_alpha, s=point_size * 5, zorder=2)
            ax.scatter(np.full_like(y, x_min), y, marker="_", c=color,
                       alpha=point_alpha, s=point_size * 5, zorder=2)

        ax.scatter(x, y, label=str(category), color=color, s=point_size,
                   alpha=point_alpha, zorder=3)

    for i, category in enumerate(data["类别"].unique()):
        sub = data[data["类别"] == category]
        x = sub["主成分1"].astype(float).to_numpy()
        y = sub["主成分2"].astype(float).to_numpy()
        point_style = _style(params, "point", category)
        ellipse_style = _style(params, "ellipse", category)
        color = ellipse_style.get("color") or point_style.get("color") or palette[i % len(palette)]
        cx, cy, width, height, theta = _ellipse_params(x, y, n_std)
        ax.add_patch(
            Ellipse(
                xy=(cx, cy), width=width, height=height, angle=theta,
                edgecolor=to_rgba(color, alpha=0.75),
                facecolor=to_rgba(color, alpha=0.2),
                linewidth=2, zorder=4,
            )
        )
