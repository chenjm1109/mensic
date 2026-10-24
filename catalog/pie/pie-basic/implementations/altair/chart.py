"""基本饼图（Altair 实现）。

用 theta + color 编码，mark_arc 绘制扇形；叠加文本层显示百分比。
Altair 的扇形从 12 点方向顺时针铺开，不暴露起始角。
"""

import altair as alt


def create_chart(data, params):
    palette = params["tokens"]["color"]["palette"]
    show_labels = params.get("show_labels", True)

    df = data.copy()
    df["类别"] = df["类别"].astype(str)
    df["数值"] = df["数值"].astype(float)
    total = float(df["数值"].sum())
    df["占比"] = df["数值"] / total * 100

    base = alt.Chart(df).encode(
        theta=alt.Theta("数值:Q", stack=True),
        color=alt.Color(
            "类别:N",
            scale=alt.Scale(range=palette[: len(df)]),
            legend=alt.Legend(title=None),
        ),
        order=alt.Order("数值:Q", sort="descending"),
        tooltip=["类别:N", alt.Tooltip("数值:Q"), alt.Tooltip("占比:Q", format=".1f")],
    )

    arcs = base.mark_arc(outerRadius=140)

    if not show_labels:
        return arcs

    label_base = alt.Chart(df).encode(
        theta=alt.Theta("数值:Q", stack=True),
        order=alt.Order("数值:Q", sort="descending"),
    )
    labels = label_base.mark_text(
        radius=95, size=10, color="white", fontWeight="bold"
    ).encode(text=alt.Text("占比:Q", format=".1f"))
    return arcs + labels
