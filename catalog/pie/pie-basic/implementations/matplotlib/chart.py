"""基本饼图（matplotlib 实现）。

契约：只绘制扇形 marks 与扇区标签；标题交给 presentation。
颜色取自 params["tokens"]["color"]["palette"]。
图例置于画布左侧的空档，避免遮挡扇形（扇形本身不注册标签，故
presentation 的通用图例逻辑不会覆盖这里的定位）。
"""

import matplotlib.patches as mpatches


def _style(params, key, group):
    """图形元素覆盖；没覆盖就返回空字典，走主题色板与案例参数。"""
    return ((params.get("elements") or {}).get(key) or {}).get(str(group)) or {}


def create_chart(ax, data, params):
    palette = params["tokens"]["color"]["palette"]
    show_labels = params.get("show_labels", True)
    start_angle = params.get("start_angle", 0)

    labels = data["类别"].astype(str).tolist()
    sizes = data["数值"].astype(float).tolist()
    total = sum(sizes)

    styles = [_style(params, "wedge", label) for label in labels]
    colors = [
        style.get("color") or palette[i % len(palette)]
        for i, style in enumerate(styles)
    ]
    alphas = [
        float(style.get("opacity", params.get("wedge_alpha", 1))) for style in styles
    ]

    def fmt(pct):
        absolute = int(round(pct / 100.0 * total))
        return f"{pct:.1f}% | {absolute}"

    wedges, _texts, autotexts = ax.pie(
        sizes,
        colors=colors,
        autopct=(lambda pct: fmt(pct)) if show_labels else None,
        startangle=start_angle,
        counterclock=True,
        pctdistance=0.6,
        textprops=dict(color="#ffffff", fontweight="bold"),
        wedgeprops=dict(edgecolor="#ffffff", linewidth=1),
    )

    for wedge, alpha in zip(wedges, alphas):
        wedge.set_alpha(alpha)

    if show_labels:
        for autotext in autotexts:
            autotext.set_fontsize(8)
            autotext.set_bbox(
                dict(facecolor="#75879655", edgecolor="none", boxstyle="round,pad=0.5")
            )

    # 图例放到画布左侧空档；扇形不设 label，避免被 presentation 覆盖
    handles = [
        mpatches.Patch(facecolor=colors[i], edgecolor="#ffffff", label=label)
        for i, label in enumerate(labels)
    ]
    ax.legend(handles=handles, loc="center", bbox_to_anchor=(-0.12, 0.5), ncols=1)
    ax.set_position([0.30, 0.02, 0.68, 0.92])
    ax.set_aspect("equal")
