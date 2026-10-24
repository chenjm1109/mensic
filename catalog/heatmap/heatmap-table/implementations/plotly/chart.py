"""表格型热力图（Plotly 实现）。"""

import plotly.graph_objects as go


def _colorscale(colors):
    n = len(colors)
    return [[i / (n - 1), c] for i, c in enumerate(colors)]


def create_chart(fig, data, params):
    sequential = params["tokens"]["color"]["sequential"]
    show_values = params.get("show_values", True)

    grid = data.pivot(index="行", columns="列", values="数值").sort_index().sort_index(axis=1)
    values = grid.to_numpy(dtype=float)
    n_rows, n_cols = values.shape
    x_labels = [str(i + 1) for i in range(n_cols)]
    y_labels = [str(i + 1) for i in range(n_rows)]

    fig.add_trace(
        go.Heatmap(
            z=values,
            x=x_labels,
            y=y_labels,
            colorscale=_colorscale(sequential),
            showscale=True,
            hovertemplate="行 %{y} / 列 %{x}<br>数值 %{z:.0f}<extra></extra>",
        )
    )

    if show_values:
        groups = {}
        for i in range(n_rows):
            for j in range(n_cols):
                v = values[i, j]
                if -40 <= v < 0:
                    color = sequential[0]
                elif 0 <= v < 40:
                    color = sequential[-1]
                else:
                    color = "#ffffff"
                groups.setdefault(color, ([], [], []))
                groups[color][0].append(x_labels[j])
                groups[color][1].append(y_labels[i])
                groups[color][2].append(f"{int(v)}")
        for color, (xs, ys, labels) in groups.items():
            fig.add_trace(
                go.Scatter(
                    x=xs,
                    y=ys,
                    mode="text",
                    text=labels,
                    textfont=dict(color=color, size=6),
                    showlegend=False,
                    hoverinfo="skip",
                )
            )

    fig.update_xaxes(type="category", tickfont=dict(size=6), tickangle=0)
    fig.update_yaxes(type="category", autorange="reversed", tickfont=dict(size=6))
    return fig
