"""分组折线图（Plotly 实现）。"""

import plotly.graph_objects as go


def create_chart(fig, data, params):
    palette = params["tokens"]["color"]["palette"]
    line_width = params.get("line_width", 3)
    marker_size = params.get("marker_size", 5)

    x = data["年份"].astype(float)
    series = list(data.columns[1:])
    y_max = float(data[series].to_numpy().max()) * 1.1

    # 全球化时期高亮
    fig.add_vrect(
        x0=2000,
        x1=2014,
        fillcolor=palette[4],
        opacity=0.2,
        line_width=0,
        layer="below",
    )
    for edge in (2000, 2014):
        fig.add_vline(x=edge, line=dict(color=palette[4], width=1, dash="dash"))
    for tx, ax_anchor, label, y_frac in [
        (2000 - 0.5, "right", "2000年", 0.72),
        (2014 + 0.5, "left", "2014年", 0.72),
        (2007, "center", "全球化时期", 0.5),
    ]:
        fig.add_annotation(
            x=tx,
            y=y_max * y_frac,
            text=label,
            showarrow=False,
            xanchor=ax_anchor,
            yanchor="bottom",
            font=dict(color=palette[4], size=11),
        )

    # 多序列折线
    for i, name in enumerate(series):
        fig.add_trace(
            go.Scatter(
                x=x,
                y=data[name].astype(float),
                mode="lines+markers",
                name=name,
                line=dict(color=palette[i % len(palette)], width=line_width),
                marker=dict(
                    size=marker_size,
                    color="white",
                    line=dict(color=palette[i % len(palette)], width=1.2),
                ),
                hovertemplate=f"{name}<br>%{{x:.0f}} 年<br>%{{y:.1f}} 亿<extra></extra>",
            )
        )

    # 历史高位标注（喀麦隆，1993）
    idx = int(x.tolist().index(1993))
    cameroon = float(data[series[3]].iloc[idx])
    fig.add_trace(
        go.Scatter(
            x=[1993],
            y=[cameroon],
            mode="markers",
            marker=dict(size=marker_size * 2, color=palette[3]),
            showlegend=False,
            hoverinfo="skip",
        )
    )
    fig.add_annotation(
        x=1993,
        y=cameroon * 1.05,
        text="历史高位",
        showarrow=False,
        xanchor="center",
        yanchor="bottom",
        font=dict(color=palette[3], size=11),
    )
    return fig
