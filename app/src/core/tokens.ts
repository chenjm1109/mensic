// 设计令牌（取自 mensic 设计稿：浅色 + 蓝色强调）
// 说明：桌面端采用浅色现代 SaaS 风格，与网站端的 Editorial 单色杂志风不同。

export const PALETTE = [
  "#3B82F6",
  "#EF4444",
  "#F59E0B",
  "#10B981",
  "#8B5CF6",
  "#EC4899",
  "#14B8A6",
  "#F97316",
];

// 连续色（热力图）
export const COLORSALES: { label: string; value: string }[] = [
  { label: "蓝-白-红", value: "RdBu" },
  { label: "红-黄-蓝", value: "RdYlBu" },
  { label: "蓝渐变", value: "Blues" },
  { label: "红渐变", value: "Reds" },
  { label: "绿-黄", value: "YlGn" },
  { label: "橙-红", value: "YlOrRd" },
  { label: "Viridis", value: "Viridis" },
  { label: "Cividis", value: "Cividis" },
];

export const FONT_FAMILY =
  '"Inter", "Microsoft YaHei", "PingFang SC", "Noto Sans SC", system-ui, sans-serif';
