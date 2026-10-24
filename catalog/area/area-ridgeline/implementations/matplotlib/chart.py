"""分层面积图（matplotlib 实现）。

每条曲线填充到自己的基线，并沿纵轴逐层抬升 offset，形成山脊式分层。
只画 marks：标题 / 坐标范围 / 刻度 / 图例位置由 presentation 施加。
"""

import numpy as np


def _style(params, key, group):
    return ((params.get("elements") or {}).get(key) or {}).get(str(group)) or {}


def _categories(data):
    return list(dict.fromkeys(data["类别"].astype(str)))


def create_chart(ax, data, params):
    palette = params["tokens"]["color"]["palette"]
    offset = params.get("offset", 0.8)
    alpha = params.get("alpha", 0.8)

    cats = _categories(data)
    x = np.unique(data["x"].to_numpy())
    y = np.array(
        [
            data[data["类别"].astype(str) == c].sort_values("x")["数值"].to_numpy()
            for c in cats
        ]
    )

    for i, cat in enumerate(cats):
        baseline = i * offset
        style = _style(params, "ridge", cat)
        color = style.get("color") or palette[i % len(palette)]
        layer_alpha = float(style.get("opacity", alpha))
        ax.fill_between(
            x,
            y[i] + baseline,
            baseline,
            color=color,
            alpha=layer_alpha,
            label=cat,
            zorder=10 - i,
        )
        ax.plot(x, y[i] + baseline, color="#ffffff", zorder=10 - i, linewidth=1)
