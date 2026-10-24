"""堆叠柱状图（Plotly 实现）。"""

import plotly.graph_objects as go


def create_chart(fig, data, params):
    palette = params["tokens"]["color"]["palette"]

    groups = list(dict.fromkeys(data["组别"].astype(str)))
    for i, group in enumerate(groups):
        sub = data[data["组别"].astype(str) == group]
        fig.add_trace(
            go.Bar(
                x=sub["类别"].astype(str).tolist(),
                y=sub["数值"].tolist(),
                name=group,
                marker_color=palette[i % len(palette)],
            )
        )

    fig.update_layout(barmode="stack", bargap=0.25)
    return fig
