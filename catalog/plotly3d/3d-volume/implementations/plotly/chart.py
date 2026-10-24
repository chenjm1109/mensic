"""三维体积图（Plotly 实现）。

数据在生成阶段用固定 seed（0）随机撒点 + scipy 高斯滤波得到，
已落盘为确定性 CSV，实现侧只依赖 numpy/pandas/plotly。
"""

import plotly.graph_objects as go


def _colorscale(colors):
    n = len(colors) - 1
    return [[i / n, c] for i, c in enumerate(colors)]


def create_chart(fig, data, params):
    surface3d = params["tokens"]["color"]["surface3d"]
    isomin = float(params.get("isomin", 0.2))
    isomax = float(params.get("isomax", 0.7))
    opacity = float(params.get("opacity", 0.1))
    surface_count = int(params.get("surface_count", 25))

    fig.add_trace(
        go.Volume(
            x=data["x"],
            y=data["y"],
            z=data["z"],
            value=data["value"],
            isomin=isomin,
            isomax=isomax,
            opacity=opacity,
            surface_count=surface_count,
            colorscale=_colorscale(surface3d),
            showscale=True,
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
