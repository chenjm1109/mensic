# 极坐标分组散点图

把散点放进极坐标系：靠圆心的远近表示半径 `r`，环形角度表示方位角 `θ`，三组样本分别占据不同扇区。

## 要点

- **极坐标画布**：由 `presentation.projection: polar` 声明，matplotlib 适配器自动以 `projection="polar"` 建轴；Plotly 则用 `go.Scatterpolar`。
- **角度单位**：数据里的角度以**弧度**存储，Plotly 侧显式设置 `thetaunit="radians"`，与 matplotlib 的极坐标约定一致（0° 朝右、逆时针）。
- **分组着色**：三组样本使用分类色板前三种颜色，`point_alpha` 控制透明度。
- 数据由原脚本 `seed=7` 生成，三组共 200 个点，固化到 `data/polar.csv`。

## 可调参数

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `point_size` | number | 100 | 散点大小（Plotly 侧按直径换算） |
| `point_alpha` | number | 0.5 | 散点透明度 |

## 库之间的差异

- **matplotlib**：极坐标轴由适配器创建，图例通过 `presentation.legend` 定位。
- **Plotly**：交互式极坐标，`angularaxis` 默认逆时针、0° 朝右，与 matplotlib 对齐。
- **Altair 不支持极坐标**，故未实现。
