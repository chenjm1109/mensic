"""百分比堆叠柱状图（Plotly 实现）。"""

import plotly.graph_objects as go


def create_chart(fig, data, params):
    palette = params["tokens"]["color"]["palette"]

    df = data.copy()
    df["百分比"] = df["数值"] / df.groupby("类别")["数值"].transform("sum") * 100.0

    groups = list(dict.fromkeys(df["组别"].astype(str)))
    for i, group in enumerate(groups):
        sub = df[df["组别"].astype(str) == group]
        fig.add_trace(
            go.Bar(
                x=sub["类别"].astype(str).tolist(),
                y=sub["百分比"].tolist(),
                name=group,
                marker_color=palette[i % len(palette)],
                hovertemplate="%{x} · " + group + "<br>%{y:.1f}%<extra></extra>",
            )
        )

    fig.update_layout(barmode="stack", bargap=0.25)
    return fig
