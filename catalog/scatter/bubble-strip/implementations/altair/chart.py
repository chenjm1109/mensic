"""单轴分组气泡图（Altair 实现）。

y 轴为有序分类轴（分组），颜色与大小分别编码分组与数值，自动生成两个图例。
"""

import altair as alt


def create_chart(data, params):
    palette = params["tokens"]["color"]["palette"]
    alpha = params.get("point_alpha", 0.5)
    size_scale = params.get("size_scale", 1.0)

    df = data.copy()
    df["大小"] = df["大小"].astype(float) * size_scale
    groups = list(dict.fromkeys(df["分组"].astype(str)))

    base = alt.Chart(df)
    return base.mark_circle(opacity=alpha).encode(
        x=alt.X("X:Q"),
        y=alt.Y("分组:N", sort=groups),
        size=alt.Size(
            "大小:Q",
            scale=alt.Scale(range=[40, 400]),
            legend=alt.Legend(title="数值", orient="top"),
        ),
        color=alt.Color(
            "分组:N",
            scale=alt.Scale(range=palette[: len(groups)]),
            legend=alt.Legend(title="分组", orient="top"),
        ),
        tooltip=["分组:N", "X:Q", "大小:Q"],
    )
