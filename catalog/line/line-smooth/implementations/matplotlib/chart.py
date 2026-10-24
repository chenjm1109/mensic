"""平滑折线图（matplotlib 实现）。

契约只允许 numpy / pandas / matplotlib / plotly / altair（+ 标准库），
不能依赖 scipy，因此这里用 numpy 手写 Catmull-Rom 样条做平滑插值。
"""

import numpy as np


def _catmull_rom(x, y, n=300):
    """Catmull-Rom 分段三次插值，仅依赖 numpy。"""
    x = np.asarray(x, dtype=float)
    y = np.asarray(y, dtype=float)
    xs = np.linspace(x.min(), x.max(), n)

    # 两端各复制一个端点，构造 p0 / p3
    yp = np.concatenate(([y[0]], y, [y[-1]]))

    seg = np.clip(np.searchsorted(x, xs, side="right") - 1, 0, len(x) - 2)
    dx = x[seg + 1] - x[seg]
    t = (xs - x[seg]) / np.where(dx == 0, 1.0, dx)

    p0, p1, p2, p3 = yp[seg], yp[seg + 1], yp[seg + 2], yp[seg + 3]
    ys = 0.5 * (
        2 * p1
        + (-p0 + p2) * t
        + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t**2
        + (-p0 + 3 * p1 - 3 * p2 + p3) * t**3
    )
    return xs, ys


def _style(params, key, group):
    return ((params.get("elements") or {}).get(key) or {}).get(str(group)) or {}


def create_chart(ax, data, params):
    palette = params["tokens"]["color"]["palette"]
    grid = params["tokens"]["color"]["grid"]
    line_width = params.get("line_width", 2)

    x = data["年份"].to_numpy(dtype=float)
    series = [name for name in data.columns if name != "年份"]
    y_max = float(data[series].to_numpy().max()) * 1.1

    # 全球化时期高亮
    ax.axvspan(2000, 2014, color=palette[4], alpha=0.2, zorder=0)
    for edge in (2000, 2014):
        ax.plot([edge, edge], [0, y_max], color=palette[4], linestyle="--", linewidth=1, zorder=2)
    ax.text(2000 - 0.5, y_max * 0.72, "2000年", ha="right", va="bottom", color=palette[4], fontsize=9)
    ax.text(2014 + 0.5, y_max * 0.72, "2014年", ha="left", va="bottom", color=palette[4], fontsize=9)
    ax.text(2007, y_max * 0.5, "全球化时期", ha="center", va="bottom", color=palette[4], fontsize=9)

    # 平滑多序列
    colors = []
    for i, name in enumerate(series):
        line_style = _style(params, "line", name)
        color = line_style.get("color") or palette[i % len(palette)]
        colors.append(color)
        xs, ys = _catmull_rom(x, data[name].to_numpy(dtype=float))
        ax.plot(xs, ys, color=color, linewidth=float(line_style.get("size", line_width)), label=name, zorder=4)

    # 历史高位标注（喀麦隆，1993）
    cameroon = data["喀麦隆"].to_numpy(dtype=float)
    cam_color = colors[series.index("喀麦隆")]
    idx = int(np.where(x == 1993)[0][0])
    ax.scatter([1993], [cameroon[idx]], color=cam_color, s=60, zorder=6)
    ax.text(
        1993,
        cameroon[idx] * 1.05,
        "历史高位",
        ha="center",
        va="bottom",
        color=cam_color,
        fontsize=9,
        zorder=7,
    )

    ax.grid(axis="y", linestyle="--", linewidth=0.5, color=grid, zorder=0)
