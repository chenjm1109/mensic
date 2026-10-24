"""热力柱状图（Plotly 实现）。

用连续色 + 颜色条（colorbar）编码柱高。
"""

import plotly.graph_objects as go


def create_chart(fig, data, params):
    sequential = params["tokens"]["color"]["sequential"]
    bar_width = params.get("bar_width", 0.8)

    values = data["数值"].astype(float).tolist()
    n = len(sequential)
    colorscale = [[i / (n - 1), c] for i, c in enumerate(sequential)]

    fig.add_trace(
        go.Bar(
            x=data["类别"].astype(str).tolist(),
            y=values,
            width=bar_width,
            marker=dict(
                color=values,
                colorscale=colorscale,
                showscale=True,
                colorbar=dict(title=dict(text="数值")),
            ),
        )
    )
    return fig
