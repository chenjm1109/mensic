import { ArrowLeft } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { OUTLINED_SURFACE } from "./toolbar-button";

/**
 * 悬浮控件的标准内缩（px）。
 *
 * 编辑区右上那组 Tab 是在「与参数栏等宽（340）的贴右容器」里居中的，于是它距窗口右边的
 * 边距 = (340 − 该组宽度) / 2 ≈ 35px。全站所有「返回按钮」都用同一个内缩，左右两侧对称。
 */
export const FLOATING_INSET = 35;

/**
 * 悬停 / 按下的手感。
 *
 * ⚠️ 这里**必须用弹簧（Motion），不能用 CSS transition**：
 * `:active` 在真实点击里只持续几十毫秒，而 CSS 过渡要 160ms 才走到终点 ——
 * 结果是「按下去」几乎看不见（踩过）。弹簧是即时响应，按下瞬间就开始压。
 *
 * 两档分开配：悬停慢慢抬起来（有点过冲，手感轻）；按下要**硬**（stiffness 900），
 * 这样哪怕只是快速点一下，也能在一帧两帧内压到位，而不是慢慢往下沉。
 */
const HOVER_SPRING = { type: "spring", stiffness: 420, damping: 28 } as const;
const TAP_SPRING = { type: "spring", stiffness: 900, damping: 36 } as const;

/**
 * 页面内的大号返回按钮。
 * Web / Android / iOS 下顶部标题栏为空白（没有面包屑），回退由它承担；
 * 桌面端标题栏仍有面包屑，这个按钮作为更直观的「上一级」入口并存。
 *
 * 尺寸与悬浮工具条（缩放条 / 切换条）严格一致：`p-1 + size-9 + 1px 描边`，
 * 所以并排放在一起时高度完全相同；**位置由调用方统一按 `FLOATING_INSET` 摆放**
 * （编辑区里是 `top-4`，各页面里也放在同一坐标）。
 *
 * 外观：**只描边、不投影**（`OUTLINED_SURFACE`），边线与创作页工具栏外框同款（`border-line`）。
 *
 * 反馈动效：
 * - **悬停**：底子变实一点 + 整体放大到 1.06 + **箭头往左挪 3px**（回退的方向暗示）；
 * - **按下**：压到 0.9、底子再实一点，箭头**归位**（不再往外探）—— 明确「按下去了」。
 */
export function BackButton({
  onClick,
  title = t("返回上一级"),
  className,
}: {
  onClick: () => void;
  title?: string;
  className?: string;
}) {
  return (
    <motion.button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      initial={false}
      whileHover="hover"
      whileTap="tap"
      variants={{
        hover: { scale: 1.06, transition: HOVER_SPRING },
        tap: { scale: 0.9, transition: TAP_SPRING },
      }}
      transition={HOVER_SPRING}
      className={cn(
        "group grid shrink-0 place-items-center rounded-full p-1",
        OUTLINED_SURFACE,
        // 只有底色走 CSS（160ms、与 .hover-sketch 同缓动）；缩放交给 Motion，别两边都动
        "text-ink-2 transition-colors duration-[160ms] ease-[cubic-bezier(0.4,0,0.2,1)]",
        "hover:bg-surface/70 active:bg-surface/90",
        className,
      )}
    >
      <span className="grid size-9 place-items-center">
        <motion.span
          variants={{ hover: { x: -3, transition: HOVER_SPRING }, tap: { x: 0, transition: TAP_SPRING } }}
          transition={HOVER_SPRING}
          className="grid place-items-center"
        >
          <ArrowLeft className="size-5" strokeWidth={1.9} />
        </motion.span>
      </span>
    </motion.button>
  );
}
