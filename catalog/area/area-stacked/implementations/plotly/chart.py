"""堆叠面积图（Plotly 实现）。

使用 stackgroup="one" 完成累积堆叠，白色分割线与峰值标注以独立 trace 叠加。
仅绘制 marks，标题 / 坐标范围 / 图例位置交给 presentation。
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


def _find_peaks(values):
    return [
        i
        for i in range(1, len(values) - 1)
        if values[i] > values[i - 1] and values[i] >= values[i + 1]
    ]


def create_chart(fig, data, params):
    palette = params["tokens"]["color"]["palette"]
    divider = params.get("divider", True)
    show_peaks = params.get("show_peaks", True)

    cats = _categories(data)
    x, y = _matrix(data, cats)
    colors = [palette[i % len(palette)] for i in range(len(cats))]

    for i, cat in enumerate(cats):
        fig.add_trace(
            go.Scatter(
                x=x,
                y=y[i],
                name=cat,
                mode="lines",
                stackgroup="one",
                line=dict(width=0),
                fillcolor=colors[i],
                hovertemplate=(
                    f"{cat}<br>x=%{{x:.1f}}<br>y=%{{y:.2f}}<extra></extra>"
                ),
            )
        )

    y_stack = np.cumsum(y, axis=0)
    if divider:
        for i in range(len(y)):
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

    if show_peaks:
        top = y_stack[-1]
        idx = _find_peaks(top)
        fig.add_trace(
            go.Scatter(
                x=x[idx],
                y=top[idx],
                mode="lines+markers+text",
                text=[f"{top[i]:.2f}" for i in idx],
                textposition="top center",
                line=dict(color=colors[-1], width=1, dash="dot"),
                marker=dict(color="#ffffff", line=dict(color=colors[-1], width=1)),
                showlegend=False,
                hoverinfo="skip",
            )
        )
    return fig
