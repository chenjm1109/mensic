"""标准折线图（Plotly 实现）。"""

import numpy as np
import plotly.graph_objects as go


def _at(x, y, year):
    """返回最接近给定年份的数据点。"""
    i = int(np.argmin(np.abs(np.asarray(x) - year)))
    return float(np.asarray(x)[i]), float(np.asarray(y)[i])


def create_chart(fig, data, params):
    palette = params["tokens"]["color"]["palette"]
    line_width = params.get("line_width", 3)
    marker_size = params.get("marker_size", 6)

    x = data["年份"].astype(float)
    y = data[data.columns[1]].astype(float)

    # 区间高亮：折线下方填充 + 两端虚线
    for lo, hi, name, color in [
        (2002, 2014, "发展期", palette[0]),
        (1987, 1995, "衰退期", palette[1]),
    ]:
        mask = (x >= lo) & (x <= hi)
        fig.add_trace(
            go.Scatter(
                x=x[mask],
                y=y[mask],
                mode="lines",
                line=dict(width=0),
                fill="tozeroy",
                fillcolor=color,
                opacity=0.3,
                name=name,
                hoverinfo="skip",
            )
        )
        for edge, edge_y in ((lo, y[mask].iloc[0]), (hi, y[mask].iloc[-1])):
            fig.add_vline(x=edge, line=dict(color=color, width=1, dash="dash"))

    # 主折线 + 节点
    fig.add_trace(
        go.Scatter(
            x=x,
            y=y,
            mode="lines+markers",
            name="阿尔及利亚",
            showlegend=False,
            line=dict(color=palette[3], width=line_width),
            marker=dict(
                size=marker_size,
                color="white",
                line=dict(color=palette[3], width=1.5),
            ),
            hovertemplate="%{x:.0f} 年<br>%{y:.1f} 亿<extra></extra>",
        )
    )

    # 关键节点：实心点 + 文字标注
    for year, ratio, xanchor, yanchor, label in [
        (1987, 1.06, "center", "bottom", "衰退开始"),
        (1995, 0.94, "center", "top", "衰退结束"),
        (2008, 1.02, "right", "bottom", None),
    ]:
        xi, yi = _at(x, y, year)
        fig.add_trace(
            go.Scatter(
                x=[xi],
                y=[yi],
                mode="markers",
                marker=dict(size=marker_size * 2, color=palette[4]),
                showlegend=False,
                hoverinfo="skip",
            )
        )
        text = f"{label}：{yi:.1f}亿" if label else f"{int(xi)}年：{yi:.1f}亿"
        fig.add_annotation(
            x=xi,
            y=yi * ratio,
            text=text,
            showarrow=False,
            xanchor=xanchor,
            yanchor=yanchor,
            font=dict(color=palette[4], size=11),
        )
    return fig
