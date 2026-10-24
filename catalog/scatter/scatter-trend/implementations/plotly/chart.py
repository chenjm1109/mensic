"""带趋势线散点图（Plotly 实现）。

指数拟合用纯 numpy 的高斯-牛顿迭代实现（不引入 scipy）。
"""

import numpy as np
import plotly.graph_objects as go

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


def create_chart(fig, data, params):
    palette = params["tokens"]["color"]["palette"]
    size = float(params.get("point_size", 100))
    alpha = float(params.get("alpha", 0.5))
    show_projection = bool(params.get("show_projection", True))

    for i, group in enumerate(data["组别"].unique()):
        sub = data[data["组别"] == group]
        x = sub["X轴"].astype(float).to_numpy()
        y = sub["Y轴"].astype(float).to_numpy()
        color = palette[i % len(palette)]

        if show_projection:
            fig.add_trace(
                go.Scatter(
                    x=x, y=np.full_like(x, -0.5), mode="markers",
                    marker=dict(symbol="line-ns", size=22, color=color, opacity=alpha,
                                line=dict(width=3, color=color)),
                    hoverinfo="skip", showlegend=False,
                )
            )
            fig.add_trace(
                go.Scatter(
                    x=np.full_like(y, -0.5), y=y, mode="markers",
                    marker=dict(symbol="line-ew", size=22, color=color, opacity=alpha,
                                line=dict(width=3, color=color)),
                    hoverinfo="skip", showlegend=False,
                )
            )

        fig.add_trace(
            go.Scatter(
                x=x, y=y, mode="markers",
                marker=dict(size=np.sqrt(size), color=color, opacity=alpha,
                            line=dict(width=0)),
                name=str(group),
                hovertemplate="X轴=%{x:.2f}<br>Y轴=%{y:.2f}<extra>"
                + str(group) + "</extra>",
            )
        )

        xs, ys = _fit_curve(x, y, group)
        fig.add_trace(
            go.Scatter(
                x=xs, y=ys, mode="lines",
                line=dict(color=color, width=3, dash="dash"),
                name=FIT_LABELS.get(group, "拟合"),
                hoverinfo="skip",
            )
        )
    return fig
