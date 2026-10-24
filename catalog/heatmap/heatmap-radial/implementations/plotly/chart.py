"""径向热力图（Plotly 实现，Barpolar）。"""

import numpy as np
import plotly.graph_objects as go


def _colorscale(colors):
    n = len(colors)
    return [[i / (n - 1), c] for i, c in enumerate(colors)]


def create_chart(fig, data, params):
    sequential = params["tokens"]["color"]["sequential"]
    colorscale = _colorscale(sequential)

    grid = data.pivot(index="环", columns="角度", values="数值").sort_index().sort_index(axis=1)
    values = grid.to_numpy(dtype=float)
    n_rows, n_cols = values.shape
    vmin, vmax = float(values.min()), float(values.max())

    gap_angle = float(params.get("gap_angle", 10))
    theta = np.linspace(0, 360 - gap_angle, n_cols, endpoint=False)
    height = 2.0
    width = (360 - gap_angle) / n_cols

    for i in range(n_rows):
        radius = height * i + 10
        fig.add_trace(
            go.Barpolar(
                r=[height] * n_cols,
                base=[radius] * n_cols,
                theta=theta,
                width=[width] * n_cols,
                marker=dict(
                    color=values[i],
                    colorscale=colorscale,
                    cmin=vmin,
                    cmax=vmax,
                    line=dict(color="white", width=0.5),
                    showscale=(i == n_rows - 1),
                    colorbar=dict(title=None),
                ),
                showlegend=False,
                hoverinfo="skip",
            )
        )

    fig.update_layout(
        polar=dict(
            radialaxis=dict(showticklabels=False, ticks="", showline=False),
            angularaxis=dict(showticklabels=False, ticks="", showline=False),
        )
    )
    return fig
