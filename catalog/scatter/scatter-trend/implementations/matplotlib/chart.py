"""带趋势线散点图（matplotlib 实现）。

对每组数据先画散点与边缘投影，再叠加对应形状的拟合曲线：
线性（1 次）、二次多项式（2 次）、指数（a·e^(bx)+c）。
指数拟合用纯 numpy 的高斯-牛顿迭代实现（不引入 scipy）。
只画 marks，标题 / 坐标范围 / 刻度 / 图例位置由 presentation 施加。
"""

import numpy as np

FIT_LABELS = {"线性数据": "线性拟合", "二次多项式数据": "2次多项式拟合", "指数数据": "指数拟合"}


def _style(params, key, group):
    return ((params.get("elements") or {}).get(key) or {}).get(str(group)) or {}


def _exp_fit(x, y):
    """最小二乘拟合 y = a·e^(bx) + c，返回 (a, b, c)。"""
    x = np.asarray(x, dtype=float)
    y = np.asarray(y, dtype=float)
    guesses = [
        (1.0, 0.1, float(np.min(y))),
        (float(np.max(y) - np.min(y)), 0.1, float(np.min(y))),
        (1.0, 0.3, float(np.mean(y))),
        (10.0, 0.3, 0.0),
        (float(np.max(y)), 0.2, float(np.min(y))),
    ]
    best = None
    for a, b, c in guesses:
        for _ in range(300):
            e = np.exp(np.clip(b * x, -30.0, 30.0))
            residual = a * e + c - y
            jac = np.column_stack([e, a * x * e, np.ones_like(x)])
            try:
                delta, *_ = np.linalg.lstsq(jac, -residual, rcond=None)
            except np.linalg.LinAlgError:
                break
            base_sse = float(np.sum(residual**2))
            step = 1.0
            for _ in range(20):
                na, nb, nc = a + step * delta[0], b + step * delta[1], c + step * delta[2]
                ne = np.exp(np.clip(nb * x, -30.0, 30.0))
                if np.sum((na * ne + nc - y) ** 2) <= base_sse:
                    break
                step *= 0.5
            a, b, c = a + step * delta[0], b + step * delta[1], c + step * delta[2]
            if abs(step * delta[0]) + abs(step * delta[1]) + abs(step * delta[2]) < 1e-10:
                break
        sse = float(np.sum((a * np.exp(np.clip(b * x, -30.0, 30.0)) + c - y) ** 2))
        if best is None or sse < best[0]:
            best = (sse, a, b, c)
    _, a, b, c = best
    return a, b, c


def _fit_curve(x, y, group):
    xs = np.linspace(float(np.min(x)), float(np.max(x)), 100)
    if group == "二次多项式数据":
        coef = np.polyfit(x, y, 2)
        return xs, np.polyval(coef, xs)
    if group == "指数数据":
        a, b, c = _exp_fit(x, y)
        return xs, a * np.exp(b * xs) + c
    coef = np.polyfit(x, y, 1)
    return xs, np.polyval(coef, xs)


def create_chart(ax, data, params):
    palette = params["tokens"]["color"]["palette"]
    size = float(params.get("point_size", 100))
    alpha = float(params.get("alpha", 0.5))
    show_projection = bool(params.get("show_projection", True))
    xcol, ycol, gcol = "X轴", "Y轴", "组别"

    for i, group in enumerate(data[gcol].unique()):
        sub = data[data[gcol] == group]
        x = sub[xcol].astype(float).to_numpy()
        y = sub[ycol].astype(float).to_numpy()
        point_style = _style(params, "point", group)
        line_style = _style(params, "line", group)
        color = point_style.get("color") or palette[i % len(palette)]
        point_size = float(point_style.get("size", size))
        point_alpha = float(point_style.get("opacity", alpha))
        line_color = line_style.get("color") or color

        ax.scatter(x, y, s=point_size, color=color, alpha=point_alpha,
                   label=str(group), zorder=3)

        if show_projection:
            ax.scatter(x, np.full_like(x, -0.5), marker="|", color=color,
                       alpha=point_alpha, s=point_size * 3, zorder=2)
            ax.scatter(np.full_like(y, -0.5), y, marker="_", color=color,
                       alpha=point_alpha, s=point_size * 3, zorder=2)

        xs, ys = _fit_curve(x, y, group)
        ax.plot(xs, ys, color=line_color, linestyle="--", linewidth=3,
                label=FIT_LABELS.get(group, "拟合"), zorder=4)
