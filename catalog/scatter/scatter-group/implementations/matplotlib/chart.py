"""分组散点图（matplotlib 实现）。

按 `组别` 分组循环绘制，每组一个颜色（取自 tokens 调色板）。
只画 marks：标题 / 坐标范围 / 刻度 / 图例位置由 presentation 施加。

外观（大小 / 透明度 / 颜色）走「图形元素」覆盖：
`params["elements"]["point"][组名]`（见 core/types.ts），没覆盖就回落到案例参数与色板。
"""

import numpy as np

# 地毯线往可视区里缩多少（占范围的比例）：避免压在轴线上被裁掉半截
RUG_INSET = 0.005


def _style(params, group):
    by_group = (params.get("elements") or {}).get("point") or {}
    return by_group.get(str(group)) or {}


def hug_rugs(ax, x_marks, y_marks):
    """让地毯线贴着**当前可视区**的下边 / 左边（视野一变就重贴）。

    x_marks / y_marks 是 `[(collection, 数值数组), …]` —— 这里每个分组一条。

    为什么需要这个回调：
      · 位置不能用 `np.zeros_like(...)`（那是 x=0 / y=0 两条**坐标原点线**，不是数据区域的边）；
      · 也不能只在画的时候按数据范围定一次 —— 用户改「轴范围」之后视野会变，
        按数据放的地毯线会跑到画面外（尤其是数据不从 0 开始时）。
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


def create_chart(ax, data, params):
    palette = params["tokens"]["color"]["palette"]
    show_projection = bool(params.get("show_projection", True))

    # 地毯线的初值用**全体数据**的范围定位（不是每组各自的）：所有组落在同一条线上，
    # 且都落在数据区内部（不会反过来影响 matplotlib 的自动缩放）。
    x_all = data["X轴"].astype(float).to_numpy()
    y_all = data["Y轴"].astype(float).to_numpy()
    rug_y = float(np.min(y_all)) + (float(np.max(y_all)) - float(np.min(y_all))) * RUG_INSET
    rug_x = float(np.min(x_all)) + (float(np.max(x_all)) - float(np.min(x_all))) * RUG_INSET

    x_marks, y_marks = [], []
    for i, group in enumerate(data["组别"].unique()):
        sub = data[data["组别"] == group]
        x = sub["X轴"].astype(float).to_numpy()
        y = sub["Y轴"].astype(float).to_numpy()
        style = _style(params, group)
        size = float(style.get("size", params.get("point_size", 100)))
        alpha = float(style.get("opacity", params.get("alpha", 0.5)))
        color = style.get("color") or palette[i % len(palette)]

        if show_projection:
            s = size * 3
            coll_x = ax.scatter(x, np.full_like(x, rug_y), marker="|", color=color, alpha=alpha, s=s, zorder=2)
            coll_y = ax.scatter(np.full_like(y, rug_x), y, marker="_", color=color, alpha=alpha, s=s, zorder=2)
            x_marks.append((coll_x, x))
            y_marks.append((coll_y, y))

        ax.scatter(x, y, s=size, color=color, alpha=alpha,
                   label=str(group), zorder=3)

    hug_rugs(ax, x_marks, y_marks)
