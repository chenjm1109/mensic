"""基本气泡图（Plotly 实现）。

气泡大小用 `marker.size` 编码；尺寸图例通过两个空点占位 trace 表达。
两轴地毯线用短线段绘制（Plotly 的 marker symbol 不提供稳定的竖/横线符号）。
"""

import numpy as np
import plotly.graph_objects as go


def _rug(coords, axis, length, color, alpha):
    """把一维坐标画成沿另一轴方向的小线段。"""
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
    color = palette[0]

    x = data["X"].to_numpy(dtype=float)
    y = data["Y"].to_numpy(dtype=float)
    s = data["大小"].to_numpy(dtype=float) * size_scale

    fig.add_trace(
        go.Scatter(
            x=x,
            y=y,
            mode="markers",
            showlegend=False,
            customdata=s,
            marker=dict(size=np.sqrt(s), color=color, opacity=alpha),
            hovertemplate="X=%{x:.1f}<br>Y=%{y:.1f}<br>大小=%{customdata:.0f}<extra></extra>",
        )
    )
    fig.add_trace(_rug(x, "x", 0.03 * (y.max() - y.min()), color, alpha))
    fig.add_trace(_rug(y, "y", 0.02 * (x.max() - x.min()), color, alpha))
    # 尺寸图例占位
    for label, size in [("数值小", 10), ("数值大", 16)]:
        fig.add_trace(
            go.Scatter(
                x=[None],
                y=[None],
                mode="markers",
                name=label,
                showlegend=True,
                hoverinfo="skip",
                marker=dict(size=size, color=color),
            )
        )
    return fig
