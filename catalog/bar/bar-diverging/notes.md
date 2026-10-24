# 正负柱状图

以零基线为中心的水平柱，正值与负值用发散色两端分别着色。

## 要点

- **发散色**：负值取 `tokens.color.diverging[0]`，正值取 `diverging[-1]`。
- **零基线**：matplotlib 画一条白色零线；Plotly 轴自带零线。
- **水平方向**：数值在 x 轴、类别在 y 轴，`limits.x` 由 presentation 控制。
- **无图例**：颜色含义由正负方向自解释，故不设 legend。

## 可调参数

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `bar_height` | number | 0.8 | 柱子高度 |

## 库之间的差异

- **matplotlib**：`barh` + 手工分色。
- **Plotly**：`orientation="h"`。
- **Altair**：派生正负方向列后按发散色编码，并用 `legend=None` 隐藏图例。
