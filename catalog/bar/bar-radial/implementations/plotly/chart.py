"""径向柱状图（Plotly barpolar 实现）。

柱子沿圆周均匀排布，用 base 抬升内径。
每根柱子单独成一个 trace（base 为标量），并用 legendgroup 合并图例。
"""

import plotly.graph_objects as go


def create_chart(fig, data, params):
    palette = params["tokens"]["color"]["palette"]
    base = params.get("base", 10)

    categories = data["类别"].astype(str).tolist()
    values = data["数值"].astype(float).to_numpy()
    count = len(values)
    width = 360.0 / count
    theta = [i * width for i in range(count)]

    seen = set()
    for angle, value in zip(theta, values):
        if value < 15:
            name, color = "过低值", palette[3]
        elif value > 25:
            name, color = "过高值", palette[0]
        else:
            name, color = "正常值", palette[1]

        fig.add_trace(
            go.Barpolar(
                theta=[angle],
                width=[width],
                r=[base + value],
                base=base,
                name=name,
                legendgroup=name,
                showlegend=name not in seen,
                marker_color=color,
                marker_line_color="#f1f5f9",
                marker_line_width=1,
            )
        )
        seen.add(name)

    fig.update_layout(
        barmode="overlay",
        polar=dict(
            angularaxis=dict(
                tickvals=theta,
                ticktext=categories,
                gridcolor=palette[3],
                tickfont=dict(size=9),
            ),
            radialaxis=dict(showticklabels=False, showgrid=False),
        ),
    )
    return fig
