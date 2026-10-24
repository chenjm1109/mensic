/**
 * 间距规范 —— 全站统一，页面里不要再随手写数值。
 *
 * 基准：**4px 栅格**（Tailwind 的 spacing step，1 step = 4px）。
 * 这里以「用途」命名（而不是数值），避免各页面自行发挥：
 *
 * - gutter 32px  页面四边留白（上下左右同值 → 视觉对称）
 * - section 24px 区块之间（如「顶部控件区 → 内容区」）
 * - group 12px   相关控件之间
 * - inline 8px   组内元素之间
 * - tight 4px    紧邻元素（图标与文字等）
 * - stack 20px   纵向堆叠的一组同类元素（详情页的标题/描述/标签/按钮）
 *
 * 只允许使用下列 class（Tailwind 需要字面量才能扫到），不要在页面里写 `mt-[18px]` 这种裸值。
 */
export const SP = {
  /** 页面四边留白 = 32px */
  gutter: "p-8",
  gutterX: "px-8",
  gutterTop: "pt-8",
  gutterBottom: "pb-8",
  gutterLeft: "pl-8",
  gutterRight: "pr-8",

  /** 区块之间 = 24px */
  section: "mt-6",
  /** 相关控件之间 = 12px */
  group: "mt-3",
  /** 组内元素之间 = 8px */
  inline: "gap-2",
  /** 紧邻元素 = 4px */
  tight: "gap-1",
  /** 纵向堆叠组 = 20px */
  stack: "gap-5",
} as const;
