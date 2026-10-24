"""堆叠面积图（Altair 实现）。

声明式写法：长表 → 编码 → mark_area，stack="zero" 完成累积。
白色描边充当层间分割线。返回单个 Chart，保证 presentation 的轴标题与范围可生效。
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
    cats = _categories(df)
    colors = [palette[i % len(palette)] for i in range(len(cats))]

    return (
        alt.Chart(df)
        .mark_area(opacity=1, stroke="#ffffff", strokeWidth=1, line=True, clip=True)
        .encode(
            x=alt.X("x:Q"),
            y=alt.Y("数值:Q", stack="zero"),
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
                alt.Tooltip("数值:Q", format=".2f"),
            ],
        )
    )
