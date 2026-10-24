"""南丁格尔玫瑰图（Plotly 实现）。

go.Barpolar：theta 为角度中心、width 为角度宽度、r 为花瓣半径，
均以弧度计。隐藏极坐标网格与轴刻度。
"""

import numpy as np
import plotly.graph_objects as go


def create_chart(fig, data, params):
    palette = params["tokens"]["color"]["palette"]
    inner = params.get("inner_radius", 10)
    show_labels = params.get("show_labels", True)

    labels = data["类别"].astype(str).tolist()
    values = data["数值"].astype(float).to_numpy()
    total = values.sum()

    widths = 2 * np.pi * values / total
    centers = []
    start = 0.0
    for width in widths:
        centers.append(start + width / 2)
        start += width

    colors = [palette[i % len(palette)] for i in range(len(values))]
    customdata = np.column_stack([values, values / total * 100])

    fig.add_trace(
        go.Barpolar(
            theta=centers,
            r=values,
            width=widths,
            base=inner,
            thetaunit="radians",
            marker=dict(
                color=colors,
                line=dict(color="#ffffff", width=2),
            ),
            customdata=customdata,
            hovertemplate="%{customdata[0]:.0f}<br>%{customdata[1]:.1f}%<extra></extra>",
            showlegend=False,
        )
    )

    # 玫瑰图不需要极坐标网格 / 轴刻度，底盘透明
    fig.update_layout(
        polar=dict(
            bgcolor="rgba(0,0,0,0)",
            radialaxis=dict(visible=False, range=[0, float(values.max()) + inner + 5]),
            angularaxis=dict(visible=False),
        ),
        margin=dict(l=40, r=40, t=60, b=40),
    )
    return fig
