"""三维等值面图（Plotly 实现）。"""

import plotly.graph_objects as go


def _colorscale(colors):
    n = len(colors) - 1
    return [[i / n, c] for i, c in enumerate(colors)]


def create_chart(fig, data, params):
    surface3d = params["tokens"]["color"]["surface3d"]
    isomin = float(params.get("isomin", 10))
    isomax = float(params.get("isomax", 50))
    surface_count = int(params.get("surface_count", 5))

    fig.add_trace(
        go.Isosurface(
            x=data["x"],
            y=data["y"],
            z=data["z"],
            value=data["value"],
            isomin=isomin,
            isomax=isomax,
            colorscale=_colorscale(surface3d),
            surface_count=surface_count,
            colorbar_nticks=5,
            caps=dict(x_show=False, y_show=False),
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
