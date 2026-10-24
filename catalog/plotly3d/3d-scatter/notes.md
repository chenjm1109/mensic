# 三维散点图

把双高斯曲面上的采样点直接画成三维散点，点的颜色映射到高度值。

## 要点

- 每个采样点用 `go.Scatter3d(mode="markers")` 表示，
  `marker.color` 取高度值，`colorscale` 来自
  `params["tokens"]["color"]["surface3d"]`，并显示 Z 色条。
- 数据以长表形式存放在 `data/scatter3d.csv`（32×22 网格共 704 点），
  `x`、`y` 为平面坐标，`z` 为高度，`value` 与 `z` 相同、用于着色。
- 场景的 `margin` 由实现设置，背景与字体交给 Plotly 模板。

## 可调参数

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `marker_size` | number | 4 | 散点大小 |

## 库之间的差异

- 该专题只提供 **Plotly** 实现：`go.Scatter3d` 是原生三维散点，
  支持旋转、缩放与悬停。matplotlib `mplot3d` 亦可，但交互性弱。
