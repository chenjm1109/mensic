# 三维等值面图

对标量场 `value = 0.5·x² + y² + 2·z²` 提取多层等值面，
得到一组层层嵌套的椭球面。

## 要点

- 数据在 40×40×40 的规整网格上按原脚本公式解析求值，落盘为
  `data/isosurface.csv`（64000 行）。渲染时交给 `go.Isosurface` 做
  marching-cubes 三角化。
- **等值面**：`isomin / isomax` 限定取值区间（原脚本为 10–50），
  `surface_count` 控制等值面层数，`colorbar_nticks=5` 让色条刻度与
  等值面对应；`caps` 关闭 x/y 方向的封盖。
- `colorscale` 来自 `params["tokens"]["color"]["surface3d"]`；
  场景 `aspectratio` 与 `margin` 由实现设置，背景/字体交给模板。

## 可调参数

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `isomin` | number | 10 | 等值面下限 |
| `isomax` | number | 50 | 等值面上限 |
| `surface_count` | integer | 5 | 等值面层数 |

## 库之间的差异

- 该专题只提供 **Plotly** 实现：`go.Isosurface` 原生支持从散点标量场
  重建等值面，matplotlib 无等价能力。
