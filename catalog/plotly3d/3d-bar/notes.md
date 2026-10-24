# 三维柱状图

在 X-Y 平面上按网格摆放立方体柱，用柱体高度表示第三个维度的取值，
并按高度用三维曲面色系（`surface3d`）平滑着色。

## 要点

- **单 Mesh3d 合批**：原始脚本为每根柱体单独添加一个 `Mesh3d` + 一条棱线
  （176 个位置共 352 条 trace）。这里把所有立方体的顶点、三角面、
  顶点强度合并到 **一个** `go.Mesh3d` 中，棱线合并到 **一条** `go.Scatter3d`，
  渲染更快、体积更小，视觉结果一致。
- **高度着色**：`intensity` 取柱高在 `[zmin, zmax]` 上的归一化值，
  `colorscale` 由 `params["tokens"]["color"]["surface3d"]` 生成，等价于原脚本的
  手动线性插值。
- **三维坐标系**：`scene.aspectratio` 与 `margin` 在实现里设置；
  背景与字体由 Plotly 模板统一，不再写 `backgroundcolor`。

## 可调参数

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `bar_size` | number | 0.15 | 立方体边长（对应原脚本 `a`） |
| `show_edges` | bool | true | 是否绘制白色柱棱 |

## 库之间的差异

- 该专题只提供 **Plotly** 实现：`Mesh3d` 是 Plotly 的原生三维网格，
  matplotlib 的 `mplot3d` 需要手写 `Poly3DCollection` 才能得到同等效果。
- 数据为原脚本解析式网格（16×11）在固定公式下生成的确定性 CSV。
