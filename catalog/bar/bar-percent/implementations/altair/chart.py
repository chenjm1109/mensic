"""百分比堆叠柱状图（Altair 实现）。"""

import altair as alt


def create_chart(data, params):
    df = data.copy()
    df["类别"] = df["类别"].astype(str)
    df["百分比"] = df["数值"] / df.groupby("类别")["数值"].transform("sum") * 100.0

    base = alt.Chart(df).encode(
        x=alt.X("类别:N", sort=None, axis=alt.Axis(labelAngle=0)),
        y=alt.Y("百分比:Q"),
        color=alt.Color(
            "组别:N",
            legend=alt.Legend(title=None, orient="top-right", direction="horizontal"),
        ),
    )
    return base.mark_bar().encode(tooltip=["类别:N", "组别:N", alt.Tooltip("百分比:Q", format=".1f")])
