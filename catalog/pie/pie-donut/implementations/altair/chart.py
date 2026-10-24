"""环形饼图（Altair 实现）。

mark_arc 的 innerRadius / outerRadius 控制环宽；叠加文本层显示百分比。
"""

import altair as alt


def create_chart(data, params):
    palette = params["tokens"]["color"]["palette"]
    show_labels = params.get("show_labels", True)
    hole = params.get("hole", 0.5)

    df = data.copy()
    df["类别"] = df["类别"].astype(str)
    df["数值"] = df["数值"].astype(float)
    total = float(df["数值"].sum())
    df["占比"] = df["数值"] / total * 100

    outer = 140.0
    inner = outer * hole

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

    arcs = base.mark_arc(innerRadius=inner, outerRadius=outer)

    if not show_labels:
        return arcs

    label_base = alt.Chart(df).encode(
        theta=alt.Theta("数值:Q", stack=True),
        order=alt.Order("数值:Q", sort="descending"),
    )
    labels = label_base.mark_text(
        radius=(inner + outer) / 2, size=10, color="white", fontWeight="bold"
    ).encode(text=alt.Text("占比:Q", format=".1f"))
    return arcs + labels
