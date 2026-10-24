"""分组散点图（Altair 实现）。

用 `组别` 做颜色编码；散点与投影刻度线分层叠加，图例只保留分组。
"""

import altair as alt
import pandas as pd


def create_chart(data, params):
    palette = params["tokens"]["color"]["palette"]
    size = float(params.get("point_size", 100))
    alpha = float(params.get("alpha", 0.5))
    show_projection = bool(params.get("show_projection", True))

    df = data.copy()
    df["X轴"] = df["X轴"].astype(float)
    df["Y轴"] = df["Y轴"].astype(float)
    groups = list(dict.fromkeys(df["组别"].astype(str)))
    scale = alt.Scale(domain=groups, range=list(palette))
    color = alt.Color(
        "组别:N",
        scale=scale,
        legend=alt.Legend(title=None, orient="top", direction="horizontal"),
    )

    points = alt.Chart(df).mark_point(
        filled=True, size=size, opacity=alpha
    ).encode(
        x=alt.X("X轴:Q"),
        y=alt.Y("Y轴:Q"),
        color=color,
        tooltip=["组别:N", "X轴:Q", "Y轴:Q"],
    )

    if not show_projection:
        return points

    bottom_df = df.copy()
    bottom_df["Y轴"] = 0.0
    left_df = df.copy()
    left_df["X轴"] = 0.0

    bottom = alt.Chart(bottom_df).mark_tick(
        opacity=alpha, thickness=2, size=18
    ).encode(x=alt.X("X轴:Q"), y=alt.Y("Y轴:Q"), color=color)

    left = alt.Chart(left_df).mark_tick(
        opacity=alpha, thickness=2, size=18, angle=90
    ).encode(x=alt.X("X轴:Q"), y=alt.Y("Y轴:Q"), color=color)

    return bottom + left + points
