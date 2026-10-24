"""瀑布图（Plotly 实现）。

用 go.Bar 的 base 参数表示每步的累计起点，形成浮动柱。
"""

import numpy as np
import plotly.graph_objects as go


def create_chart(fig, data, params):
    palette = params["tokens"]["color"]["palette"]
    show_labels = params.get("show_labels", True)

    values = data["数值"].astype(float).to_numpy()
    bottoms = np.concatenate([[0.0], np.cumsum(values)[:-1]])
    colors = [palette[1] if v >= 0 else palette[0] for v in values]
    text = [f"{abs(v):g}" for v in values] if show_labels else None

    fig.add_trace(
        go.Bar(
            x=data["步骤"].astype(str).tolist(),
            y=values.tolist(),
            base=bottoms.tolist(),
            marker_color=colors,
            text=text,
            textposition="inside",
            insidetextfont=dict(color="white"),
            showlegend=False,
        )
    )
    return fig
