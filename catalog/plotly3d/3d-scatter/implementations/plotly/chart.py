"""三维散点图（Plotly 实现）。"""

import plotly.graph_objects as go


def _colorscale(colors):
    n = len(colors) - 1
    return [[i / n, c] for i, c in enumerate(colors)]


def create_chart(fig, data, params):
    surface3d = params["tokens"]["color"]["surface3d"]
    marker_size = float(params.get("marker_size", 4))

    fig.add_trace(
        go.Scatter3d(
            x=data["x"],
            y=data["y"],
            z=data["z"],
            mode="markers",
            marker=dict(
                size=marker_size,
                color=data["value"],
                colorscale=_colorscale(surface3d),
                colorbar=dict(title="Z"),
            ),
            name="散点",
        )
    )

    fig.update_layout(
        scene=dict(xaxis_title="X", yaxis_title="Y", zaxis_title="Z"),
        margin=dict(l=0, r=0, b=0, t=40),
    )
    return fig
