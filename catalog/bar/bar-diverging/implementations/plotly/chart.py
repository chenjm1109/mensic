"""正负柱状图（Plotly 实现）。"""

import plotly.graph_objects as go


def create_chart(fig, data, params):
    diverging = params["tokens"]["color"]["diverging"]

    values = data["数值"].astype(float).tolist()
    colors = [diverging[-1] if v >= 0 else diverging[0] for v in values]

    fig.add_trace(
        go.Bar(
            x=values,
            y=data["类别"].astype(str).tolist(),
            orientation="h",
            marker_color=colors,
            showlegend=False,
        )
    )
    return fig
