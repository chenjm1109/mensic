"""基本气泡图（Altair 实现）。

用 `size` 通道编码气泡大小，自动生成尺寸图例；两轴地毯线用 `mark_tick`
叠加（`datum(0)` 表示固定位置，不额外占用字段）。为让分层图仍显示中文轴名，
把数据列重命名为与 `presentation` 一致的轴标题。
"""

import altair as alt


def create_chart(data, params):
    palette = params["tokens"]["color"]["palette"]
    alpha = params.get("point_alpha", 0.5)
    size_scale = params.get("size_scale", 1.0)
    color = palette[0]

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
        color=alt.value(color),
        tooltip=["X轴:Q", "Y轴:Q", "大小:Q"],
    )
    # x 轴地毯线：y 固定为 0 的竖线；y 轴地毯线：x 固定为 0 的横线
    x_rug = base.mark_tick(color=color, opacity=alpha, thickness=2, size=10).encode(
        x=alt.X("X轴:Q"),
        y=alt.datum(0),
    )
    y_rug = base.mark_tick(color=color, opacity=alpha, thickness=2, size=10).encode(
        y=alt.Y("Y轴:Q"),
        x=alt.datum(0),
    )
    return bubbles + x_rug + y_rug
