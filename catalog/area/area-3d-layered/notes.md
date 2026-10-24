# 三维分层面积图

在三维空间中把多条面积曲线沿深度方向排列，形成山脊式的层叠曲面。本专题由两个源
脚本合并而成，因此 `data/layered3d.csv` 内含两份数据集，用 `数据集` 列区分：

- `分层`：源 `src/02-area/6.py`，8 条高斯叠加曲线（matplotlib 使用）；
- `曲面`：源 `src/07-3d/09-area/area.py`，32×22 的二维高斯曲面网格（Plotly 使用）。

## 要点

- **三维层叠**：每条曲线填充为多边形，沿 y 轴（类别方向）逐层排列。
- **切片式面积**：Plotly 侧对曲面沿 x 切片，每片以基线到曲面的区域作为面积面。
- **白色边线**：每层/每片用白线描边，强化层间分隔与立体感。
- **配色**：两条实现都取自 `params["tokens"]["color"]["surface3d"]` 的蓝—棕—粉渐变。

## 可调参数

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `num_layers` | integer | 6 | Plotly 沿 x 方向的切片层数 |
| `opacity` | number | 0.6 | 面积面透明度 |

## 库之间的差异

- **matplotlib**：`projection="3d"` + `PolyCollection`，用 `add_collection3d` 沿 y 排列；
  观察角 `view_init(30, -60)`、盒比例与 z 轴范围在实现内设定（presentation 不含 z 轴）。
- **Plotly**：`go.Surface` 逐片绘制 + `go.Scatter3d` 白边；`scene` 轴标题、比例与 z 范围在实现内设定。
  因其数据来自曲面脚本，y 轴为空间维度，故场景 y 轴标题设为 `Y`。
- Altair 不支持 3D，故不提供实现。
