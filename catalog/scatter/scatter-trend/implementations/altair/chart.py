"""带趋势线散点图（Altair 实现）。

拟合曲线用纯 numpy 计算后作为独立图层（mark_line）叠加，
指数拟合用高斯-牛顿迭代实现（不引入 scipy）。
"""

import altair as alt
import numpy as np
import pandas as pd

FIT_LABELS = {"线性数据": "线性拟合", "二次多项式数据": "2次多项式拟合", "指数数据": "指数拟合"}


def _exp_fit(x, y):
    x = np.asarray(x, dtype=float)
    y = np.asarray(y, dtype=float)
    guesses = [
        (1.0, 0.1, float(np.min(y))),
        (float(np.max(y) - np.min(y)), 0.1, float(np.min(y))),
        (1.0, 0.3, float(np.mean(y))),
        (10.0, 0.3, 0.0),
        (float(np.max(y)), 0.2, float(np.min(y))),
    ]
    best = None
    for a, b, c in guesses:
        for _ in range(300):
            e = np.exp(np.clip(b * x, -30.0, 30.0))
            residual = a * e + c - y
            jac = np.column_stack([e, a * x * e, np.ones_like(x)])
            try:
                delta, *_ = np.linalg.lstsq(jac, -residual, rcond=None)
            except np.linalg.LinAlgError:
                break
            base_sse = float(np.sum(residual**2))
            step = 1.0
            for _ in range(20):
                na, nb, nc = a + step * delta[0], b + step * delta[1], c + step * delta[2]
                ne = np.exp(np.clip(nb * x, -30.0, 30.0))
                if np.sum((na * ne + nc - y) ** 2) <= base_sse:
                    break
                step *= 0.5
            a, b, c = a + step * delta[0], b + step * delta[1], c + step * delta[2]
            if abs(step * delta[0]) + abs(step * delta[1]) + abs(step * delta[2]) < 1e-10:
                break
        sse = float(np.sum((a * np.exp(np.clip(b * x, -30.0, 30.0)) + c - y) ** 2))
        if best is None or sse < best[0]:
            best = (sse, a, b, c)
    _, a, b, c = best
    return a, b, c


def _fit_curve(x, y, group):
    xs = np.linspace(float(np.min(x)), float(np.max(x)), 100)
    if group == "二次多项式数据":
        return xs, np.polyval(np.polyfit(x, y, 2), xs)
    if group == "指数数据":
        a, b, c = _exp_fit(x, y)
        return xs, a * np.exp(b * xs) + c
    return xs, np.polyval(np.polyfit(x, y, 1), xs)


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

    # 拟合曲线：计算后拼成长表，用同一颜色字段
    curves = []
    for group in groups:
        sub = df[df["组别"].astype(str) == group]
        xs, ys = _fit_curve(sub["X轴"].to_numpy(), sub["Y轴"].to_numpy(), group)
        curves.append(pd.DataFrame({"X轴": xs, "Y轴": ys, "组别": group}))
    curve_df = pd.concat(curves, ignore_index=True)

    fit = alt.Chart(curve_df).mark_line(
        strokeDash=[6, 4], strokeWidth=3
    ).encode(x=alt.X("X轴:Q"), y=alt.Y("Y轴:Q"), color=color)

    if not show_projection:
        return points + fit

    bottom_df = df.copy()
    bottom_df["Y轴"] = -0.5
    left_df = df.copy()
    left_df["X轴"] = -0.5

    bottom = alt.Chart(bottom_df).mark_tick(
        opacity=alpha, thickness=2, size=18
    ).encode(x=alt.X("X轴:Q"), y=alt.Y("Y轴:Q"), color=color)

    left = alt.Chart(left_df).mark_tick(
        opacity=alpha, thickness=2, size=18, angle=90
    ).encode(x=alt.X("X轴:Q"), y=alt.Y("Y轴:Q"), color=color)

    return bottom + left + points + fit
