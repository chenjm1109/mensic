"""带分类边界散点图（matplotlib 实现）。

契约：只画 marks（决策边界底色 + 分组散点），标题 / 坐标范围 / 刻度 /
图例位置由专题的 presentation 规格统一施加。

本实现对 sklearn 的依赖是允许的（原脚本即使用 SVC）；实现本身不 import
pydata_viz。
"""

import numpy as np
from matplotlib.colors import ListedColormap
from sklearn.svm import SVC


def _style(params, key, group):
    return ((params.get("elements") or {}).get(key) or {}).get(str(group)) or {}


def create_chart(ax, data, params):
    palette = params["tokens"]["color"]["palette"]
    grid_step = params.get("grid_step", 0.5)
    boundary_alpha = params.get("boundary_alpha", 0.2)
    point_size = params.get("point_size", 100)
    point_alpha = params.get("point_alpha", 0.5)
    kernel = params.get("kernel", "linear")

    X = data[["X", "Y"]].to_numpy(dtype=float)
    labels = data["类型"].astype("category")
    y = labels.cat.codes.to_numpy()
    categories = list(labels.cat.categories)

    model = SVC(kernel=kernel, decision_function_shape="ovo")
    model.fit(X, y)

    # 每一类的颜色：图形元素里对「数据点」的覆盖优先（分类区域跟着它一起变，
    # 否则用户改了点的颜色、底色还是旧色，分类就对不上了）。
    colors = []
    for i, cat in enumerate(categories):
        style = _style(params, "point", cat)
        colors.append(style.get("color") or palette[i % len(palette)])

    # 网格决策面：用底色区域表达分类结果
    x_min, x_max = X[:, 0].min() - 1, X[:, 0].max() + 1
    y_min, y_max = X[:, 1].min() - 1, X[:, 1].max() + 1
    xx, yy = np.meshgrid(
        np.arange(x_min, x_max, grid_step), np.arange(y_min, y_max, grid_step)
    )
    Z = model.predict(np.c_[xx.ravel(), yy.ravel()]).reshape(xx.shape)

    boundary_style = _style(params, "boundary", "*")
    boundary_alpha = float(boundary_style.get("opacity", boundary_alpha))
    ax.contourf(xx, yy, Z, alpha=boundary_alpha, cmap=ListedColormap(colors), zorder=1)

    for i, cat in enumerate(categories):
        sub = data[data["类型"] == cat]
        style = _style(params, "point", cat)
        size = float(style.get("size", point_size))
        alpha = float(style.get("opacity", point_alpha))
        ax.scatter(
            sub["X"],
            sub["Y"],
            s=size,
            c=colors[i],
            alpha=alpha,
            label=str(cat),
            zorder=3,
        )
