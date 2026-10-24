"""百分比堆叠面积图（matplotlib 实现）。

先把每个 x 处的数值归一化为百分比再堆叠；仅绘制 marks，
标题 / 坐标范围 / 刻度 / 图例位置由 presentation 施加。
"""

import numpy as np


def _style(params, key, group):
    return ((params.get("elements") or {}).get(key) or {}).get(str(group)) or {}


def _categories(data):
    return list(dict.fromkeys(data["类别"].astype(str)))


def _matrix(data, cats):
    x = np.unique(data["x"].to_numpy())
    y = np.array(
        [
            data[data["类别"].astype(str) == c].sort_values("x")["数值"].to_numpy()
            for c in cats
        ]
    )
    return x, y


def create_chart(ax, data, params):
    palette = params["tokens"]["color"]["palette"]
    divider = params.get("divider", True)
    area_alpha = params.get("area_alpha", 1)

    cats = _categories(data)
    x, y = _matrix(data, cats)
    colors = []
    alphas = []
    for i, cat in enumerate(cats):
        style = _style(params, "area", cat)
        colors.append(style.get("color") or palette[i % len(palette)])
        alphas.append(float(style.get("opacity", area_alpha)))

    total = y.sum(axis=0, keepdims=True)
    percent = np.divide(y, total, out=np.zeros_like(y), where=total > 0) * 100
    polys = ax.stackplot(x, percent, colors=colors, labels=cats, zorder=10, alpha=1)
    for poly, a in zip(polys, alphas):
        poly.set_alpha(a)

    if divider:
        y_stack = np.cumsum(percent, axis=0)
        for i in range(len(percent)):
            ax.plot(x, y_stack[i], color="#ffffff", zorder=20, linewidth=1)
