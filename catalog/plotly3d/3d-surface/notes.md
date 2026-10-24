# 三维曲面图

用双高斯叠加构造的起伏曲面，以 `go.Surface` 绘制，颜色映射到高度，
并在曲面上叠加白色网格线。

## 要点

- **规整网格**：数据以长表 `(x, y, z)` 存放在 `data/surface.csv`，
  实现里用 `pivot` 还原为网格后交给 `go.Surface`（`x`、`y` 为二维网格）。
- **曲面网格线**：原脚本通过 `contours.x / contours.y` 控制网格密度
  （`size=0.1`）与线条宽度。这里保留该逻辑，宽度做成参数 `grid_width`
  （原脚本为 5，模板中取 2 更清晰）。
- **配色**：`colorscale` 由 `params["tokens"]["color"]["surface3d"]` 生成，
  与原脚本的自定义色系一致。
- 三维场景背景与字体由 Plotly 模板统一设置，实现不写 `backgroundcolor`。

## 可调参数

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `show_grid` | bool | true | 是否显示曲面上的白色网格线 |
| `grid_width` | number | 2 | 网格线宽度（原脚本为 5） |

## 库之间的差异

- 该专题只提供 **Plotly** 实现。matplotlib `mplot3d` 的 `plot_surface`
  也能画曲面，但交互、着色与网格线控制不如 `go.Surface` 直接。
- 网格数据为原脚本公式（32×22）生成的确定性 CSV。
