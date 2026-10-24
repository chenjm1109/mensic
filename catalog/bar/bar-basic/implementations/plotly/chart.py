"""基本柱状图（Plotly 实现）。"""

import plotly.graph_objects as go


def create_chart(fig, data, params):
    palette = params["tokens"]["color"]["palette"]
    low = params.get("low", 10)
    high = params.get("high", 60)
    show_labels = params.get("show_labels", True)

    labels = data["类别"].astype(str).tolist()
    values = data["数值"].tolist()
    colors = [
        palette[3] if v < low else palette[0] if v > high else palette[1] for v in values
    ]

    fig.add_trace(
        go.Bar(
            x=labels,
            y=values,
            marker_color=colors,
            text=values if show_labels else None,
            textposition="inside",
            insidetextfont=dict(color="white"),
            name="数值",
            showlegend=False,
        )
    )
    fig.add_hline(y=low, line=dict(color=palette[3], width=1, dash="dash"))
    fig.add_hline(y=high, line=dict(color=palette[0], width=1, dash="dash"))
    return fig