"""平滑折线图（Altair 实现）。

用 ``interpolate="monotone"`` 做平滑，分层图显式声明轴标题与 scale domain。
"""

import altair as alt
import pandas as pd

X_DOMAIN = [1960, 2025]
Y_DOMAIN = [0, 530]
Y_MAX = 530.0
NOTE_Y = Y_MAX * 0.72


def create_chart(data, params):
    palette = params["tokens"]["color"]["palette"]
    line_width = params.get("line_width", 2)

    df = data.copy()
    xf = df.columns[0]
    series = list(df.columns[1:])
    long = df.melt(id_vars=[xf], value_vars=series, var_name="国家", value_name="GDP")

    x_enc = alt.X(
        f"{xf}:Q",
        title="年份",
        scale=alt.Scale(domain=X_DOMAIN),
        axis=alt.Axis(labelAngle=0, format="d"),
    )
    y_enc = alt.Y(
        "GDP:Q",
        title="GDP（亿美元）",
        scale=alt.Scale(domain=Y_DOMAIN, nice=False),
        axis=alt.Axis(format="d"),
    )

    band = (
        alt.Chart(pd.DataFrame({"x": [2000], "x2": [2014]}))
        .mark_rect(color=palette[4], opacity=0.2)
        .encode(x=alt.X("x:Q", scale=alt.Scale(domain=X_DOMAIN)), x2="x2:Q")
    )
    rules = (
        alt.Chart(pd.DataFrame({xf: [2000, 2014]}))
        .mark_rule(strokeDash=[4, 3], strokeWidth=1, color=palette[4])
        .encode(x=alt.X(f"{xf}:Q", scale=alt.Scale(domain=X_DOMAIN)))
    )

    def _note_layer(x, text, align, y):
        return (
            alt.Chart(pd.DataFrame({"x": [x], "text": [text]}))
            .mark_text(
                color=palette[4],
                fontSize=11,
                fontWeight="bold",
                baseline="bottom",
                dy=-4,
                align=align,
            )
            .encode(
                x=alt.X("x:Q", scale=alt.Scale(domain=X_DOMAIN)),
                y=alt.datum(y),
                text="text:N",
            )
        )

    notes = (
        _note_layer(2000, "2000年", "right", NOTE_Y)
        + _note_layer(2014, "2014年", "left", NOTE_Y)
        + _note_layer(2007, "全球化时期", "center", Y_MAX * 0.5)
    )

    lines = (
        alt.Chart(long)
        .mark_line(strokeWidth=line_width, interpolate="monotone")
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

    hi = float(df.loc[df[xf] == 1993, series[3]].iloc[0])
    highlight = (
        alt.Chart(pd.DataFrame({xf: [1993], "GDP": [hi]}))
        .mark_point(color=palette[3], filled=True, size=60)
        .encode(x=x_enc, y=y_enc)
    )
    hi_label = (
        alt.Chart(pd.DataFrame({xf: [1993], "GDP": [hi * 1.05], "text": ["历史高位"]}))
        .mark_text(color=palette[3], fontSize=11, fontWeight="bold", baseline="bottom", dy=-4)
        .encode(x=x_enc, y=y_enc, text="text:N")
    )

    return band + rules + lines + notes + highlight + hi_label
