# 平滑折线图

在多条折线的基础上做样条平滑，弱化逐年锯齿，突出长期趋势。

## 要点

- **平滑插值**：原脚本用 `scipy.interpolate.make_interp_spline`；迁移规范只允许 numpy / pandas / matplotlib / plotly / altair，因此 matplotlib 侧用 numpy 手写 **Catmull-Rom 分段三次插值**（`_catmull_rom`）。
- **各库原生平滑**：Plotly 用 `line.shape="spline"`，Altair 用 `interpolate="monotone"`，均无需额外依赖。
- **阶段高亮 / 历史高位**：与分组折线图一致，保留全球化时期色带与喀麦隆 1993 峰值标注。
- **去掉节点标记**：平滑曲线不再画逐年圆点，避免视觉噪声。

## 可调参数

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `line_width` | number | 2 | 折线线宽 |

## 数据

- `data/gdp.csv`：年份 + `df.columns[3:7]` 四国，来自 `src/06-line/dataset1.csv` 裁剪。

## 库之间的差异

- **matplotlib**：numpy 手写 Catmull-Rom；`n=300` 固定采样，不依赖 scipy。
- **Plotly**：原生 spline，交互式。
- **Altair**：`interpolate="monotone"`，分层图显式声明轴标题与 scale domain。
