"""基本气泡图（matplotlib 实现）。

契约：只画 marks（气泡 + 两轴地毯线 + 尺寸图例）；标题 / 坐标范围 /
刻度 / 图例位置交给 presentation。
"""

import numpy as np
from matplotlib.lines import Line2D

# 地毯线往可视区里缩多少（占范围的比例）：避免压在轴线上被裁掉半截
RUG_INSET = 0.005


def _style(params, key, group):
    return ((params.get("elements") or {}).get(key) or {}).get(str(group)) or {}


def hug_rugs(ax, x_marks, y_marks):
    """让地毯线贴着**当前可视区**的下边 / 左边（视野一变就重贴）。

    x_marks / y_marks 是 `[(collection, 数值数组), …]`。
    原因同 scatter-basic 里的同名函数：位置不能用 x=0 / y=0 两条原点线，
    也不能只按数据范围定一次（用户改「轴范围」后视野会变）。
    """
    def _hug(_ax=None):
        xa, xb = ax.get_xlim()
        ya, yb = ax.get_ylim()
        for coll, vals in x_marks:
            coll.set_offsets(np.column_stack([vals, np.full_like(vals, ya + (yb - ya) * RUG_INSET)]))
        for coll, vals in y_marks:
            coll.set_offsets(np.column_stack([np.full_like(vals, xa + (xb - xa) * RUG_INSET), vals]))

    ax.callbacks.connect("xlim_changed", _hug)
    ax.callbacks.connect("ylim_changed", _hug)


def _size_marker(color, label, size):
    return Line2D(
        [0],
        [0],
        marker="o",
        color="#ffffff",
        markersize=size,
        markerfacecolor=color,
        markeredgecolor="#ffffff",
        label=label,
    )


def create_chart(ax, data, params):
    palette = params["tokens"]["color"]["palette"]
    alpha = params.get("point_alpha", 0.5)
    size_scale = params.get("size_scale", 1.0)
    xcol, ycol, scol = "X", "Y", "大小"

    style = _style(params, "point", "*")
    color = style.get("color") or palette[0]
    alpha = float(style.get("opacity", alpha))
    size_scale = float(style.get("size", size_scale))

    x = data[xcol].to_numpy(dtype=float)
    y = data[ycol].to_numpy(dtype=float)
    s = data[scol].to_numpy(dtype=float) * size_scale

    # 气泡主体
    ax.scatter(x, y, s=s, c=color, alpha=alpha, zorder=3)

    # 两轴地毯线：展示每个变量的一维分布
    rug_y = float(y.min()) + (float(y.max()) - float(y.min())) * RUG_INSET
    rug_x = float(x.min()) + (float(x.max()) - float(x.min())) * RUG_INSET
    coll_x = ax.scatter(x, np.full_like(x, rug_y), marker="|", color=color, alpha=alpha, s=300, zorder=3)
    coll_y = ax.scatter(np.full_like(y, rug_x), y, marker="_", color=color, alpha=alpha, s=300, zorder=3)
    hug_rugs(ax, [(coll_x, x)], [(coll_y, y)])

    # 尺寸图例（数据只有一个类别，故不额外画分类图例）
    handles = [
        _size_marker(color, "数值小", 10),
        _size_marker(color, "数值大", 16),
    ]
    ax.legend(handles=handles, loc="upper center", ncols=2)
