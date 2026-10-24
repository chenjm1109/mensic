"""环形柱状图（Plotly barpolar 实现）。

每个环由 base（内径）与 r（外径）界定，角度跨度与数值成正比。
说明：plotly 的 barpolar 在同一 trace 内混用不同 base 时渲染不可靠，
因此每根柱子单独成一个 trace（base 为标量），并用 legendgroup 合并图例。
"""

import plotly.graph_objects as go


def create_chart(fig, data, params):
    palette = params["tokens"]["color"]["palette"]
    ring_width = params.get("ring_width", 0.8)
    inner_offset = params.get("inner_offset", 2)

    values = data["数值"].astype(float).to_numpy()
    max_value = float(values.max()) * 1.1

    seen = set()
    for i, value in enumerate(values):
        inner_radius = i + inner_offset
        theta_end = (value / max_value) * 360.0

        if value < 15:
            name, color = "过低值", palette[3]
        elif value > 25:
            name, color = "过高值", palette[0]
        else:
            name, color = "正常值", palette[1]

        fig.add_trace(
            go.Barpolar(
                theta=[theta_end / 2],
                width=[theta_end],
                r=[inner_radius + ring_width],
                base=inner_radius,
                name=name,
                legendgroup=name,
                showlegend=name not in seen,
                marker_color=color,
            )
        )
        seen.add(name)

    fig.update_layout(
        barmode="overlay",
        polar=dict(
            angularaxis=dict(direction="clockwise", rotation=90, showticklabels=False),
            radialaxis=dict(showticklabels=False),
        ),
    )
    return fig
