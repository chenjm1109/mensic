# 带分类边界散点图

在二维平面上展示三个类别的样本，并用底色区域画出分类器的决策边界，直观呈现"模型如何切分空间"。

## 要点

- **决策边界**：用 `sklearn.svm.SVC` 训练一个分类器，在规则网格上预测类别，再用 `contourf` 以半透明底色铺出分类区域（`boundary_alpha` 控制透明度）。
- **分组散点**：三类样本用分类色板前三种颜色绘制，`point_alpha` 让重叠点仍可辨认。
- **实现只画 marks**：标题、坐标轴标签、刻度间距与图例位置全部由 `meta.yaml` 的 `presentation` 施加。
- 数据由原脚本 `seed=7` 生成的 240 个样本固化到 `data/points.csv`，保证可复现。

## 可调参数

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `grid_step` | number | 0.5 | 决策网格步长，越小边界越平滑但越慢 |
| `boundary_alpha` | number | 0.2 | 分类底色的透明度 |
| `point_size` | number | 100 | 散点大小 |
| `point_alpha` | number | 0.5 | 散点透明度 |
| `kernel` | enum | linear | SVM 核函数：linear / rbf / poly |

## 库之间的差异

- 仅提供 **matplotlib** 实现：分类边界需要训练模型并对网格做栅格预测，属于静态、命令式的绘制流程。
- 实现允许 `import sklearn`，但不得 `import pydata_viz`；配色统一从 `params["tokens"]["color"]["palette"]` 读取。
