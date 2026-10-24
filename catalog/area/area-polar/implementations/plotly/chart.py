"""极坐标堆叠面积图（Plotly 实现）。

Plotly 的 Scatterpolar 无 stackgroup，这里手工累积半径，并为每层构造
上/下边界闭合多边形（fill="toself"）以形成环形堆叠带；中心用白色圆盘挖孔。
"""

import numpy as np
import plotly.graph_objects as go


def _categories(data):
    return list(dict.fromkeys(data["类别"].astype(str)))


def create_chart(fig, data, params):
    palette = params["tokens"]["color"]["palette"]
    inner_radius = params.get("inner_radius", 5)

    cats = _categories(data)
    theta = np.unique(data["x"].to_numpy())
    y = np.array(
        [
            data[data["类别"].astype(str) == c].sort_values("x")["数值"].to_numpy()
            for c in cats
        ]
    )
    colors = [palette[i % len(palette)] for i in range(len(cats))]

    upper = np.cumsum(y, axis=0)
    lower = np.vstack([np.zeros_like(y[0]), upper[:-1]])
    theta_poly = np.concatenate([theta, theta[::-1]])

    for i, cat in enumerate(cats):
        r_poly = np.concatenate([upper[i], lower[i][::-1]])
        fig.add_trace(
            go.Scatterpolar(
                r=r_poly,
                theta=theta_poly,
                thetaunit="radians",
                name=cat,
                fill="toself",
                fillcolor=colors[i],
                line=dict(color="#ffffff", width=1),
                hoverinfo="skip",
            )
        )

    # 中心白色圆盘挖孔
    theta_circle = np.linspace(0, 2 * np.pi, 120)
    fig.add_trace(
        go.Scatterpolar(
            r=np.full_like(theta_circle, inner_radius - 0.2),
            theta=theta_circle,
            thetaunit="radians",
            fill="toself",
            fillcolor="#ffffff",
            line=dict(color="#ffffff", width=0),
            showlegend=False,
            hoverinfo="skip",
        )
    )

    fig.update_layout(
        polar=dict(
            radialaxis=dict(range=[0, 11.5], showticklabels=False),
            angularaxis=dict(rotation=0, direction="counterclockwise"),
        ),
        margin=dict(l=40, r=40, t=60, b=40),
    )
    return fig
