"""阶梯折线图（Plotly 实现）。"""

import plotly.graph_objects as go

Y_REF = 250.0


def create_chart(fig, data, params):
    palette = params["tokens"]["color"]["palette"]
    line_width = params.get("line_width", 3)
    marker_size = params.get("marker_size", 5)

    df = data[data["年份"] >= 2000].reset_index(drop=True)
    x = df["年份"].astype(float)
    series = list(df.columns[1:])
    y_max = float(df[series].to_numpy().max())

    # 2016–2020 区间高亮
    fig.add_vrect(x0=2016, x1=2020, fillcolor=palette[1], opacity=0.1, line_width=0, layer="below")
    for edge in (2016, 2020):
        fig.add_vline(x=edge, line=dict(color=palette[1], width=1, dash="dash"))
        fig.add_annotation(
            x=edge - 0.2,
            y=y_max * 0.8,
            text=f"{edge}年",
            showarrow=False,
            xanchor="right",
            yanchor="bottom",
            font=dict(color=palette[1], size=11),
        )

    # 阶梯多序列
    for i, name in enumerate(series):
        fig.add_trace(
            go.Scatter(
                x=x,
                y=df[name].astype(float),
                mode="lines+markers",
                name=name,
                line=dict(color=palette[i % len(palette)], width=line_width, shape="hv"),
                marker=dict(
                    size=marker_size,
                    color="white",
                    line=dict(color=palette[i % len(palette)], width=1.2),
                ),
                hovertemplate=f"{name}<br>%{{x:.0f}} 年<br>%{{y:.1f}} 亿<extra></extra>",
            )
        )

    # 250 亿美元参考线
    fig.add_hline(
        y=Y_REF,
        line=dict(color=palette[0], width=1, dash="dash"),
        annotation_text="250亿美元",
        annotation_position="top left",
        annotation_font=dict(color=palette[0], size=11),
    )
    return fig
