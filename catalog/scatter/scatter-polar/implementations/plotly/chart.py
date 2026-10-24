"""极坐标分组散点图（Plotly 实现）。

使用 `go.Scatterpolar`，角度以弧度为单位（`thetaunit="radians"`），
与 matplotlib 极坐标的起始方向 / 旋向保持一致。
"""

import plotly.graph_objects as go


def create_chart(fig, data, params):
    palette = params["tokens"]["color"]["palette"]
    point_size = params.get("point_size", 100)
    point_alpha = params.get("point_alpha", 0.5)

    categories = list(dict.fromkeys(data["类型"].astype(str)))
    for i, cat in enumerate(categories):
        sub = data[data["类型"].astype(str) == cat]
        fig.add_trace(
            go.Scatterpolar(
                r=sub["半径"].to_numpy(dtype=float),
                theta=sub["角度"].to_numpy(dtype=float),
                thetaunit="radians",
                mode="markers",
                name=cat,
                marker=dict(
                    size=float(point_size) ** 0.5,
                    color=palette[i],
                    opacity=point_alpha,
                ),
            )
        )

    fig.update_layout(
        polar=dict(
            angularaxis=dict(direction="counterclockwise", rotation=0),
            radialaxis=dict(gridcolor=params["tokens"]["color"]["grid"]),
        )
    )
    return fig
