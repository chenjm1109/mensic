"""瀑布图（Altair 实现）。

把每步的累计起点 / 终点派生成 y 与 y2 两个通道，浮动的矩形即为瀑布柱。
"""

import altair as alt


def create_chart(data, params):
    palette = params["tokens"]["color"]["palette"]
    show_labels = params.get("show_labels", True)

    df = data.copy()
    df["步骤"] = df["步骤"].astype(str)
    df["数值"] = df["数值"].astype(float)
    df["起始"] = df["数值"].cumsum().shift(1).fillna(0.0)
    df["结束"] = df["起始"] + df["数值"]
    df["中点"] = (df["起始"] + df["结束"]) / 2
    df["绝对值"] = df["数值"].abs()
    df["方向"] = df["数值"].map(lambda v: "增加" if v >= 0 else "减少")

    bars = alt.Chart(df).mark_bar().encode(
        x=alt.X("步骤:N", sort=None, axis=alt.Axis(labelAngle=0)),
        y=alt.Y("起始:Q", title="数值", scale=alt.Scale(domain=[0, 3300])),
        y2=alt.Y2("结束:Q"),
        color=alt.Color(
            "方向:N",
            scale=alt.Scale(domain=["增加", "减少"], range=[palette[1], palette[0]]),
            legend=None,
        ),
        tooltip=["步骤:N", "数值:Q"],
    )
    if not show_labels:
        return bars.properties(width=600, height=375)

    labels = alt.Chart(df).mark_text(
        color="white", fontWeight="bold", fontSize=10
    ).encode(
        x=alt.X("步骤:N", sort=None),
        y=alt.Y("中点:Q"),
        text=alt.Text("绝对值:Q", format=".0f"),
    )
    return (bars + labels).properties(width=600, height=375)
