# 带边际分布散点图

主图是分组散点，顶部和右侧各挂一个边际直方图，分别展示 X、Y 的一维分布，
从而在一张图里同时读出「双变量关系」和「各自的分布形态」。

## 要点

- **多子图布局**：`projection: figure`，由实现自建 6×6 GridSpec
  （matplotlib）或 `make_subplots`（Plotly），主图占比大、边际图窄。
- **共享坐标轴**：顶部直方图与主图共享 X 轴，右侧直方图与主图共享 Y 轴。
- **直方图样式**：半透明填充 + 白色描边，与散点同色；分箱宽度由参数控制。
- **呈现规格**：图级标题来自 `presentation`；由于矩阵子图无法由
  presentation 精确作用到单个子图，主图的轴标签 / 刻度 / 图例在实现内设置。

## 可调参数

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `point_size` | number | 100 | 散点面积 |
| `alpha` | number | 0.5 | 散点与直方图透明度 |
| `bin_width_x` | number | 1 | 顶部直方图分箱宽度 |
| `bin_width_y` | number | 2.5 | 右侧直方图分箱宽度 |

## 库之间的差异

- **matplotlib**：`GridSpec` + `sharex/sharey` 手工搭建，控制粒度最细。
- **Plotly**：`make_subplots` 共享坐标轴，交互式；边际图为横向/纵向 `Histogram`。

## 数据说明

原脚本 `005.py` 用 `numpy.random.seed(7)` 生成 3 组各 80 条正态数据；
这里以相同 seed 导出确定性 CSV（长表 `X, Y, 组别`）。
