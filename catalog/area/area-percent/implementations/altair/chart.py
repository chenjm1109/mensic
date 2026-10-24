"""百分比堆叠面积图（Altair 实现）。

在 pandas 中按 x 归一化为百分比，再用 mark_area + stack="zero" 堆叠。
返回单个 Chart，保证 presentation 的轴标题与范围可生效。
"""

import altair as alt
import numpy as np


def _categories(data):
    return list(dict.fromkeys(data["类别"].astype(str)))


def create_chart(data, params):
    palette = params["tokens"]["color"]["palette"]

    df = data.copy()
    df["x"] = df["x"].astype(float)
    df["数值"] = df["数值"].astype(float)
    total = df.groupby("x")["数值"].transform("sum")
    df["百分比"] = np.where(total > 0, df["数值"] / total * 100, 0.0)
    cats = _categories(df)
    colors = [palette[i % len(palette)] for i in range(len(cats))]

    return (
        alt.Chart(df)
        .mark_area(opacity=1, stroke="#ffffff", strokeWidth=1, line=True, clip=True)
        .encode(
            x=alt.X("x:Q"),
            y=alt.Y("百分比:Q", stack="zero"),
            color=alt.Color(
                "类别:N",
                scale=alt.Scale(domain=cats, range=colors),
                legend=alt.Legend(
                    title=None, orient="top", direction="horizontal", columns=4
                ),
            ),
            order=alt.Order("类别:N"),
            tooltip=[
                alt.Tooltip("x:Q", format=".1f"),
                alt.Tooltip("类别:N"),
                alt.Tooltip("百分比:Q", format=".1f"),
            ],
        )
    )
