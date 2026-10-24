"""基本散点图（matplotlib 实现）。

契约：只绘制图形本身（marks），标题 / 坐标范围 / 刻度 / 图例位置
由专题的 presentation 规格统一施加。

外观（大小 / 透明度 / 颜色）走「图形元素」覆盖：
`params["elements"]["point"][分组key]` —— 不分组时 key 是 `"*"`（见 core/types.ts）。
没覆盖就回落到案例参数（point_size / alpha）与主题色板，所以老项目、网站渲染都不受影响。
"""

import numpy as np

# 单组图表的元素 key（与前端 SINGLE_GROUP 一致）
SINGLE = "*"
# 地毯线往可视区里缩多少（占范围的比例）：避免压在轴线上被裁掉半截
RUG_INSET = 0.005


def _style(params):
    by_group = (params.get("elements") or {}).get("point") or {}
    return by_group.get(SINGLE) or {}


def hug_rugs(ax, x_marks, y_marks):
    """让地毯线贴着**当前可视区**的下边 / 左边（视野一变就重贴）。

    x_marks / y_marks 是 `[(collection, 数值数组), …]` —— 分组图里每个分组一条。

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
    style = _style(params)
    size = float(style.get("size", params.get("point_size", 100)))
    alpha = float(style.get("opacity", params.get("alpha", 0.5)))
    show_projection = bool(params.get("show_projection", True))

    x = data["X轴"].astype(float).to_numpy()
    y = data["Y轴"].astype(float).to_numpy()
    color = style.get("color") or palette[0]

    if show_projection:
        # 初值按数据范围放（落在数据区内，不会反过来影响 matplotlib 的自动缩放），
        # 随后由 hug_rugs 挂上回调，跟着**可视区**走。
        s = size * 3
        rug_y = float(np.min(y)) + (float(np.max(y)) - float(np.min(y))) * RUG_INSET
        rug_x = float(np.min(x)) + (float(np.max(x)) - float(np.min(x))) * RUG_INSET
        coll_x = ax.scatter(x, np.full_like(x, rug_y), marker="|", color=color, alpha=alpha, s=s, zorder=2)
        coll_y = ax.scatter(np.full_like(y, rug_x), y, marker="_", color=color, alpha=alpha, s=s, zorder=2)
        hug_rugs(ax, [(coll_x, x)], [(coll_y, y)])

    ax.scatter(x, y, s=size, color=color, alpha=alpha, zorder=3)
