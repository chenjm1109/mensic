# 三维气泡图

沿一条带噪声的螺旋线上升的三维气泡：Z 越高气泡越大、颜色越暖。

## 要点

- 气泡位置由参数方程 `x=R·cos(t)`、`y=R·sin(t)`、`z=t` 加高斯噪声生成，
  固定 `np.random.seed(42)`，数据已落盘为 `data/bubble3d.csv`。
- `size` 列为 `2·(z - zmin) + 10`（原脚本算法），实现里可直接使用；
  `marker.color` 取 Z 值，颜色来自
  `params["tokens"]["color"]["surface3d"]`，并显示 Z 色条。
- `opacity` 与场景 `aspectratio` 在实现里设置，背景/字体交给 Plotly 模板。

## 可调参数

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `opacity` | number | 0.7 | 气泡透明度 |
| `size_scale` | number | 1 | 气泡大小整体缩放 |

## 库之间的差异

- 该专题只提供 **Plotly** 实现：`Scatter3d` 的 `marker.size` 支持逐点数组，
  天然表达气泡大小；matplotlib `mplot3d` 的 `scatter` 也能做，但交互性与
  色条控制不如 Plotly。
