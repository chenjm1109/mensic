"""带分布椭圆散点图（Plotly 实现）。

椭圆没有原生 patch，用特征分解得到参数后采样成闭合曲线，
以 `fill="toself"` 的半透明折线绘制。
"""

import numpy as np
import plotly.graph_objects as go


def _hex_to_rgba(color, alpha):
    c = color.lstrip("#")
    r, g, b = (int(c[i:i + 2], 16) for i in (0, 2, 4))
    return f"rgba({r},{g},{b},{alpha})"


def _ellipse_points(x, y, n_std):
    cov = np.cov(x, y)
    vals, vecs = np.linalg.eigh(cov)
    order = vals.argsort()[::-1]
    vals, vecs = vals[order], vecs[:, order]
    theta = np.arctan2(vecs[1, 0], vecs[0, 0])
    a = n_std * np.sqrt(vals[0])
    b = n_std * np.sqrt(vals[1])
    t = np.linspace(0.0, 2.0 * np.pi, 120)
    ex = a * np.cos(t)
    ey = b * np.sin(t)
    xs = float(np.mean(x)) + ex * np.cos(theta) - ey * np.sin(theta)
    ys = float(np.mean(y)) + ex * np.sin(theta) + ey * np.cos(theta)
    return xs, ys


def create_chart(fig, data, params):
    palette = params["tokens"]["color"]["palette"]
    size = float(params.get("point_size", 100))
    alpha = float(params.get("alpha", 0.5))
    n_std = float(params.get("n_std", 2.0))
    show_projection = bool(params.get("show_projection", True))

    x_min = float(data["主成分1"].min()) - 0.3
    y_min = float(data["主成分2"].min())

    for i, category in enumerate(data["类别"].unique()):
        sub = data[data["类别"] == category]
        x = sub["主成分1"].astype(float).to_numpy()
        y = sub["主成分2"].astype(float).to_numpy()
        color = palette[i % len(palette)]

        if show_projection:
            fig.add_trace(
                go.Scatter(
                    x=x, y=np.full_like(x, y_min), mode="markers",
                    marker=dict(symbol="line-ns", size=22, color=color, opacity=alpha,
                                line=dict(width=3, color=color)),
                    hoverinfo="skip", showlegend=False,
                )
            )
            fig.add_trace(
                go.Scatter(
                    x=np.full_like(y, x_min), y=y, mode="markers",
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
                name=str(category),
                hovertemplate="主成分1=%{x:.2f}<br>主成分2=%{y:.2f}<extra>"
                + str(category) + "</extra>",
            )
        )

    for i, category in enumerate(data["类别"].unique()):
        sub = data[data["类别"] == category]
        color = palette[i % len(palette)]
        xs, ys = _ellipse_points(
            sub["主成分1"].astype(float).to_numpy(),
            sub["主成分2"].astype(float).to_numpy(),
            n_std,
        )
        fig.add_trace(
            go.Scatter(
                x=xs, y=ys, mode="lines", fill="toself",
                fillcolor=_hex_to_rgba(color, 0.2),
                line=dict(color=_hex_to_rgba(color, 0.75), width=2),
                hoverinfo="skip", showlegend=False,
            )
        )
    return fig
