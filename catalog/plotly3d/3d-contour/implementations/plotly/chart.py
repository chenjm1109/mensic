"""三维等高线图（Plotly 原生实现）。

原脚本借 matplotlib 提取等值线、再逐条画 Scatter3d。这里改用
``go.Surface`` 的原生 ``contours.z``：设置 ``hidesurface=True`` 后只保留
位于各自高度上的等值线，并用 ``usecolormap=True`` 让线条按高度取色。
"""

import numpy as np
import plotly.graph_objects as go


def _colorscale(colors):
    n = len(colors) - 1
    return [[i / n, c] for i, c in enumerate(colors)]


def _surface_grid(data):
    xs = np.sort(data["x"].unique())
    ys = np.sort(data["y"].unique())
    z = data.pivot(index="y", columns="x", values="z").to_numpy(dtype=float)
    return xs, ys, z


def create_chart(fig, data, params):
    surface3d = params["tokens"]["color"]["surface3d"]
    num_levels = int(params.get("num_levels", 20))
    line_width = float(params.get("line_width", 4))

    xs, ys, z = _surface_grid(data)
    X, Y = np.meshgrid(xs, ys)
    zmin, zmax = float(z.min()), float(z.max())
    step = (zmax - zmin) / max(num_levels, 1)

    fig.add_trace(
        go.Surface(
            x=X,
            y=Y,
            z=z,
            colorscale=_colorscale(surface3d),
            hidesurface=True,
            showscale=False,
            contours=dict(
                z=dict(
                    show=True,
                    usecolormap=True,
                    width=line_width,
                    start=zmin,
                    end=zmax,
                    size=step,
                )
            ),
        )
    )

    fig.update_layout(
        scene=dict(xaxis_title="X", yaxis_title="Y", zaxis_title="Z"),
        margin=dict(l=0, r=0, b=0, t=40),
    )
    return fig
