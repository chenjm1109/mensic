"""标准折线图（Altair 实现）。

声明式写法：数据 → 编码 → 标记。
注意：Altair 的分层图（LayerChart）无法被适配器统一注入坐标轴标题 / 值域，
因此这里在编码中显式声明与 presentation 对齐的轴标题与 scale domain。
"""

import altair as alt
import pandas as pd

X_DOMAIN = [1960, 2025]
Y_DOMAIN = [0, 2640]


def create_chart(data, params):
    palette = params["tokens"]["color"]["palette"]
    line_width = params.get("line_width", 3)
    marker_size = params.get("marker_size", 6)

    df = data.copy()
    xf, yf = df.columns[0], df.columns[1]

    x_enc = alt.X(
        f"{xf}:Q",
        title="年份",
        scale=alt.Scale(domain=X_DOMAIN),
        axis=alt.Axis(labelAngle=0, format="d"),
    )
    y_enc = alt.Y(
        f"{yf}:Q",
        title="GDP（亿美元）",
        scale=alt.Scale(domain=Y_DOMAIN, nice=False),
        axis=alt.Axis(format="d"),
    )

    # 区间高亮（按阶段着色，顺带生成图例）
    parts = []
    for lo, hi, name in [(2002, 2014, "发展期"), (1987, 1995, "衰退期")]:
        sub = df[(df[xf] >= lo) & (df[xf] <= hi)].copy()
        sub["阶段"] = name
        parts.append(sub)
    areas_df = pd.concat(parts, ignore_index=True)
    areas = (
        alt.Chart(areas_df)
        .mark_area(opacity=0.3, line=False)
        .encode(
            x=x_enc,
            y=y_enc,
            y2=alt.datum(0),
            color=alt.Color(
                "阶段:N",
                scale=alt.Scale(
                    domain=["发展期", "衰退期"],
                    range=[palette[0], palette[1]],
                ),
                legend=alt.Legend(title=None, orient="top-left", direction="horizontal"),
            ),
        )
    )

    # 区间两端虚线
    rules = (
        alt.Chart(pd.DataFrame({xf: [1987, 1995, 2002, 2014]}))
        .mark_rule(strokeDash=[4, 3], strokeWidth=1, color=palette[2])
        .encode(x=x_enc)
    )

    # 主折线 + 节点
    line = (
        alt.Chart(df)
        .mark_line(
            color=palette[3],
            strokeWidth=line_width,
            point=alt.OverlayMarkDef(
                color="white",
                fill="white",
                stroke=palette[3],
                strokeWidth=1.5,
                size=marker_size * marker_size * 2,
            ),
        )
        .encode(
            x=x_enc,
            y=y_enc,
            tooltip=[alt.Tooltip(f"{xf}:Q"), alt.Tooltip(f"{yf}:Q")],
        )
    )

    def _value(year):
        return float(df.loc[df[xf] == year, yf].iloc[0])

    points = (
        alt.Chart(pd.DataFrame({xf: [1987, 1995, 2008], yf: [_value(1987), _value(1995), _value(2008)]}))
        .mark_point(color=palette[4], filled=True, size=marker_size * marker_size * 2)
        .encode(x=x_enc, y=y_enc)
    )
    labels_bottom = (
        alt.Chart(
            pd.DataFrame(
                {
                    xf: [1987, 2008],
                    yf: [_value(1987) * 1.06, _value(2008) * 1.02],
                    "text": [
                        f"衰退开始：{_value(1987):.1f}亿",
                        f"2008年：{_value(2008):.1f}亿",
                    ],
                }
            )
        )
        .mark_text(color=palette[4], fontSize=11, fontWeight="bold", baseline="bottom", dy=-4)
        .encode(x=x_enc, y=y_enc, text="text:N")
    )
    labels_top = (
        alt.Chart(
            pd.DataFrame(
                {
                    xf: [1995],
                    yf: [_value(1995) * 0.94],
                    "text": [f"衰退结束：{_value(1995):.1f}亿"],
                }
            )
        )
        .mark_text(color=palette[4], fontSize=11, fontWeight="bold", baseline="top", dy=4)
        .encode(x=x_enc, y=y_enc, text="text:N")
    )

    return areas + rules + line + points + labels_bottom + labels_top
