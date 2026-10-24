"""三维曲面图（Plotly 实现）。"""

import numpy as np
import plotly.graph_objects as go


def _colorscale(colors):
    n = len(colors) - 1
    return [[i / n, c] for i, c in enumerate(colors)]


def _surface_grid(data):
    """把长表 (x, y, z) 还原成规整网格。"""
    xs = np.sort(data["x"].unique())
    ys = np.sort(data["y"].unique())
    z = data.pivot(index="y", columns="x", values="z").to_numpy(dtype=float)
    return xs, ys, z


def create_chart(fig, data, params):
    surface3d = params["tokens"]["color"]["surface3d"]
    show_grid = bool(params.get("show_grid", True))
    grid_width = float(params.get("grid_width", 2))

    xs, ys, z = _surface_grid(data)
    X, Y = np.meshgrid(xs, ys)

    fig.add_trace(
        go.Surface(
            x=X,
            y=Y,
            z=z,
            colorscale=_colorscale(surface3d),
            showscale=True,
            colorbar=dict(title="Z"),
            contours=dict(
                x=dict(
                    show=show_grid,
                    color="white",
                    width=grid_width,
                    start=float(xs.min()),
                    end=float(xs.max()),
                    size=0.1,
                ),
                y=dict(
                    show=show_grid,
                    color="white",
                    width=grid_width,
                    start=float(ys.min()),
                    end=float(ys.max()),
                    size=0.1,
                ),
            ),
        )
    )

    fig.update_layout(
        scene=dict(xaxis_title="X", yaxis_title="Y", zaxis_title="Z"),
        margin=dict(l=0, r=0, b=0, t=40),
    )
    return fig
