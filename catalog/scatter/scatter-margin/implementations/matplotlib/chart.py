"""带边际分布散点图（matplotlib 实现，projection = figure）。

projection=figure 时适配器只施加图级标题，无法触及子图，因此这里自行用
GridSpec 搭建「主散点图 + 顶部边际直方图 + 右侧边际直方图」三块布局，
并在主图上设置轴标签 / 刻度 / 图例（对齐 presentation 的意图）。

布局与配色对齐原脚本 005.py：3 组各 80 条数据，直方图半透明 + 白色描边。
"""

import numpy as np
import matplotlib.ticker as ticker


def _style(params, key, group):
    return ((params.get("elements") or {}).get(key) or {}).get(str(group)) or {}


def create_chart(fig, data, params):
    palette = params["tokens"]["color"]["palette"]
    size = float(params.get("point_size", 100))
    alpha = float(params.get("alpha", 0.5))
    bin_x = float(params.get("bin_width_x", 1))
    bin_y = float(params.get("bin_width_y", 2.5))

    xcol, ycol, gcol = "X", "Y", "组别"

    grid = fig.add_gridspec(6, 6, hspace=0.2, wspace=0.2)
    main_ax = fig.add_subplot(grid[1:6, 0:5])
    x_hist_ax = fig.add_subplot(grid[0, 0:5], sharex=main_ax)
    y_hist_ax = fig.add_subplot(grid[1:6, 5], sharey=main_ax)

    for i, group in enumerate(data[gcol].unique()):
        sub = data[data[gcol] == group]
        x = sub[xcol].astype(float).to_numpy()
        y = sub[ycol].astype(float).to_numpy()
        point_style = _style(params, "point", group)
        hist_style = _style(params, "hist", group)
        color = point_style.get("color") or palette[i % len(palette)]
        point_size = float(point_style.get("size", size))
        point_alpha = float(point_style.get("opacity", alpha))
        hist_color = hist_style.get("color") or color
        hist_alpha = float(hist_style.get("opacity", alpha))

        main_ax.scatter(x, y, s=point_size, color=color, alpha=point_alpha,
                        label=str(group), zorder=3)

        bx = np.arange(float(np.min(x)), float(np.max(x)) + bin_x, bin_x)
        x_hist_ax.hist(x, bins=bx, color=hist_color, alpha=hist_alpha,
                       edgecolor="#ffffff", linewidth=1)
        by = np.arange(float(np.min(y)), float(np.max(y)) + bin_y, bin_y)
        y_hist_ax.hist(y, bins=by, orientation="horizontal", color=hist_color,
                       alpha=hist_alpha, edgecolor="#ffffff", linewidth=1)

    # 隐藏边际直方图贴近主图一侧的刻度标签
    x_hist_ax.tick_params(axis="x", which="both", bottom=False, top=False,
                          labelbottom=False)
    y_hist_ax.tick_params(axis="y", which="both", left=False, right=False,
                          labelleft=False)

    main_ax.xaxis.set_major_locator(ticker.MultipleLocator(5))
    main_ax.xaxis.set_minor_locator(ticker.MultipleLocator(1))
    main_ax.yaxis.set_major_locator(ticker.MultipleLocator(10))
    main_ax.yaxis.set_minor_locator(ticker.MultipleLocator(2))

    main_ax.set_xlabel("X轴")
    main_ax.set_ylabel("Y轴")
    main_ax.legend(loc="upper center", ncols=3)
