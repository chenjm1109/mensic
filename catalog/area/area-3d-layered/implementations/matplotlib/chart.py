"""三维分层面积图（matplotlib 实现，对应源脚本 6.py）。

把每条面积曲线填充成多边形，沿 3D 的 y 轴（类别方向）逐层排列，形成山脊式层叠。
只画 marks：标题 / x、y 轴范围交给 presentation，观察角度与 z 范围在实现内设定。
"""

import numpy as np
from matplotlib.collections import PolyCollection


def _style(params, key, group):
    return ((params.get("elements") or {}).get(key) or {}).get(str(group)) or {}


def _hex_to_rgb(color):
    color = color.lstrip("#")
    return tuple(int(color[i : i + 2], 16) for i in (0, 2, 4))


def _ramp(colors, n):
    """在给定颜色序列上等距采样 n 个颜色。"""
    if n == 1:
        return [colors[0]]
    rgb = [_hex_to_rgb(c) for c in colors]
    out = []
    for i in range(n):
        t = i / (n - 1) * (len(rgb) - 1)
        lo = min(int(t), len(rgb) - 2)
        f = t - lo
        mix = tuple(rgb[lo][k] + (rgb[lo + 1][k] - rgb[lo][k]) * f for k in range(3))
        out.append("#%02x%02x%02x" % tuple(int(round(v)) for v in mix))
    return out


def _polygon_under_graph(x, values):
    return [(x[0], 0), *zip(x, values), (x[-1], 0)]


def create_chart(ax, data, params):
    surface3d = params["tokens"]["color"]["surface3d"]
    ridge_style = _style(params, "ridge", "*")
    opacity = float(ridge_style.get("opacity", params.get("opacity", 0.6)))

    layered = data[data["数据集"] == "分层"]
    cats = list(dict.fromkeys(layered["类别"].astype(str)))
    num_layers = max(2, min(12, int(params.get("num_layers", len(cats)))))
    cats = cats[:num_layers]
    x = np.unique(layered["X"].to_numpy())
    y = np.array(
        [
            layered[layered["类别"].astype(str) == c].sort_values("X")["数值"].to_numpy()
            for c in cats
        ]
    )
    colors = _ramp(surface3d, len(cats))

    verts = [_polygon_under_graph(x, y[i]) for i in range(len(cats))]
    zs = np.arange(len(cats))
    poly = PolyCollection(
        verts, facecolors=colors, alpha=opacity, edgecolor="#ffffff", linewidths=1
    )
    ax.add_collection3d(poly, zs=zs, zdir="y")

    ax.set_zlim(0, 3)
    ax.set_zlabel("数值")
    ax.view_init(elev=30, azim=-60)
    ax.set_box_aspect([3, 2, 1])
