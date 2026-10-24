# 径向柱状图

柱子沿圆周均匀排布，柱长表示数值高低，适合展示周期性 / 方向性数据。

## 要点

- **均匀角度**：`angles = linspace(0, 2π, n, endpoint=False)`，每根柱宽 `2π/n`。
- **内径抬升**：用 `bottom=base`（matplotlib）/ `base=base`（Plotly）把柱子抬离圆心。
- **阈值着色**：`<15` 取 `palette[3]`，`>25` 取 `palette[0]`，其余 `palette[1]`。
- **数值标签**：matplotlib 在柱顶附近沿切向旋转标注；Plotly 不画（barpolar 无旋转文本）。

## 可调参数

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `base` | number | 10 | 柱子的内径（抬升量） |

## 库之间的差异

- **matplotlib**：极坐标 `ax.bar`，角度轴刻度即类别标签。
- **Plotly**：`go.Barpolar`；每根柱子单独成 trace 并用 `legendgroup` 合并图例。
- **Altair**：不支持极坐标，故不提供。
