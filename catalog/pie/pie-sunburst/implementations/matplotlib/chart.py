"""嵌套饼图（matplotlib 极坐标实现）。

内外两环：内环为「主类别」，外环为展开后的「子类别」。
所有扇段由极坐标 bar 拼出，角度宽度与数值成正比。
只画 marks；标题 / 半径范围由 presentation 施加。
"""

import numpy as np


def _style(params, key, group):
    """图形元素覆盖；没覆盖就返回空字典，走主题色板与案例参数。"""
    return ((params.get("elements") or {}).get(key) or {}).get(str(group)) or {}


def create_chart(ax, data, params):
    palette = params["tokens"]["color"]["palette"]
    size = params.get("ring_width", 0.2)
    show_labels = params.get("show_labels", True)

    df = data.copy()
    df["主类别"] = df["主类别"].astype(str)
    df["子类别"] = df["子类别"].astype(str)
    df["数值"] = df["数值"].astype(float)

    main_names = list(dict.fromkeys(df["主类别"]))
    value_list = [df.loc[df["主类别"] == name, "数值"].tolist() for name in main_names]
    sub_names = df["子类别"].tolist()
    styles = [_style(params, "wedge", name) for name in main_names]
    main_colors = [
        style.get("color") or palette[i % len(palette)]
        for i, style in enumerate(styles)
    ]
    main_alphas = [
        float(style.get("opacity", params.get("wedge_alpha", 1))) for style in styles
    ]

    sum_vals = sum(sum(sublist) for sublist in value_list)

    # 内环：主类别的起始角与角度宽度
    main_divided = [[x / sum_vals * 2 * np.pi for x in sublist] for sublist in value_list]
    main_x = [0.0]
    for i in range(len(main_divided) - 1):
        main_x.append(sum(main_divided[i]) + main_x[i])
    main_width = [sum(sublist) for sublist in main_divided]

    main_bars = ax.bar(
        x=main_x,
        width=main_width,
        bottom=size,
        height=size,
        color=main_colors,
        edgecolor="#ffffff",
        linewidth=1,
        align="edge",
        zorder=3,
    )
    for bar, alpha in zip(main_bars, main_alphas):
        bar.set_alpha(alpha)

    # 外环：展平后的子类别
    flattened = [item for sublist in value_list for item in sublist]
    sub_divided = [x / sum_vals * 2 * np.pi for x in flattened]
    sub_x = [0.0]
    for i in range(len(sub_divided) - 1):
        sub_x.append(sub_divided[i] + sub_x[i])
    sub_colors = []
    sub_alphas = []
    for i, sublist in enumerate(value_list):
        sub_colors += [main_colors[i]] * len(sublist)
        # 外环比内环淡一半；透明度覆盖按同一比例缩放（默认 1 → 仍是 0.5）
        sub_alphas += [0.5 * main_alphas[i]] * len(sublist)

    sub_bars = ax.bar(
        x=sub_x,
        width=sub_divided,
        bottom=2 * size,
        height=size * 0.5,
        color=sub_colors,
        edgecolor="#ffffff",
        linewidth=2,
        align="edge",
        zorder=3,
    )
    for bar, alpha in zip(sub_bars, sub_alphas):
        bar.set_alpha(alpha)

    text_attr = dict(color="#ffffff", fontsize=8, ha="center", va="center", fontweight="bold")

    # 内环标签
    if show_labels:
        for index, (bar, label) in enumerate(zip(main_bars, main_names)):
            angle = bar.get_x() + bar.get_width() / 2
            distance = bar.get_height() + bar.get_y()
            value_sum = sum(value_list[index])
            percentage = f"{label}\n{value_sum / sum_vals * 100:.1f}% | {value_sum:.0f}"
            text = ax.text(angle, distance - 0.1, percentage, zorder=4, **text_attr)
            text.set_bbox(
                dict(facecolor="#75879655", edgecolor="none", boxstyle="round,pad=0.5")
            )

        # 外环标签
        for index, (bar, label) in enumerate(zip(sub_bars, sub_names)):
            angle = bar.get_x() + bar.get_width() / 2
            distance = bar.get_height() + bar.get_y()
            value = flattened[index]
            percentage = f"{label}\n {value / sum_vals * 100:.1f}% | {value:.0f}"
            text = ax.text(angle, distance + 0.1, percentage, zorder=4, **text_attr)
            text.set_bbox(
                dict(facecolor="#75879677", edgecolor="none", boxstyle="round,pad=0.5")
            )

    # 去掉极坐标的刻度 / 网格 / 轴线 / 底盘
    ax.set_xticks([])
    ax.set_yticks([])
    ax.grid(False)
    ax.spines["polar"].set_visible(False)
    ax.set_facecolor("none")
