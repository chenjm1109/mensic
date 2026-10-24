"""单轴分组气泡图（Plotly 实现）。

y 轴为分类轴（分组），每个分组一条 trace 以获得颜色与图例；
数值图例用中性色占位 trace 表达。
"""

import numpy as np
import plotly.graph_objects as go


def create_chart(fig, data, params):
    palette = params["tokens"]["color"]["palette"]
    alpha = params.get("point_alpha", 0.5)
    size_scale = params.get("size_scale", 1.0)

    groups = list(dict.fromkeys(data["分组"].astype(str)))
    for i, g in enumerate(groups):
        sub = data[data["分组"].astype(str) == g]
        values = sub["大小"].to_numpy(dtype=float) * size_scale
        fig.add_trace(
            go.Scatter(
                x=sub["X"].to_numpy(dtype=float),
                y=[g] * len(sub),
                mode="markers",
                name=g,
                customdata=values,
                marker=dict(size=np.sqrt(values), color=palette[i], opacity=alpha),
                hovertemplate="X=%{x:.1f}<br>数值=%{customdata:.0f}<extra></extra>",
            )
        )
    # 尺寸图例占位
    for label, size in [("数值=20", 8), ("数值=300", 14), ("数值=500", 22)]:
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
