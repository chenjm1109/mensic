"""双坐标折线图（matplotlib 实现）。

左轴（经济，亿美元）由 presentation 统一控制标题 / 范围 / 刻度 / 图例；
右轴（人口，万人）由 ``ax.twinx()`` 创建，presentation 无法覆盖，因此其值域、
刻度颜色与图例在实现内设置 —— 这是双坐标专题的必要例外。
"""


# 单组图表的元素 key（与前端 SINGLE_GROUP 一致）
SINGLE = "*"


def _style(params, key, group):
    return ((params.get("elements") or {}).get(key) or {}).get(str(group)) or {}


def create_chart(ax, data, params):
    palette = params["tokens"]["color"]["palette"]
    grid = params["tokens"]["color"]["grid"]
    line_width = params.get("line_width", 3)
    marker_size = params.get("marker_size", 5)
    economy_style = _style(params, "economy", SINGLE)
    population_style = _style(params, "population", SINGLE)
    economy_color = economy_style.get("color") or palette[3]
    population_color = population_style.get("color") or palette[0]
    economy_width = float(economy_style.get("size", line_width))
    population_width = float(population_style.get("size", line_width))

    year = data["年份"].to_numpy(dtype=float)
    economy = data["经济"].to_numpy(dtype=float)
    population = data["人口"].to_numpy(dtype=float)
    y_max = float(economy.max())

    ax2 = ax.twinx()

    # 内战时期高亮
    ax.fill_betweenx([0, y_max * 1.1], 1989, 2003, color=palette[4], alpha=0.2, zorder=0)
    for edge in (1989, 2003):
        ax.plot([edge, edge], [0, y_max * 1.1], color=palette[4], linestyle="--", linewidth=1, zorder=2)
    ax.text(1989 - 0.5, y_max * 0.85, "1989年", ha="right", va="bottom", color=palette[4], fontsize=9)
    ax.text(2003 + 0.5, y_max * 0.85, "2003年", ha="left", va="bottom", color=palette[4], fontsize=9)
    ax.text(1996, y_max * 0.85, "内战时期", ha="center", va="bottom", color=palette[4], fontsize=9)

    # 左轴：经济
    ax.plot(
        year,
        economy,
        color=economy_color,
        marker="o",
        markersize=marker_size,
        markerfacecolor="white",
        markeredgecolor=economy_color,
        markeredgewidth=1.2,
        linewidth=economy_width,
        label="经济（亿美元）",
        zorder=4,
    )

    # 右轴：人口
    ax2.plot(
        year,
        population,
        color=population_color,
        marker="o",
        markersize=marker_size,
        markerfacecolor="white",
        markeredgecolor=population_color,
        markeredgewidth=1.2,
        linewidth=population_width,
        label="人口（万人）",
        zorder=3,
    )

    # 内战开始节点标注（右轴）
    index = {int(v): i for i, v in enumerate(year)}
    p89 = float(population[index[1989]])
    p91 = float(population[index[1991]])
    ax2.scatter([1989], [p89], color=population_color, s=marker_size * 8, zorder=6)
    ax2.text(
        1989,
        p89 * 1.05,
        f"内战开始：{p89:.1f}万人",
        ha="right",
        va="bottom",
        color=population_color,
        fontsize=9,
        zorder=7,
    )
    ax2.text(
        1991,
        p91 * 0.95,
        f"{p91:.1f}万人",
        ha="left",
        va="top",
        color=population_color,
        fontsize=9,
        zorder=7,
    )

    # 右轴范围与配色（presentation 不覆盖 twinx）
    ax2.set_ylim(0, float(population.max()))
    ax.tick_params(axis="y", labelcolor=economy_color)
    ax2.tick_params(axis="y", labelcolor=population_color)
    ax2.spines["right"].set_color(population_color)
    ax2.spines["left"].set_color(economy_color)
    ax2.legend(loc="upper left", bbox_to_anchor=(0.0, 0.86), ncols=2, frameon=True)

    ax.grid(axis="y", linestyle="--", linewidth=0.5, color=grid, zorder=0)
