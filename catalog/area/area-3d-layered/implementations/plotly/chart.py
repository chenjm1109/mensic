"""三维分层面积图（Plotly 实现，对应源脚本 07-3d/09-area/area.py）。

对二维曲面沿 x 方向切片，每片以「上边为曲面曲线、下边为基线」构造面积曲面，
沿 x 轴逐层排列；并为每片添加白色边线。颜色取自 tokens 的 surface3d 渐变。
"""

import numpy as np
import plotly.graph_objects as go


def _hex_to_rgb(color):
    color = color.lstrip("#")
    return tuple(int(color[i : i + 2], 16) for i in (0, 2, 4))


def _rgb_to_hex(rgb):
    return "#%02x%02x%02x" % tuple(int(round(c)) for c in rgb)


def _interpolate(c1, c2, t):
    r1, g1, b1 = _hex_to_rgb(c1)
    r2, g2, b2 = _hex_to_rgb(c2)
    return _rgb_to_hex((r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t))


def _ramp_color(norm, colors):
    norm = min(max(norm, 0.0), 1.0)
    n = len(colors)
    if n == 1:
        return colors[0]
    seg = 1 / (n - 1)
    i = min(int(np.floor(norm / seg)), n - 2)
    t = (norm - i * seg) / seg
    return _interpolate(colors[i], colors[i + 1], t)


def create_chart(fig, data, params):
    color_list = params["tokens"]["color"]["surface3d"]
    num_layers = int(params.get("num_layers", 6))
    opacity = params.get("opacity", 0.6)

    surf = data[data["数据集"] == "曲面"]
    xs = np.unique(surf["X"].to_numpy())
    ys = np.unique(surf["Y"].to_numpy())
    grid = surf.pivot(index="Y", columns="X", values="Z")
    z = grid.to_numpy()  # 形状 (len(ys), len(xs))

    layer_indices = np.linspace(0, len(xs) - 1, num_layers, dtype=int)
    for idx in layer_indices:
        x_val = xs[idx]
        norm = (x_val - xs.min()) / (xs.max() - xs.min())
        layer_color = _ramp_color(norm, color_list)
        z_vals = z[:, idx]

        x_patch = np.full((2, len(ys)), x_val)
        y_patch = np.tile(ys, (2, 1))
        z_patch = np.vstack([z_vals, np.zeros_like(z_vals)])

        fig.add_trace(
            go.Surface(
                x=x_patch,
                y=y_patch,
                z=z_patch,
                colorscale=[[0, layer_color], [1, layer_color]],
                cmin=0,
                cmax=1,
                showscale=False,
                opacity=opacity,
                showlegend=False,
                hoverinfo="skip",
            )
        )

        border_y = np.concatenate([ys, ys[::-1], [ys[0]]])
        border_z = np.concatenate([z_vals, np.zeros_like(z_vals[::-1]), [z_vals[0]]])
        border_x = np.full(border_y.shape, x_val)
        fig.add_trace(
            go.Scatter3d(
                x=border_x,
                y=border_y,
                z=border_z,
                mode="lines",
                line=dict(color="white", width=3),
                showlegend=False,
                hoverinfo="skip",
            )
        )

    fig.update_layout(
        scene=dict(
            xaxis=dict(title="X"),
            yaxis=dict(title="Y"),
            zaxis=dict(title="数值"),
            aspectratio=dict(x=0.7, y=1, z=0.5),
        )
    )
    return fig
