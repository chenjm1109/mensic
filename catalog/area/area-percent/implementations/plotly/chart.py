"""百分比堆叠面积图（Plotly 实现）。

在实现内归一化为百分比后用 stackgroup="one" 堆叠，白色分割线单独叠加。
"""

import numpy as np
import plotly.graph_objects as go


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


def create_chart(fig, data, params):
    palette = params["tokens"]["color"]["palette"]
    divider = params.get("divider", True)

    cats = _categories(data)
    x, y = _matrix(data, cats)
    colors = [palette[i % len(palette)] for i in range(len(cats))]

    total = y.sum(axis=0, keepdims=True)
    percent = np.divide(y, total, out=np.zeros_like(y), where=total > 0) * 100

    for i, cat in enumerate(cats):
        fig.add_trace(
            go.Scatter(
                x=x,
                y=percent[i],
                name=cat,
                mode="lines",
                stackgroup="one",
                line=dict(width=0),
                fillcolor=colors[i],
                hovertemplate=(
                    f"{cat}<br>x=%{{x:.1f}}<br>%{{y:.1f}}%<extra></extra>"
                ),
            )
        )

    if divider:
        y_stack = np.cumsum(percent, axis=0)
        for i in range(len(percent)):
            fig.add_trace(
                go.Scatter(
                    x=x,
                    y=y_stack[i],
                    mode="lines",
                    line=dict(color="#ffffff", width=1),
                    showlegend=False,
                    hoverinfo="skip",
                )
            )
    return fig
