"""基本柱状图（Altair 实现）。

声明式写法：数据 → 编码 → 标记。阈值着色通过派生分类列实现。
"""

import altair as alt


def create_chart(data, params):
    palette = params["tokens"]["color"]["palette"]
    low = params.get("low", 10)
    high = params.get("high", 60)
    show_labels = params.get("show_labels", True)

    df = data.copy()
    df["数值"] = df["数值"].astype(float)
    df["分类"] = df["数值"].map(
        lambda v: "过低值" if v < low else "过高值" if v > high else "正常值"
    )

    base = alt.Chart(df).encode(
        x=alt.X("类别:N", sort=None, axis=alt.Axis(labelAngle=0)),
        y=alt.Y("数值:Q"),
    )
    bars = base.mark_bar().encode(
        color=alt.Color(
            "分类:N",
            scale=alt.Scale(
                domain=["过低值", "正常值", "过高值"],
                range=[palette[3], palette[1], palette[0]],
            ),
            legend=alt.Legend(title=None, orient="top-right", direction="horizontal"),
        ),
        tooltip=["类别:N", "数值:Q"],
    )

    chart = bars
    if show_labels:
        labels = base.mark_text(
            align="center", baseline="top", dy=4, color="white", fontWeight="bold"
        ).encode(text=alt.Text("数值:Q", format=".0f"))
        chart = bars + labels
    return chart