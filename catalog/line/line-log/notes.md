# 对数坐标折线图

把纵轴换成对数坐标，用同一张图对比数量级差异较大的多条序列。

## 要点

- **对数纵轴**：`yscale="log"`（matplotlib）/ `type="log"`（Plotly）/ `Scale(type="log")`（Altair）。对数轴在 presentation 契约里没有对应字段，因此由各实现自行设置。
- **压平增长**：喀麦隆、博茨瓦纳等指数式增长在对数轴上接近直线，便于比较增速。
- **每十倍刻度**：Plotly 用 `dtick=1` 只保留 10ⁿ 主刻度，避免出现 2、5 的次刻度噪声。
- **阶段高亮 / 历史高位**：全球化时期色带贴近底部，喀麦隆 1993 峰值照常标注。

## 可调参数

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `line_width` | number | 3 | 折线线宽 |
| `marker_size` | number | 5 | 节点标记大小 |

## 数据

- `data/gdp.csv`：年份 + `df.columns[3:7]` 四国，来自 `src/06-line/dataset1.csv` 裁剪。
- 值域约 0.3–2400（亿美元），跨越四个数量级。

## 库之间的差异

- **matplotlib**：`set_yscale("log")` + 主 / 次网格，轴标签用 10ⁿ。
- **Plotly**：`type="log"`，`range` 需用 log10 单位，`dtick=1`。
- **Altair**：`scale=alt.Scale(type="log")`，分层图显式声明轴标题与 domain。
