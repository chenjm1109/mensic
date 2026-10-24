import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { TOOLBAR_PILL, ToolbarGroup } from "@/components/ui/toolbar-button";
import { TYPO } from "@/core/typography";

/** 与全站一致的缓动（见 App.tsx 的页面转场） */
const EASE = [0.4, 0, 0.2, 1] as const;
const ENTER = { duration: 0.2, ease: EASE };
const EXIT = { duration: 0.14, ease: EASE };

/**
 * 工具栏 / 搜索栏复用同一块区域。
 *
 * 关键：外层胶囊**始终存在且尺寸由工具态内容决定**，搜索态只是覆盖在它上面的绝对定位层。
 * 切换时外层盒子一个像素都不会变（不会因为测量误差 / 边框 / 换行产生抖动）。
 * 过渡用 Motion 做「工具态淡出左移 ↔ 搜索框自右淡入」，避免硬切。
 *
 * - 正常态：渲染工具栏（children），最右侧由调用方放一个搜索图标按钮
 * - 点击搜索图标：整块区域原地变成搜索框（自动聚焦）
 * - 失焦或按 Esc：恢复成工具栏；已输入的关键词保留（筛选继续生效，点分类即可清空）
 *   例外：`keepOpenWhenFilled` 时，输入框非空则失焦**不收起**（创作页的搜索即如此，
 *   见该 prop 的说明）；Esc 仍然是随时可用的显式退出。
 *
 * ⚠️ 外层是 `motion.div layout` + `overflow-hidden`：**调用方换掉 children 时胶囊轮廓会连续变形**
 * （创作页的「批量管理」就是靠它原地变成另一条工具栏，而不是在下面弹出一条新的、把页面顶下去）。
 * `overflow-hidden` 让内容跟着轮廓裁切，配合子元素的 `layout` 反向缩放，变形过程既不拉伸也不溢出。
 */
export function SearchSwap({
  value,
  onChange,
  placeholder,
  className,
  keepOpenWhenFilled = false,
  open: openProp,
  onOpenChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
  /**
   * 输入框里有内容时，失焦也保持展开（默认关闭）。
   *
   * 创作页的搜索是**跨文件夹筛选整个列表**：结果还留在下面时把搜索框收成工具栏，
   * 用户就看不出「现在看到的不是全部项目」了 —— 只有清空关键词、点别处才回到工具栏。
   * 画廊不要开：那里被搜索框盖住的正是**分类标签**，而标签是清空搜索、退出结果的入口。
   */
  keepOpenWhenFilled?: boolean;
  /**
   * 受控展开（不传则自己管）。
   * 页面级「回退」需要把搜索框一起收起来（创作页：返回 = 退出搜索），
   * 所以那边把 open 提上去；画廊仍是非受控。
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: (openSearch: () => void) => ReactNode;
}) {
  const [openState, setOpenState] = useState(false);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : openState;
  const setOpen = (next: boolean) => {
    if (!controlled) setOpenState(next);
    onOpenChange?.(next);
  };

  return (
    <motion.div
      layout
      className={cn("relative flex max-w-full items-center gap-1 overflow-hidden p-1", TOOLBAR_PILL, className)}
    >
      {/* 工具态：动画到透明但仍保留占位（不卸载），保证外层尺寸完全不变 */}
      <motion.div
        className="flex min-w-0 items-center gap-1"
        initial={false}
        animate={{ opacity: open ? 0 : 1, x: open ? -6 : 0 }}
        transition={open ? EXIT : ENTER}
        style={{ pointerEvents: open ? "none" : undefined }}
        aria-hidden={open}
      >
        <ToolbarGroup className="flex min-w-0 items-center gap-1">{children(() => setOpen(true))}</ToolbarGroup>
      </motion.div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.label
            key="search"
            className="absolute inset-0 flex items-center gap-2.5 px-4"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={ENTER}
          >
            <Search className="size-4 shrink-0 text-ink-3" />
            <input
              autoFocus
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onBlur={() => {
                // 有内容且允许保持展开时不收起：搜索结果是「当前视图」的一部分，
                // 收起搜索框会让工具栏装作没在筛选（见 keepOpenWhenFilled 的说明）
                if (!keepOpenWhenFilled || !value.trim()) setOpen(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
              }}
              placeholder={placeholder}
              className={cn(TYPO.body, "min-w-0 flex-1 bg-transparent outline-none placeholder:text-ink-4")}
            />
          </motion.label>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
