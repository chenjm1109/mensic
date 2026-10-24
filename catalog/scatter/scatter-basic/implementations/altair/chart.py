"""基本散点图（Altair 实现）。

用 mark_point 画散点，用 mark_tick 画坐标轴边缘的投影刻度线；
所有图层共用同一组 x/y 字段，因此坐标标题、坐标范围自动对齐。
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
    color = palette[0]

    points = alt.Chart(df).mark_point(
        filled=True, size=size, color=color, opacity=alpha
    ).encode(
        x=alt.X("X轴:Q"),
        y=alt.Y("Y轴:Q"),
        tooltip=["X轴:Q", "Y轴:Q"],
    )

    if not show_projection:
        return points

    bottom_df = pd.DataFrame({"X轴": df["X轴"].to_numpy(), "Y轴": 0.0})
    left_df = pd.DataFrame({"X轴": 0.0, "Y轴": df["Y轴"].to_numpy()})

    bottom = alt.Chart(bottom_df).mark_tick(
        color=color, opacity=alpha, thickness=2, size=18
    ).encode(x=alt.X("X轴:Q"), y=alt.Y("Y轴:Q"))

    left = alt.Chart(left_df).mark_tick(
        color=color, opacity=alpha, thickness=2, size=18, angle=90
    ).encode(x=alt.X("X轴:Q"), y=alt.Y("Y轴:Q"))

    return bottom + left + points
