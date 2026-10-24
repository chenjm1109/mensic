"""阶梯折线图（Altair 实现）。

用 ``interpolate="step"`` 画阶梯线；分层图显式声明轴标题与 scale domain。
"""

import altair as alt
import pandas as pd

X_DOMAIN = [1999.5, 2023.5]
Y_DOMAIN = [0, 505]
Y_MAX = 480.0
Y_REF = 250.0


def create_chart(data, params):
    palette = params["tokens"]["color"]["palette"]
    line_width = params.get("line_width", 3)
    marker_size = params.get("marker_size", 5)

    df = data[data["年份"] >= 2000].reset_index(drop=True).copy()
    xf = df.columns[0]
    series = list(df.columns[1:])
    long = df.melt(id_vars=[xf], value_vars=series, var_name="国家", value_name="GDP")

    x_enc = alt.X(
        f"{xf}:Q",
        title="年份",
        scale=alt.Scale(domain=X_DOMAIN),
        axis=alt.Axis(labelAngle=0, format="d", values=[2000, 2010, 2020]),
    )
    y_enc = alt.Y(
        "GDP:Q",
        title="GDP（亿美元）",
        scale=alt.Scale(domain=Y_DOMAIN, nice=False),
        axis=alt.Axis(format="d"),
    )

    band = (
        alt.Chart(pd.DataFrame({"x": [2016], "x2": [2020]}))
        .mark_rect(color=palette[1], opacity=0.1)
        .encode(x=alt.X("x:Q", scale=alt.Scale(domain=X_DOMAIN)), x2="x2:Q")
    )
    rules = (
        alt.Chart(pd.DataFrame({xf: [2016, 2020]}))
        .mark_rule(strokeDash=[4, 3], strokeWidth=1, color=palette[1])
        .encode(x=alt.X(f"{xf}:Q", scale=alt.Scale(domain=X_DOMAIN)))
    )
    notes = (
        alt.Chart(pd.DataFrame({xf: [2016, 2020], "text": ["2016年", "2020年"]}))
        .mark_text(
            color=palette[1],
            fontSize=11,
            fontWeight="bold",
            baseline="bottom",
            dy=-4,
            align="right",
            dx=-4,
        )
        .encode(
            x=alt.X(f"{xf}:Q", scale=alt.Scale(domain=X_DOMAIN)),
            y=alt.datum(Y_MAX * 0.8),
            text="text:N",
        )
    )

    lines = (
        alt.Chart(long)
        .mark_line(
            strokeWidth=line_width,
            interpolate="step",
            point=alt.OverlayMarkDef(filled=False, size=marker_size * marker_size),
        )
        .encode(
            x=x_enc,
            y=y_enc,
            color=alt.Color(
                "国家:N",
                scale=alt.Scale(domain=series, range=palette[: len(series)]),
                legend=alt.Legend(title=None, orient="top-left", direction="horizontal", columns=2),
            ),
            tooltip=[xf, "国家:N", "GDP:Q"],
        )
    )

    ref = (
        alt.Chart(pd.DataFrame({"y": [Y_REF]}))
        .mark_rule(strokeDash=[4, 3], strokeWidth=1, color=palette[0])
        .encode(y=alt.Y("y:Q", scale=alt.Scale(domain=Y_DOMAIN)))
    )
    ref_label = (
        alt.Chart(pd.DataFrame({"x": [2005], "y": [Y_REF * 1.01], "text": ["250亿美元"]}))
        .mark_text(color=palette[0], fontSize=11, fontWeight="bold", baseline="bottom", align="right")
        .encode(
            x=alt.X("x:Q", scale=alt.Scale(domain=X_DOMAIN)),
            y=alt.Y("y:Q", scale=alt.Scale(domain=Y_DOMAIN)),
            text="text:N",
        )
    )

    return band + rules + lines + notes + ref + ref_label
