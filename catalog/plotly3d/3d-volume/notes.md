# 三维体积图

用 `go.Volume` 渲染一个 30×30×30 的标量场，只显示取值落在
`[isomin, isomax]` 区间的体素，形成多层半透明"云团"。

## 要点

- **确定性数据**：原脚本用 `np.random.seed(0)` 在 3D 网格中随机撒 15 个点，
  再用 `scipy.ndimage.gaussian_filter(σ=4)` 平滑并归一化。这些步骤只做一次，
  结果落盘为 `data/volume.csv`（27000 行），渲染实现不再依赖 scipy。
- **等值区间**：`isomin / isomax` 控制显示范围，`surface_count` 控制壳体层数，
  `opacity` 控制半透明程度；`colorscale` 来自
  `params["tokens"]["color"]["surface3d"]`。
- 场景 `aspectratio` 与 `margin` 在实现里设置，背景/字体交给 Plotly 模板。

## 可调参数

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `isomin` | number | 0.2 | 显示下限 |
| `isomax` | number | 0.7 | 显示上限 |
| `opacity` | number | 0.1 | 半透明度 |
| `surface_count` | integer | 25 | 等值壳层数量 |

## 库之间的差异

- 该专题只提供 **Plotly** 实现：`go.Volume` 直接支持体数据光线投射，
  matplotlib 没有等价的原生体积渲染。
