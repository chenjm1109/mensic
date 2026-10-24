"""等值线热力图（Plotly 实现）。"""

import plotly.graph_objects as go


def _colorscale(colors):
    n = len(colors)
    return [[i / (n - 1), c] for i, c in enumerate(colors)]


def create_chart(fig, data, params):
    sequential = params["tokens"]["color"]["sequential"]
    colorscale = _colorscale(sequential)

    grid = data.pivot(index="y", columns="x", values="z").sort_index().sort_index(axis=1)
    x = grid.columns.tolist()
    y = grid.index.tolist()
    z = grid.to_numpy()

    levels = int(params.get("levels", 50))
    line_levels = int(params.get("line_levels", 15))

    # 填充层
    fig.add_trace(
        go.Contour(
            x=x,
            y=y,
            z=z,
            colorscale=colorscale,
            ncontours=levels,
            contours=dict(coloring="fill", showlines=False),
            line=dict(width=0),
            colorbar=dict(title=None),
            hoverinfo="skip",
        )
    )
    # 白色等值线层
    if line_levels > 0:
        fig.add_trace(
            go.Contour(
                x=x,
                y=y,
                z=z,
                ncontours=line_levels,
                contours=dict(
                    coloring="lines",
                    showlines=True,
                    showlabels=True,
                    labelfont=dict(color="#ffffff", size=8),
                ),
                line=dict(width=0.8, color="#ffffff"),
                showscale=False,
                hoverinfo="skip",
            )
        )
    return fig
