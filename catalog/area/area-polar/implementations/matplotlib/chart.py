"""极坐标堆叠面积图（matplotlib 实现）。

在 polar 投影下沿半径堆叠各系列，描出白色边界，并用白色圆盘挖出中心孔洞。
只画 marks：标题 / 极径范围 / 图例位置由 presentation 施加。
"""

import numpy as np


def _style(params, key, group):
    return ((params.get("elements") or {}).get(key) or {}).get(str(group)) or {}


def _categories(data):
    return list(dict.fromkeys(data["类别"].astype(str)))


def create_chart(ax, data, params):
    palette = params["tokens"]["color"]["palette"]
    inner_radius = params.get("inner_radius", 5)
    area_alpha = params.get("area_alpha", 1)

    cats = _categories(data)
    theta = np.unique(data["x"].to_numpy())
    y = np.array(
        [
            data[data["类别"].astype(str) == c].sort_values("x")["数值"].to_numpy()
            for c in cats
        ]
    )
    colors = []
    alphas = []
    for i, cat in enumerate(cats):
        style = _style(params, "area", cat)
        colors.append(style.get("color") or palette[i % len(palette)])
        alphas.append(float(style.get("opacity", area_alpha)))

    polys = ax.stackplot(theta, y, colors=colors, labels=cats, zorder=10)
    for poly, a in zip(polys, alphas):
        poly.set_alpha(a)

    # 各层边界描白
    for poly in polys:
        verts = poly.get_paths()[0].vertices
        ax.plot(verts[:, 0], verts[:, 1], color="#ffffff", zorder=20, linewidth=1)

    # 中心白色圆盘（挖孔）
    theta_circle = np.linspace(0, 2 * np.pi, 100)
    ax.fill(
        theta_circle,
        np.full(100, inner_radius - 0.2),
        color="#ffffff",
        zorder=10,
    )
    ax.set_yticklabels([])
