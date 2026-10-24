import { createContext, forwardRef, useContext, useId, type ButtonHTMLAttributes, type ReactNode } from "react";
import { motion } from "motion/react";
import { SketchHighlight } from "@/components/sketch";
import { cn } from "@/lib/utils";
import { TYPO } from "@/core/typography";

/** 强调色（手绘底色的颜色） */
const ACCENT = "var(--brand)";

/** 手绘底色滑动到另一个按钮时的动效（与全站缓动一致） */
const GLIDE = { type: "tween", duration: 0.22, ease: [0.4, 0, 0.2, 1] } as const;

/** 由按钮名派生一个稳定的种子 —— 让每个按钮的手绘底色笔触略有不同，而不是整屏一样 */
function seedOf(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return 1 + (Math.abs(h) % 97);
}

/* ---------------- 按钮组：让手绘底色在按钮之间「滑动」 ---------------- */

/** 组内只共享一个 layoutId 命名空间；hover 反馈交给 CSS，不参与「选中」底色的滑动 */
const GroupCtx = createContext<string | null>(null);

/**
 * 工具栏按钮组。组内共用一个 layoutId 的手绘底色：
 * **只有当选中项真的变化时**（点击/切换动作），Motion 才把这块底色平移/缩放到新位置。
 * 鼠标悬停只给一层浅色底（CSS），不会带走「当前选中」的底色。
 */
export function ToolbarGroup({ children, className }: { children: ReactNode; className?: string }) {
  const id = useId();
  return (
    <GroupCtx.Provider value={id}>
      <div className={className}>{children}</div>
    </GroupCtx.Provider>
  );
}

/** 会滑动的手绘底色（同一组内共用 layoutId） */
function GlidingHighlight({ layoutId, seed, color = ACCENT }: { layoutId: string; seed: string | number; color?: string }) {
  const n = typeof seed === "number" ? seed : seedOf(seed);
  return (
    <motion.span
      layoutId={layoutId}
      transition={GLIDE}
      className="pointer-events-none absolute inset-0"
      aria-hidden="true"
    >
      <SketchHighlight color={color} radius={999} seed={n} className="block size-full" />
    </motion.span>
  );
}

/**
 * 手绘强调底色（没有按钮组时的回退：纯 CSS 淡入淡出）。
 * 放进 <ToolbarGroup> 后会自动改用会滑动的版本。
 */
export function ToolbarHighlight({
  active = false,
  color = ACCENT,
  seed = "",
}: {
  active?: boolean;
  color?: string;
  seed?: string | number;
}) {
  const n = typeof seed === "number" ? seed : seedOf(seed);
  return (
    <SketchHighlight
      color={color}
      radius={999}
      seed={n}
      className={cn("pointer-events-none absolute inset-0 transition-opacity duration-150", active ? "opacity-100" : "opacity-0")}
    />
  );
}

/**
 * 工具栏按钮共用样式：统一高度 / 圆角 / 图标与文字间距 / 字号。
 *
 * 两种状态**视觉上明确区分**：
 * - 悬停：一层很浅的暖底色（`hover:bg-…`），只表示「可以点」，不参与选中态；
 * - 选中：手绘墨迹底（`GlidingHighlight`），**只在切换动作真的发生时**滑到新位置。
 * 另外选中不改变文字颜色（墨迹上红字不易辨认，前景色与未选中一致）。
 */
export function toolBtnClass(_active = false, primary = false, danger = false, compact = false): string {
  return cn(
    TYPO.body,
    "group/btn relative inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-full transition-colors",
    "disabled:pointer-events-none disabled:opacity-35",
    compact ? "gap-1.5 px-2.5" : "gap-2 px-3.5",
    "hover-sketch",
    primary ? "font-medium text-[var(--brand-deep)]" : danger ? "text-[#c0392b] dark:text-[#e8705f]" : "text-ink-2",
  );
}

/** 工具栏外框：一条胶囊容器（工具栏 / 分类标签组都用它） */
export function toolBarClass(className?: string, opts?: { floating?: boolean }): string {
  return cn(
    "flex items-center gap-1 rounded-full border p-1",
    opts?.floating ? FLOATING_SURFACE : "border-line bg-surface",
    className,
  );
}

/**
 * 悬浮在内容之上的工具条外观（半透明、无模糊）。
 * 编辑器的「缩放条」用它；返回按钮与卡片角标改用下面那套「只描边、不投影」的。
 * 高度仍然完全一致：都是 `p-1 + size-9 + 1px 描边`，所以量出来必然是同一个高度。
 */
export const FLOATING_SURFACE = "border-line/80 bg-surface/25 shadow-[0_2px_10px_-6px_rgba(90,70,45,0.35)]";

/**
 * 「只描边、不投影」的悬浮控件外观。
 *
 * 返回按钮、以及创作页卡片四角的角标（类型 icon / ⋯ / 收藏星）都用这一套：
 * 边线就是工具栏外框那条（`border-line`、1px，与 `TOOLBAR_PILL` 完全同款），
 * 但**一律不加阴影** —— 这些控件要么压在图表上、要么紧挨工具栏，投影只会显脏，
 * 靠「1px 描边 + 半透明底」区分层次就够了。
 */
export const OUTLINED_SURFACE = "border border-line bg-surface/25";

/** 同上，底子更实：角标压在图表上，图标/文字得看得清 */
export const OUTLINED_CHIP = "border border-line bg-surface/85";

/** 工具栏内的竖向分隔线 */
export function ToolbarDivider({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("mx-0.5 h-5 w-px shrink-0 bg-line", className)} />;
}

interface ToolbarButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: ReactNode;
  label?: string;
  active?: boolean;
  primary?: boolean;
  danger?: boolean;
  compact?: boolean;
  /** 是否需要手绘底色（默认需要；下拉菜单的触发器由外层自行渲染） */
  highlight?: boolean;
  /**
   * 选中底色是否参与「组内滑动」。
   * - true（默认）：与互斥的同类项（如标签/分段）共用一块墨迹，切换时滑动；
   * - false：独立开关（批量模式、搜索、面板开关…）用各自的淡入淡出，
   *   避免同一组里出现两个共用 layoutId 的墨迹（会互相抢位、闪烁）。
   */
  glide?: boolean;
}

export const ToolbarButton = forwardRef<HTMLButtonElement, ToolbarButtonProps>(function ToolbarButton(
  { icon, label, active, primary, danger, compact, highlight = true, glide = true, className, title, disabled, ...rest },
  ref,
) {
  const groupId = useContext(GroupCtx);
  const seed = label ?? title ?? "";

  return (
    <button
      ref={ref}
      type="button"
      title={title ?? label}
      disabled={disabled}
      className={cn(toolBtnClass(active, primary, danger, compact), className)}
      {...rest}
    >
      {/* 只有「选中」才画手绘墨迹；悬停只是 CSS 浅底色 */}
      {highlight &&
        (groupId && glide ? active && <GlidingHighlight layoutId={`${groupId}-active`} seed={seed} /> : <ToolbarHighlight active={active} seed={seed} />)}
      {icon && <span className="relative grid place-items-center">{icon}</span>}
      {label && <span className="relative">{label}</span>}
    </button>
  );
});

/** 只有图标、没有文字的工具栏按钮（与 ToolbarButton 同高同圆角） */
export const ToolbarIconButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { icon: ReactNode; active?: boolean; glide?: boolean }
>(function ToolbarIconButton({ icon, active, glide = true, className, title, ...rest }, ref) {
  const groupId = useContext(GroupCtx);

  return (
    <button
      ref={ref}
      type="button"
      title={title}
      aria-label={title}
      className={cn(
        "group/btn relative grid size-9 shrink-0 place-items-center rounded-full transition-colors",
        "text-ink-2 hover-sketch",
        className,
      )}
      {...rest}
    >
      {groupId && glide ? (
        active && <GlidingHighlight layoutId={`${groupId}-active`} seed={title ?? ""} />
      ) : (
        <ToolbarHighlight active={active} seed={title ?? ""} />
      )}
      <span className="relative grid place-items-center">{icon}</span>
    </button>
  );
});

/** 工具栏 / 搜索框共用的胶囊外框 */
export const TOOLBAR_PILL = "rounded-full border border-line bg-surface";
