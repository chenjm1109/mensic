# 热力柱状图

用连续色按数值给柱子上色，并附颜色条标注数值与颜色的对应关系。

## 要点

- **连续色映射**：颜色来自 `tokens.color.sequential`，用
  `LinearSegmentedColormap`（matplotlib）/ `colorscale`（Plotly）在数据
  min–max 之间线性插值。
- **颜色条**：matplotlib 用 `ScalarMappable` + `fig.colorbar`；Plotly 用
  `marker.showscale=True`。
- **坐标范围/刻度**：`limits` 与 `ticks` 交由 presentation，实现只画柱与颜色条。

## 可调参数

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `bar_width` | number | 0.8 | 柱子宽度 |

## 库之间的差异

- **matplotlib**：使用 `x_major` 数值定位器，横轴按 5 取整。
- **Plotly**：横轴为类别，忽略数值定位器，由 Plotly 自动取整。
