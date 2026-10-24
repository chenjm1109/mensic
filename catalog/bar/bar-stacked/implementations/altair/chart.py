"""堆叠柱状图（Altair 实现）。

mark_bar 默认即为 stack="zero"，同一 x 位置的系列自动堆叠。
"""

import altair as alt


def create_chart(data, params):
    df = data.copy()
    df["类别"] = df["类别"].astype(str)

    base = alt.Chart(df).encode(
        x=alt.X("类别:N", sort=None, axis=alt.Axis(labelAngle=0)),
        y=alt.Y("数值:Q"),
        color=alt.Color(
            "组别:N",
            legend=alt.Legend(title=None, orient="top-right", direction="horizontal"),
        ),
    )
    return base.mark_bar().encode(tooltip=["类别:N", "组别:N", "数值:Q"])
