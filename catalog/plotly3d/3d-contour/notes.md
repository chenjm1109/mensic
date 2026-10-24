# 三维等高线图

把二维标量场的等值线抬高到各自的高度，形成三维"等高线堆叠"效果。

## 要点

- **原生实现**：原脚本用 `matplotlib.pyplot.contour` 仅作数据提取，
  再逐条 `go.Scatter3d` 绘制。迁移后改为 **Plotly 原生**
  `go.Surface(contours={"z": {...}}, hidesurface=True)`：
  - `hidesurface=True` 只保留等值线、隐藏曲面；
  - `usecolormap=True` 让线条按高度取值于 `surface3d` 色系；
  - `size=(zmax-zmin)/num_levels` 控制等值线层数。
- **配色**：`colorscale` 来自 `params["tokens"]["color"]["surface3d"]`。
- 数据为原脚本公式（32×22 网格）生成的确定性 CSV。

## 可调参数

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `num_levels` | integer | 20 | 等值线层数（原脚本 `num_levels`） |
| `line_width` | number | 4 | 等值线线宽（原脚本为 8） |

## 库之间的差异

- 该专题只提供 **Plotly** 实现。原脚本混用 matplotlib 提取等值线，
  迁移后完全不需要 matplotlib，`go.Surface` 的 `contours` 即可覆盖。
