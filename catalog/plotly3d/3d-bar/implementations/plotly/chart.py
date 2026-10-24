"""三维柱状图（Plotly 实现）。

用一组立方体（Mesh3d）表示高度：把所有柱体的顶点合并进一个 Mesh3d，
按柱体高度做顶点强度着色，避免上百条 trace。柱棱用一条 Scatter3d 折线绘制。
"""

import plotly.graph_objects as go


def _colorscale(colors):
    n = len(colors) - 1
    return [[i / n, c] for i, c in enumerate(colors)]


# 立方体 8 个顶点的三角面（每个面两个三角形）
_FACES = (
    (0, 1, 2), (0, 2, 3),  # 底面
    (4, 5, 6), (4, 6, 7),  # 顶面
    (0, 1, 5), (0, 5, 4),  # y-
    (3, 2, 6), (3, 6, 7),  # y+
    (0, 3, 7), (0, 7, 4),  # x-
    (1, 2, 6), (1, 6, 5),  # x+
)

# 立方体 12 条棱
_EDGES = (
    (0, 1), (1, 2), (2, 3), (3, 0),
    (4, 5), (5, 6), (6, 7), (7, 4),
    (0, 4), (1, 5), (2, 6), (3, 7),
)


def create_chart(fig, data, params):
    surface3d = params["tokens"]["color"]["surface3d"]
    bar_size = float(params.get("bar_size", 0.15))
    show_edges = bool(params.get("show_edges", True))

    xs = data["x"].to_numpy(dtype=float)
    ys = data["y"].to_numpy(dtype=float)
    hs = data["height"].to_numpy(dtype=float)

    zmin, zmax = float(hs.min()), float(hs.max())
    span = zmax - zmin
    half = bar_size / 2.0

    vx, vy, vz, intensity = [], [], [], []
    vi, vj, vk = [], [], []
    edge_x, edge_y, edge_z = [], [], []
    base = 0
    for x, y, h in zip(xs, ys, hs):
        corners = [
            (x - half, y - half, 0.0),
            (x + half, y - half, 0.0),
            (x + half, y + half, 0.0),
            (x - half, y + half, 0.0),
            (x - half, y - half, h),
            (x + half, y - half, h),
            (x + half, y + half, h),
            (x - half, y + half, h),
        ]
        value = (h - zmin) / span if span > 0 else 0.0
        for cx, cy, cz in corners:
            vx.append(cx)
            vy.append(cy)
            vz.append(cz)
            intensity.append(value)
        for a, b, c in _FACES:
            vi.append(base + a)
            vj.append(base + b)
            vk.append(base + c)
        for a, b in _EDGES:
            ca, cb = corners[a], corners[b]
            edge_x.extend([ca[0], cb[0], None])
            edge_y.extend([ca[1], cb[1], None])
            edge_z.extend([ca[2], cb[2], None])
        base += 8

    fig.add_trace(
        go.Mesh3d(
            x=vx,
            y=vy,
            z=vz,
            i=vi,
            j=vj,
            k=vk,
            intensity=intensity,
            colorscale=_colorscale(surface3d),
            cmin=0.0,
            cmax=1.0,
            flatshading=True,
            showscale=False,
            name="高度",
            hoverinfo="skip",
        )
    )

    if show_edges:
        fig.add_trace(
            go.Scatter3d(
                x=edge_x,
                y=edge_y,
                z=edge_z,
                mode="lines",
                line=dict(color="white", width=3),
                hoverinfo="skip",
                showlegend=False,
            )
        )

    fig.update_layout(
        scene=dict(
            xaxis_title="X",
            yaxis_title="Y",
            zaxis_title="Z",
            aspectratio=dict(x=0.7, y=1, z=0.5),
        ),
        margin=dict(l=0, r=0, b=0, t=40),
    )
    return fig
