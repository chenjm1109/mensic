"""河流图（matplotlib 实现）。

使用 stackplot 的 baseline="wiggle" 生成主题河流布局，再描出各层边界。
只画 marks：标题 / 坐标范围 / 刻度 / 图例位置由 presentation 施加。
"""

import numpy as np


def _style(params, key, group):
    return ((params.get("elements") or {}).get(key) or {}).get(str(group)) or {}


def _categories(data):
    return list(dict.fromkeys(data["类别"].astype(str)))


def create_chart(ax, data, params):
    palette = params["tokens"]["color"]["palette"]
    divider = params.get("divider", True)
    area_alpha = params.get("area_alpha", 1)

    cats = _categories(data)
    x = np.unique(data["x"].to_numpy())
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

    polys = ax.stackplot(
        x, y, colors=colors, labels=cats, zorder=10, alpha=1, baseline="wiggle"
    )
    for poly, a in zip(polys, alphas):
        poly.set_alpha(a)

    if divider:
        for poly in polys:
            verts = poly.get_paths()[0].vertices
            ax.plot(verts[:, 0], verts[:, 1], color="#ffffff", zorder=20, linewidth=1)
