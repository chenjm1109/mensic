# 三维向量场图

把空间中的 `(u, v, w)` 向量场画成三维锥形箭头，颜色映射到向量模长。

## 要点

- **数据裁剪**：原始 `08-cone/data.csv` 含 2000 个向量（162 KB）。
  按迁移规范裁剪后只保留 **每 4 行取 1**（500 个向量），
  存入 `data/cone.csv`，字段为 `x, y, z, u, v, w`。
- `go.Cone` 用 `sizemode="absolute"` + `sizeref` 控制箭头缩放，
  颜色由 `params["tokens"]["color"]["surface3d"]` 生成；
  `show_scale` 控制是否显示色条。
- 场景 `aspectratio` 与 `margin` 在实现里设置，背景/字体交给 Plotly 模板。

## 可调参数

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `sizeref` | number | 60 | 箭头大小缩放（对应原脚本） |
| `show_scale` | bool | true | 是否显示颜色条 |

## 库之间的差异

- 该专题只提供 **Plotly** 实现：`go.Cone` 是原生三维向量场图，
  matplotlib 无直接等价能力。
