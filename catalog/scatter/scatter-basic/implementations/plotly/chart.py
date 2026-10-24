"""基本散点图（Plotly 实现）。"""

import numpy as np
import plotly.graph_objects as go


def create_chart(fig, data, params):
    palette = params["tokens"]["color"]["palette"]
    size = float(params.get("point_size", 100))
    alpha = float(params.get("alpha", 0.5))
    show_projection = bool(params.get("show_projection", True))

    x = data["X轴"].astype(float).to_numpy()
    y = data["Y轴"].astype(float).to_numpy()
    color = palette[0]

    if show_projection:
        fig.add_trace(
            go.Scatter(
                x=x,
                y=np.zeros_like(x),
                mode="markers",
                marker=dict(symbol="line-ns", size=22, color=color, opacity=alpha,
                            line=dict(width=3, color=color)),
                hoverinfo="skip",
                showlegend=False,
            )
        )
        fig.add_trace(
            go.Scatter(
                x=np.zeros_like(y),
                y=y,
                mode="markers",
                marker=dict(symbol="line-ew", size=22, color=color, opacity=alpha,
                            line=dict(width=3, color=color)),
                hoverinfo="skip",
                showlegend=False,
            )
        )

    fig.add_trace(
        go.Scatter(
            x=x,
            y=y,
            mode="markers",
            marker=dict(size=np.sqrt(size), color=color, opacity=alpha,
                        line=dict(width=0)),
            name="数据",
            showlegend=False,
            hovertemplate="X轴=%{x:.2f}<br>Y轴=%{y:.2f}<extra></extra>",
        )
    )
    return fig
