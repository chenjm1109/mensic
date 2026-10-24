# 瀑布图

用浮动柱表示从初始值开始的一连串增减，每根柱从上一根的累计值出发。

## 要点

- **累计起点**：第 i 根柱的 `bottom = 前 i 个数值之和`；柱顶 = `bottom + 数值`。
- **派生列**：Altair 无 `bottom` 概念，改派生出 `起始 / 结束 / 中点`，用
  `y` + `y2` 两个通道画出浮动矩形。
- **配色**：正增量取 `tokens.color.palette[1]`，负增量取 `palette[0]`。
- **数值标签**：柱内标注增量绝对值，位置取 `bottom + 数值/2`。

## 可调参数

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `bar_width` | number | 0.6 | 柱子宽度 |
| `show_labels` | bool | true | 是否显示数值标签 |

## 库之间的差异

- **matplotlib**：`ax.bar(x, value, bottom=...)`。
- **Plotly**：`go.Bar(base=...)`。
- **Altair**：`y`（起点）+ `y2`（终点）表达浮动柱，标签单独一层。
