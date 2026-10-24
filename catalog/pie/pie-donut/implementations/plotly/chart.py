"""环形饼图（Plotly 实现）。"""

import plotly.graph_objects as go


def create_chart(fig, data, params):
    palette = params["tokens"]["color"]["palette"]
    show_labels = params.get("show_labels", True)
    start_angle = params.get("start_angle", 0)
    hole = params.get("hole", 0.5)

    labels = data["类别"].astype(str).tolist()
    values = data["数值"].astype(float).tolist()
    total = sum(values)

    if show_labels:
        text = [f"{v / total * 100:.1f}% | {int(v)}" for v in values]
        textinfo = "text"
    else:
        text = None
        textinfo = "none"

    fig.add_trace(
        go.Pie(
            labels=labels,
            values=values,
            marker=dict(
                colors=palette[: len(values)],
                line=dict(color="#ffffff", width=1),
            ),
            hole=hole,
            sort=False,
            direction="counterclockwise",
            rotation=start_angle,
            text=text,
            textinfo=textinfo,
            textposition="inside",
            insidetextfont=dict(color="white", size=11),
            hoverinfo="label+value+percent",
        )
    )
    return fig
