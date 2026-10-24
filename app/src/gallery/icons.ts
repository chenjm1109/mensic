// 案例分类 → 图标（画廊分类标签与项目卡片共用，保持一致）
import { Box, ChartArea, ChartColumn, ChartLine, ChartPie, ChartScatter, Flame } from "lucide-react";

export const CATEGORY_ICON: Record<string, typeof ChartScatter> = {
  scatter: ChartScatter,
  area: ChartArea,
  heatmap: Flame,
  bar: ChartColumn,
  pie: ChartPie,
  line: ChartLine,
  plotly3d: Box,
};

export function categoryIcon(category: string | undefined) {
  return (category && CATEGORY_ICON[category]) || ChartScatter;
}
