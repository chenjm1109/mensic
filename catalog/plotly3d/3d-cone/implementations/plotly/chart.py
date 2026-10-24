"""三维向量场图（Plotly 实现）。

数据由原脚本的 data.csv 裁剪而来（每 4 行取 1，共 500 个向量），
放入 data/cone.csv。
"""

import plotly.graph_objects as go


def _colorscale(colors):
    n = len(colors) - 1
    return [[i / n, c] for i, c in enumerate(colors)]


def create_chart(fig, data, params):
    surface3d = params["tokens"]["color"]["surface3d"]
    sizeref = float(params.get("sizeref", 60))
    show_scale = bool(params.get("show_scale", True))

    fig.add_trace(
        go.Cone(
            x=data["x"],
            y=data["y"],
            z=data["z"],
            u=data["u"],
            v=data["v"],
            w=data["w"],
            colorscale=_colorscale(surface3d),
            sizemode="absolute",
            sizeref=sizeref,
            showscale=show_scale,
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
