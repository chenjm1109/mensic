# 阶梯折线图

用阶梯折线表示「阶段内保持不变、到点跳变」的离散型变化。

## 要点

- **阶梯插值**：matplotlib `where="mid"`，Plotly `line.shape="hv"`，Altair `interpolate="step"`（各库中语义最接近的实现）。
- **数据窗口**：原脚本只取 2000 年及之后的数据，实现按年份过滤。
- **区间高亮**：2016–2020 年画浅色竖向色带并标注起止年份。
- **参考线**：250 亿美元水平虚线，便于快速判断哪些序列越线。

## 可调参数

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `line_width` | number | 3 | 折线线宽 |
| `marker_size` | number | 5 | 节点标记大小 |

## 数据

- `data/gdp.csv`：年份 + `df.columns[3:7]` 四国（完整序列），实现内过滤出 2000–2023。

## 库之间的差异

- **matplotlib**：`ax.step(where="mid")`，折点在两数据点中间。
- **Plotly**：`line_shape="hv"`，交互式。
- **Altair**：`interpolate="step"`；因分层图无法被适配器注入刻度，显式指定 x 轴刻度 `[2000, 2010, 2020]`，并用 `nice=False` 固定值域。
