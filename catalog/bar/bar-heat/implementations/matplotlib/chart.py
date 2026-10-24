"""热力柱状图（matplotlib 实现）。

柱子颜色由连续色（sequential token）按数值线性映射，并附加颜色条。
"""

from matplotlib.cm import ScalarMappable
from matplotlib.colors import LinearSegmentedColormap, Normalize


def _style(params, key, group):
    """图形元素覆盖；没覆盖就返回空字典，颜色仍由数值连续映射。"""
    return ((params.get("elements") or {}).get(key) or {}).get(str(group)) or {}


def create_chart(ax, data, params):
    sequential = params["tokens"]["color"]["sequential"]
    bar_width = params.get("bar_width", 0.8)

    style = _style(params, "bar", "*")
    width = float(style.get("size", bar_width))
    alpha = float(style.get("opacity", params.get("bar_alpha", 1)))

    x = data["类别"].to_numpy()
    values = data["数值"].to_numpy(dtype=float)

    cmap = LinearSegmentedColormap.from_list("pydata_sequential", sequential)
    norm = Normalize(vmin=float(values.min()), vmax=float(values.max()))
    ax.bar(
        x,
        values,
        width=width,
        alpha=alpha,
        color=[cmap(norm(v)) for v in values],
        zorder=3,
    )

    sm = ScalarMappable(norm=norm, cmap=cmap)
    sm.set_array([])
    ax.figure.colorbar(sm, ax=ax, orientation="vertical", pad=0.01, fraction=0.05)

    # 隔行底色 + 白色网格
    ax.grid(axis="y", color="#ffffff", linewidth=1.5, zorder=1)
    yticks = ax.get_yticks()
    for i in range(len(yticks) - 1):
        if i % 2 == 1:
            ax.axhspan(yticks[i], yticks[i + 1], facecolor="#f6f8fb", zorder=0)
