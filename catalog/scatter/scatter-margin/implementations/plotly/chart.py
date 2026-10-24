"""带边际分布散点图（Plotly 实现）。

用 make_subplots 搭建「顶部边际直方图 + 主散点图 + 右侧边际直方图」布局，
共享坐标轴；轴标签 / 刻度 / 图例在实现内设置（矩阵子图无法由
presentation 精确作用到单个子图上）。
"""

import numpy as np
import plotly.graph_objects as go
from plotly.subplots import make_subplots


def create_chart(fig, data, params):
    palette = params["tokens"]["color"]["palette"]
    size = float(params.get("point_size", 100))
    alpha = float(params.get("alpha", 0.5))
    bin_x = float(params.get("bin_width_x", 1))
    bin_y = float(params.get("bin_width_y", 2.5))

    sub = make_subplots(
        rows=2,
        cols=2,
        column_widths=[0.82, 0.18],
        row_heights=[0.22, 0.78],
        horizontal_spacing=0.02,
        vertical_spacing=0.02,
        shared_xaxes=True,
        shared_yaxes=True,
    )

    for i, group in enumerate(data["组别"].unique()):
        g = data[data["组别"] == group]
        x = g["X"].astype(float).to_numpy()
        y = g["Y"].astype(float).to_numpy()
        color = palette[i % len(palette)]

        sub.add_trace(
            go.Scatter(
                x=x, y=y, mode="markers",
                marker=dict(size=np.sqrt(size), color=color, opacity=alpha,
                            line=dict(width=0)),
                name=str(group),
                hovertemplate="X=%{x:.2f}<br>Y=%{y:.2f}<extra>"
                + str(group) + "</extra>",
            ),
            row=2, col=1,
        )
        sub.add_trace(
            go.Histogram(
                x=x,
                xbins=dict(start=float(np.min(x)),
                           end=float(np.max(x)) + bin_x, size=bin_x),
                marker=dict(color=color, line=dict(color="#ffffff", width=1)),
                opacity=alpha, showlegend=False, hoverinfo="skip",
            ),
            row=1, col=1,
        )
        sub.add_trace(
            go.Histogram(
                y=y, orientation="h",
                ybins=dict(start=float(np.min(y)),
                           end=float(np.max(y)) + bin_y, size=bin_y),
                marker=dict(color=color, line=dict(color="#ffffff", width=1)),
                opacity=alpha, showlegend=False, hoverinfo="skip",
            ),
            row=2, col=2,
        )

    # 边际直方图只保留分布形状，隐藏贴近主图一侧的刻度标签
    sub.update_yaxes(showticklabels=False, row=1, col=1)
    sub.update_xaxes(showticklabels=False, row=2, col=2)

    sub.update_xaxes(title_text="X轴", dtick=5, row=2, col=1)
    sub.update_yaxes(title_text="Y轴", dtick=10, row=2, col=1)
    sub.update_layout(barmode="overlay", bargap=0.05)
    return sub
