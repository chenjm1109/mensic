"""表格型热力图（Altair 实现）。"""

import altair as alt


def create_chart(data, params):
    sequential = params["tokens"]["color"]["sequential"]
    show_values = params.get("show_values", True)

    df = data.copy()
    df["列"] = df["列"].astype(int)
    df["行"] = df["行"].astype(int)
    df["数值"] = df["数值"].astype(float)

    # 动态文本颜色：负值用冷色，正值用暖色，极端值用白色
    def pick(v):
        if -40 <= v < 0:
            return sequential[0]
        if 0 <= v < 40:
            return sequential[-1]
        return "#ffffff"

    df["文本色"] = df["数值"].map(pick)

    n_cols = int(df["列"].max())
    n_rows = int(df["行"].max())

    rect = (
        alt.Chart(df)
        .mark_rect(stroke="#ffffff", strokeWidth=1)
        .encode(
            color=alt.Color("数值:Q", scale=alt.Scale(range=sequential),
                            legend=alt.Legend(title=None)),
            tooltip=["行:O", "列:O", "数值:Q"],
        )
    )
    layers = [rect]
    if show_values:
        layers.append(
            alt.Chart(df)
            .mark_text(fontSize=6, fontWeight="bold")
            .encode(
                text=alt.Text("数值:Q", format=".0f"),
                color=alt.Color(
                    "文本色:N",
                    scale=alt.Scale(
                        domain=[sequential[0], sequential[-1], "#ffffff"],
                        range=[sequential[0], sequential[-1], "#ffffff"],
                    ),
                    legend=None,
                ),
            )
        )

    chart = alt.layer(*layers).encode(
        x=alt.X(
            "列:O",
            sort=list(range(1, n_cols + 1)),
            axis=alt.Axis(labelExpr="datum.value", labelAngle=0, tickSize=0, labelFontSize=6),
        ),
        y=alt.Y(
            "行:O",
            sort=list(range(n_rows, 0, -1)),
            axis=alt.Axis(labelExpr="datum.value", tickSize=0, labelFontSize=6),
        ),
    )
    return chart
