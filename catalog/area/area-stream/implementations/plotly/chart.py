"""河流图（Plotly 实现）。

Plotly 无内置 wiggle 基线，这里用 matplotlib 同款公式在实现内计算上下边界，
再用 fill="tonexty" 逐层填充，白色边界线单独叠加。
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


def _wiggle_bounds(y):
    """与 matplotlib stackplot(baseline="wiggle") 一致的基线计算。"""
    m = y.shape[0]
    first_line = (y * (m - 0.5 - np.arange(m)[:, None])).sum(axis=0) / -m
    upper = np.cumsum(y, axis=0) + first_line
    lower = np.vstack([first_line, upper[:-1]])
    return lower, upper


def create_chart(fig, data, params):
    palette = params["tokens"]["color"]["palette"]
    divider = params.get("divider", True)

    cats = _categories(data)
    x, y = _matrix(data, cats)
    colors = [palette[i % len(palette)] for i in range(len(cats))]
    lower, upper = _wiggle_bounds(y)

    # 基线（无图例）
    fig.add_trace(
        go.Scatter(
            x=x,
            y=lower[0],
            mode="lines",
            line=dict(color="#ffffff", width=1 if divider else 0),
            showlegend=False,
            hoverinfo="skip",
        )
    )

    for i, cat in enumerate(cats):
        fig.add_trace(
            go.Scatter(
                x=x,
                y=upper[i],
                name=cat,
                mode="lines",
                fill="tonexty",
                fillcolor=colors[i],
                line=dict(color=colors[i], width=0.5),
                hovertemplate=f"{cat}<br>x=%{{x:.1f}}<extra></extra>",
            )
        )
        # 白色边界线（画在填充之上，且作为下一条带的上界）
        if divider:
            fig.add_trace(
                go.Scatter(
                    x=x,
                    y=upper[i],
                    mode="lines",
                    line=dict(color="#ffffff", width=1),
                    showlegend=False,
                    hoverinfo="skip",
                )
            )
    return fig
