"""极坐标分组散点图（matplotlib 实现）。

契约：只画 marks；标题与图例位置由 presentation 规格统一施加。
极坐标画布由适配器根据 `presentation.projection: polar` 创建。
"""

import numpy as np


def _style(params, key, group):
    return ((params.get("elements") or {}).get(key) or {}).get(str(group)) or {}


def create_chart(ax, data, params):
    palette = params["tokens"]["color"]["palette"]
    point_size = params.get("point_size", 100)
    point_alpha = params.get("point_alpha", 0.5)
    xcol, ycol, gcol = "角度", "半径", "类型"

    categories = list(dict.fromkeys(data[gcol].astype(str)))
    for i, cat in enumerate(categories):
        sub = data[data[gcol].astype(str) == cat]
        style = _style(params, "point", cat)
        color = style.get("color") or palette[i % len(palette)]
        size = float(style.get("size", point_size))
        alpha = float(style.get("opacity", point_alpha))
        ax.scatter(
            sub[xcol].to_numpy(dtype=float),
            sub[ycol].to_numpy(dtype=float),
            s=size,
            c=color,
            alpha=alpha,
            label=cat,
            zorder=3,
        )
