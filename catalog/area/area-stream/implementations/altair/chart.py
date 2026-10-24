"""河流图（Altair 实现）。

在实现内计算 wiggle 上下边界，用 mark_area(y=下界, y2=上界) 精确复现河流布局。
返回单个 Chart，保证 presentation 的轴标题与范围可生效。
"""

import altair as alt
import numpy as np
import pandas as pd


def _wiggle_bounds(y):
    m = y.shape[0]
    first_line = (y * (m - 0.5 - np.arange(m)[:, None])).sum(axis=0) / -m
    upper = np.cumsum(y, axis=0) + first_line
    lower = np.vstack([first_line, upper[:-1]])
    return lower, upper


def create_chart(data, params):
    palette = params["tokens"]["color"]["palette"]
    divider = params.get("divider", True)

    df = data.copy()
    df["x"] = df["x"].astype(float)
    df["数值"] = df["数值"].astype(float)
    cats = list(dict.fromkeys(df["类别"].astype(str)))
    colors = [palette[i % len(palette)] for i in range(len(cats))]

    x = np.unique(df["x"].to_numpy())
    y = np.array(
        [
            df[df["类别"].astype(str) == c].sort_values("x")["数值"].to_numpy()
            for c in cats
        ]
    )
    lower, upper = _wiggle_bounds(y)

    bands = []
    for i, cat in enumerate(cats):
        for xi, lo, hi in zip(x, lower[i], upper[i]):
            bands.append((xi, cat, lo, hi))
    band_df = pd.DataFrame(bands, columns=["x", "类别", "下界", "上界"])

    mark_kwargs = {"clip": True}
    if divider:
        mark_kwargs.update({"stroke": "#ffffff", "strokeWidth": 1})

    return (
        alt.Chart(band_df)
        .mark_area(**mark_kwargs)
        .encode(
            x=alt.X("x:Q"),
            y=alt.Y("下界:Q", stack=None),
            y2="上界:Q",
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
            ],
        )
    )
