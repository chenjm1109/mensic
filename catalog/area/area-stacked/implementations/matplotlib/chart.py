"""堆叠面积图（matplotlib 实现）。

契约：只绘制图形本身（marks）；标题 / 坐标范围 / 刻度 / 图例位置由专题的
presentation 规格统一施加。颜色取自 params["tokens"]["color"]。
"""

import numpy as np


def _style(params, key, group):
    return ((params.get("elements") or {}).get(key) or {}).get(str(group)) or {}


def _categories(data):
    return list(dict.fromkeys(data["类别"].astype(str)))


def _matrix(data, cats):
    """把长表整理成 x 向量和 (系列, x) 的数值矩阵。"""
    x = np.unique(data["x"].to_numpy())
    y = np.array(
        [
            data[data["类别"].astype(str) == c].sort_values("x")["数值"].to_numpy()
            for c in cats
        ]
    )
    return x, y


def _find_peaks(values):
    """极简局部极大值检测（等价于 scipy.signal.find_peaks 的默认行为）。"""
    return [
        i
        for i in range(1, len(values) - 1)
        if values[i] > values[i - 1] and values[i] >= values[i + 1]
    ]


def create_chart(ax, data, params):
    palette = params["tokens"]["color"]["palette"]
    divider = params.get("divider", True)
    show_peaks = params.get("show_peaks", True)
    area_alpha = params.get("area_alpha", 1)

    cats = _categories(data)
    x, y = _matrix(data, cats)
    colors = []
    alphas = []
    for i, cat in enumerate(cats):
        style = _style(params, "area", cat)
        colors.append(style.get("color") or palette[i % len(palette)])
        alphas.append(float(style.get("opacity", area_alpha)))

    # 堆叠面积：系列按出现顺序自下而上累积
    polys = ax.stackplot(x, y, colors=colors, labels=cats, zorder=10, alpha=1)
    for poly, a in zip(polys, alphas):
        poly.set_alpha(a)

    # 白色分割线
    y_stack = np.cumsum(y, axis=0)
    if divider:
        for i in range(len(y)):
            ax.plot(x, y_stack[i], color="#ffffff", zorder=20, linewidth=1)

    # 顶层包络的峰值标注
    if show_peaks:
        top = y_stack[-1]
        idx = _find_peaks(top)
        ax.plot(
            x[idx],
            top[idx],
            color=colors[-1],
            zorder=20,
            linewidth=1,
            linestyle=":",
            marker="o",
            markerfacecolor="#ffffff",
        )
        for i in idx:
            ax.text(
                x[i],
                top[i] + 0.2,
                f"{top[i]:.2f}",
                ha="center",
                va="bottom",
                color=colors[-1],
                zorder=30,
                fontweight="bold",
            )
