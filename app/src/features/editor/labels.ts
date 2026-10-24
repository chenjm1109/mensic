/**
 * 界面用的中文标签表。
 *
 * 案例参数、映射角色、主题、图例位置在数据层都是英文标识（要传给 Python / matplotlib），
 * 界面上不要直接把它们露出来 —— 统一在这里映射成合适的中文表述。
 */

/** 案例参数：key → 中文名（49 个，覆盖全部案例） */
export const PARAM_LABELS: Record<string, string> = {
  // 透明度 / 大小
  alpha: "透明度",
  opacity: "不透明度",
  bar_opacity: "柱体透明度",
  area_alpha: "面积透明度",
  bar_alpha: "柱子透明度",
  ring_alpha: "环透明度",
  wedge_alpha: "扇区透明度",
  cell_alpha: "色块透明度",
  contour_alpha: "等值线填充透明度",
  line_alpha: "线条透明度",
  hex_alpha: "六边形透明度",
  link_alpha: "连线透明度",
  bar_ratio: "柱体占比",
  point_alpha: "点的透明度",
  boundary_alpha: "边界不透明度",
  point_size: "点大小",
  marker_size: "标记大小",
  node_size: "节点大小",
  bar_size: "柱体尺寸",
  sizeref: "气泡基准尺寸",
  size_scale: "尺寸倍率",
  radius: "半径",
  inner_radius: "内圈半径",
  inner_offset: "内圈偏移",
  hole: "中心孔径",
  ring_width: "环宽",
  thickness: "环厚度",
  grid_width: "网格线宽",
  line_width: "线条宽度",
  bar_width: "柱子宽度",
  bar_height: "柱子高度",
  base: "起始半径",
  offset: "层间距",
  gap: "组内间距",
  gap_angle: "缺口角度",
  start_angle: "起始角度",
  explode_index: "外移扇区序号",

  // 分箱 / 网格 / 层级
  bin_width_x: "X 方向分箱宽度",
  bin_width_y: "Y 方向分箱宽度",
  grid_step: "网格步长",
  gridsize: "网格分辨率",
  levels: "等值层数",
  line_levels: "标注线层数",
  num_levels: "等值层数",
  num_layers: "层数",
  surface_count: "曲面层数",
  n_std: "椭圆范围（标准差倍数）",
  isomin: "等值面下限",
  isomax: "等值面上限",
  low: "低值参考线",
  high: "高值参考线",

  // 开关
  divider: "分隔线",
  show_labels: "显示标签",
  show_values: "显示数值",
  show_grid: "显示网格",
  show_edges: "显示边框",
  show_scale: "显示刻度",
  show_peaks: "标注峰值",
  show_projection: "显示边缘分布",

  // 枚举
  kernel: "核函数",
};

/** 少数需要一句解释的参数（在控件下方以小字显示） */
export const PARAM_HINTS: Record<string, string> = {
  base: "柱体从这个半径开始向外延伸",
  offset: "每条山脊之间的垂直间隔",
  n_std: "范围越大，椭圆包住的点越多",
  low: "低于该值的柱子会被标成另一种颜色",
  high: "高于该值的柱子会被标成另一种颜色",
  sizeref: "数值越大，气泡整体越小",
  hole: "0 为实心饼，越大中心空洞越大",
};

/** 枚举型参数：值 → 中文 */
export const ENUM_LABELS: Record<string, Record<string, string>> = {
  kernel: { linear: "线性", rbf: "径向基", poly: "多项式" },
};

/** 数据映射角色：role → 中文 */
export const ROLE_LABELS: Record<string, string> = {
  x: "X 轴",
  y: "Y 轴",
  color: "颜色",
  size: "大小",
  series: "分组",
  label: "标签",
  value: "数值",
};

/** 配色方案：主题 id → 中文 */
export const THEME_LABELS: Record<string, string> = {
  rose: "玫红",
  slate: "石板蓝",
  ocean: "海蓝",
  forest: "松绿",
  sunset: "晚霞",
  mono: "单色",
};

/** 图例位置：matplotlib loc → 中文（值仍传英文给渲染器） */
export const LEGEND_LOC_LABELS: Record<string, string> = {
  best: "自动选择",
  "upper right": "右上",
  "upper left": "左上",
  "lower right": "右下",
  "lower left": "左下",
  "center right": "右中",
  "upper center": "上中",
  "lower center": "下中",
  center: "正中",
};

// 这些标签在「取值时」翻译（映射表保持中文原文，作为词典的键）
export function paramLabel(key: string, fallback?: string): string {
  return t(PARAM_LABELS[key] ?? fallback ?? key);
}

export function enumLabel(key: string, value: string): string {
  return t(ENUM_LABELS[key]?.[value] ?? value);
}

export function roleLabel(role: string, fallback?: string): string {
  return t(ROLE_LABELS[role] ?? fallback ?? role);
}

export function themeLabel(id: string): string {
  return t(THEME_LABELS[id] ?? id);
}

export function legendLocLabel(loc: string): string {
  return t(LEGEND_LOC_LABELS[loc] ?? loc);
}
