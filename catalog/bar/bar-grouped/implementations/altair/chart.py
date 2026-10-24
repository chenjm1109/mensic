"""分组柱状图（Altair 实现）。

用 xOffset 通道把同一类别的多个系列并排排布。
"""

import altair as alt


def create_chart(data, params):
    df = data.copy()
    df["类别"] = df["类别"].astype(str)

    base = alt.Chart(df).encode(
        x=alt.X("类别:N", sort=None, axis=alt.Axis(labelAngle=0)),
        xOffset=alt.XOffset("组别:N"),
        y=alt.Y("数值:Q"),
    ).properties(width=600, height=375)
    return base.mark_bar().encode(
        color=alt.Color(
            "组别:N",
            legend=alt.Legend(title=None, orient="top-right", direction="horizontal"),
        ),
        tooltip=["类别:N", "组别:N", "数值:Q"],
    )
