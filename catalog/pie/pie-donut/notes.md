# 环形饼图

在基本饼图基础上挖空中心形成的环形图（甜甜圈图），信息密度更高、观感更轻盈。

## 要点

- **中空环**：`hole` 参数控制环宽，matplotlib 用 `wedgeprops.width`，Plotly 用 `hole`，Altair 用 `innerRadius`。
- **占比标签**：标签落在环带中央，避免落进中心空洞。
- **统一配色**：与基本饼图一致，取自设计令牌 `palette`。

## 可调参数

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `show_labels` | bool | true | 是否在环带内显示百分比与数值 |
| `start_angle` | number | 0 | 起始角度（matplotlib / Plotly 生效） |
| `hole` | number | 0.5 | 中心空洞比例，0 即实心饼 |

## 库之间的差异

- **matplotlib**：`wedgeprops=dict(width=hole)` 直接生成环形，标签按环带中线定位。
- **Plotly**：`go.Pie(hole=...)`，交互式悬停。
- **Altair**：`mark_arc(innerRadius=..., outerRadius=...)`，内半径按 `hole` 折算。
