"""三维气泡图（Plotly 实现）。"""

import plotly.graph_objects as go


def _colorscale(colors):
    n = len(colors) - 1
    return [[i / n, c] for i, c in enumerate(colors)]


def create_chart(fig, data, params):
    surface3d = params["tokens"]["color"]["surface3d"]
    opacity = float(params.get("opacity", 0.7))
    size_scale = float(params.get("size_scale", 1.0))

    sizes = data["size"].to_numpy(dtype=float) * size_scale

    fig.add_trace(
        go.Scatter3d(
            x=data["x"],
            y=data["y"],
            z=data["z"],
            mode="markers",
            marker=dict(
                size=sizes,
                color=data["z"],
                colorscale=_colorscale(surface3d),
                opacity=opacity,
                colorbar=dict(title="Z 值"),
            ),
            name="气泡",
        )
    )

    fig.update_layout(
        scene=dict(
            xaxis_title="X",
            yaxis_title="Y",
            zaxis_title="Z",
            aspectratio=dict(x=0.7, y=1, z=0.5),
        ),
        margin=dict(l=0, r=0, b=0, t=40),
    )
    return fig
