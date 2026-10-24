# 环形柱状图

在极坐标下把每个类别画成一段同心圆弧，弧的角度跨度与数值成正比。

## 要点

- **极坐标方向**：从正上方开始、顺时针展开（matplotlib 用
  `theta_offset=π/2` + `theta_direction=-1`；Plotly 用
  `angularaxis.rotation=90, direction="clockwise"`）。
- **环几何**：第 i 个环内径 `i + inner_offset`、厚 `ring_width`；角度跨度
  `数值 / (最大值 * 1.1) * 360°`，从 0° 起画。
- **阈值着色**：`<15` 取 `palette[3]`，`>25` 取 `palette[0]`，其余 `palette[1]`。
- **Plotly 实现注意**：`go.Barpolar` 在同一 trace 内混用不同 `base` 时渲染不可靠，
  因此每根柱子单独成 trace（base 为标量），再用 `legendgroup` 合并成 3 项图例。

## 可调参数

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `ring_width` | number | 0.8 | 每个环的厚度 |
| `inner_offset` | number | 2 | 最内环的内径偏移 |

## 库之间的差异

- **matplotlib**：`projection=polar`，`ax.bar` 的 `width` 即角度跨度。
- **Plotly**：`go.Barpolar`，`theta` 为角度中心、`width` 为角度跨度、
  `base/r` 为内外径；不画径向环标签（原图标签过于密集）。
- **Altair**：不支持极坐标，故不提供。
