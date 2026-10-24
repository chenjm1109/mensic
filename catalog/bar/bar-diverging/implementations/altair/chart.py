"""正负柱状图（Altair 实现）。

派生正负方向列，用发散色两端着色。
"""

import altair as alt


def create_chart(data, params):
    diverging = params["tokens"]["color"]["diverging"]

    df = data.copy()
    df["类别"] = df["类别"].astype(str)
    df["方向"] = df["数值"].map(lambda v: "正" if v >= 0 else "负")

    base = alt.Chart(df).encode(
        x=alt.X("数值:Q"),
        y=alt.Y("类别:N", sort=None),
        color=alt.Color(
            "方向:N",
            scale=alt.Scale(domain=["负", "正"], range=[diverging[0], diverging[-1]]),
            legend=None,
        ),
    )
    return base.mark_bar().encode(tooltip=["类别:N", "数值:Q"])
