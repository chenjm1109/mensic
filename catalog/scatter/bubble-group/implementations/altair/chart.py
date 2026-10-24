"""分组气泡图（Altair 实现）。

颜色编码类型、大小编码数值，自动生成两个图例；地毯线用 `mark_tick`
叠加，并按类型着色（图例关闭，避免重复）。
"""

import altair as alt


def create_chart(data, params):
    palette = params["tokens"]["color"]["palette"]
    alpha = params.get("point_alpha", 0.5)
    size_scale = params.get("size_scale", 1.0)

    df = data.rename(columns={"X": "X轴", "Y": "Y轴"}).copy()
    df["大小"] = df["大小"].astype(float) * size_scale
    df["零"] = 0.0

    base = alt.Chart(df)
    bubbles = base.mark_circle(opacity=alpha).encode(
        x=alt.X("X轴:Q"),
        y=alt.Y("Y轴:Q"),
        size=alt.Size(
            "大小:Q",
            scale=alt.Scale(range=[80, 320]),
            legend=alt.Legend(title="数值", orient="top"),
        ),
        color=alt.Color(
            "类型:N",
            scale=alt.Scale(range=palette[:3]),
            legend=alt.Legend(title="类型", orient="top"),
        ),
        tooltip=["X轴:Q", "Y轴:Q", "大小:Q", "类型:N"],
    )
    color_no_legend = alt.Color("类型:N", scale=alt.Scale(range=palette[:3]), legend=None)
    x_rug = base.mark_tick(opacity=alpha, thickness=2, size=10).encode(
        x=alt.X("X轴:Q"),
        y=alt.datum(0),
        color=color_no_legend,
    )
    y_rug = base.mark_tick(opacity=alpha, thickness=2, size=10).encode(
        y=alt.Y("Y轴:Q"),
        x=alt.datum(0),
        color=color_no_legend,
    )
    return bubbles + x_rug + y_rug
