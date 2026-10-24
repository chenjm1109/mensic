"""分组气泡图（Plotly 实现）。

颜色编码类型、大小编码数值；地毯线用短线段绘制，尺寸图例用占位 trace。
"""

import numpy as np
import plotly.graph_objects as go


def _rug(coords, axis, length, color, alpha):
    xs, ys = [], []
    for c in coords:
        if axis == "x":
            xs += [c, c, None]
            ys += [0.0, length, None]
        else:
            xs += [0.0, length, None]
            ys += [c, c, None]
    return go.Scatter(
        x=xs,
        y=ys,
        mode="lines",
        line=dict(color=color, width=2),
        opacity=alpha,
        showlegend=False,
        hoverinfo="skip",
    )


def create_chart(fig, data, params):
    palette = params["tokens"]["color"]["palette"]
    alpha = params.get("point_alpha", 0.5)
    size_scale = params.get("size_scale", 1.0)

    x = data["X"].to_numpy(dtype=float)
    y = data["Y"].to_numpy(dtype=float)
    s = data["大小"].to_numpy(dtype=float) * size_scale
    groups = data["类型"].astype(str).to_numpy()
    categories = list(dict.fromkeys(groups))

    y_len = 0.03 * (y.max() - y.min())
    x_len = 0.02 * (x.max() - x.min())
    for i, cat in enumerate(categories):
        mask = groups == cat
        fig.add_trace(
            go.Scatter(
                x=x[mask],
                y=y[mask],
                mode="markers",
                name=cat,
                customdata=s[mask],
                marker=dict(size=np.sqrt(s[mask]), color=palette[i], opacity=alpha),
                hovertemplate="X=%{x:.1f}<br>Y=%{y:.1f}<br>大小=%{customdata:.0f}<extra></extra>",
            )
        )
        fig.add_trace(_rug(x[mask], "x", y_len, palette[i], alpha))
        fig.add_trace(_rug(y[mask], "y", x_len, palette[i], alpha))

    # 尺寸图例占位（中性色）
    for label, size in [("数值小", 10), ("数值大", 16)]:
        fig.add_trace(
            go.Scatter(
                x=[None],
                y=[None],
                mode="markers",
                name=label,
                showlegend=True,
                hoverinfo="skip",
                marker=dict(size=size, color="#dddddd"),
            )
        )
    return fig
