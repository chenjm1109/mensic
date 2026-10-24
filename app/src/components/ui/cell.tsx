import * as React from "react";
import { ChevronRight } from "lucide-react";
import { TYPO } from "@/core/typography";
import { cn } from "@/lib/utils";

/**
 * Cell —— 全应用**唯一**的设置项布局：
 * 左列是标题（下面可有一行说明），右列是控件（下拉 / 输入框 / 开关 / 色板 / 按钮…）。
 *
 * 布局照 shadcn/ui 的 `Field`（orientation=horizontal）与 `Item` 改写：
 * 结构语义（role=group、可点行、编组）沿用它们，但颜色、字号、间距全换成本应用的
 * 语义 token 与 `TYPO`（细边框、无阴影、无圆角阴影），所以**不要**去 import 那份官方组件。
 *
 * 使用规则：
 *  1. 单个设置项 → 单个 `<Cell>`；相互有关联的项 → `<CellGroup>`（组内自动加发丝分隔线，
 *     可给组标题与组脚注）。
 *  2. 控件多、或需要整行时才把控件放到标题下方（滑块、按钮组、分段选择器、色板）——
 *     直接写成 Cell 的 children 即可；要同时保留右列控件（例如「数字框在右、滑块在下」）
 *     就两边都给。
 *  3. 控件默认贴右边缘；需要整列等宽（下拉、数字框）由 `CellGroup` 的 `controlWidth` 统一；
 *     需要控件撑满剩余宽度（对话框里那种长下拉）用 Cell 的 `controlFill`。
 *  4. 整行可点（打开弹窗、跳到别的页面这种「动作格」）用 `onClick`，可选 `chevron` 给指示；
 *     ⚠️ 可点的 Cell 里**不要**再放交互控件（button 嵌 button 是非法 HTML）。
 *  5. 颜色只用语义 token；按压反馈用 CSS `:active`，不要用 Motion（见 AGENTS.md）。
 *  6. 组容器两档外观：默认 `boxed`（发丝边 + 次级底色的卡片式编组），编辑器侧边栏用
 *     `variant="plain"`（**无边框、无底色**，行直接铺开，只留极淡的行间分隔线）。
 */

type CellSize = "sm" | "md";

/** 编组上下文：给组内所有 Cell 统一尺寸档、控件列宽与「是否有卡片容器」 */
const CellGroupCtx = React.createContext<{ size: CellSize; controlWidth?: string; plain: boolean }>({
  size: "sm",
  plain: false,
});

function CellGroup({
  title,
  footnote,
  size = "sm",
  controlWidth,
  variant = "boxed",
  boxClassName,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  /** 组标题（例如「外观」「结构」）；不传就不显示 */
  title?: string;
  /** 组脚注：整组共用的一句说明 */
  footnote?: React.ReactNode;
  /** 尺寸档：sm = 参数栏；md = 设置页（字号更大、行距更松） */
  size?: CellSize;
  /** 组内控件列的固定宽度（如 "168px"），让下拉/数字框左右对齐 */
  controlWidth?: string;
  /**
   * 外观：`boxed`（默认）= 带发丝边与次级底色的卡片式编组（适合设置页、对话框）；
   * `plain` = **不要卡片容器也不要底色**，行直接铺开（适合编辑器侧边栏这种已经很紧凑的面板）。
   */
  variant?: "boxed" | "plain";
  /** 加到「组容器」那个 div 上（例如限高滚动 max-h-[26vh] overflow-y-auto） */
  boxClassName?: string;
}) {
  const plain = variant === "plain";
  return (
    <CellGroupCtx.Provider value={{ size, controlWidth, plain }}>
      <div className={cn("flex flex-col gap-1.5", className)} {...props}>
        {/* 组标题 = **表头**（仅 plain 组，例如编辑器侧边栏）：压一条发丝线，
            把标题和它管的那些行绑在一起；否则它只是一句飘在上面的小灰字。
            ⚠️ 文字色用**主题色**（`--brand-strong`，亮/暗两套都由 brandTokens 推好），
            不能用 `ink-3`：那个灰和组内说明 / 脚注是同一个色，标题会跟注释混成一片。
            ⚠️ 这条线也用主题色（`--brand-line`），**不是**行间那条 `line-2` ——
            同名灰线会让人分不清「组与组的边界」和「组内行与行的分隔」。
            主题色只在 plain（参数栏）上，boxed（设置页）的标题在卡片外、卡片自带边框自成一组，
            继续用小灰字即可（两边都上色反而到处都是强调色）。
            不写 px-1：标题文字要和下面各行的标题左对齐（px-1 会让它偏右 4px）。 */}
        {title && (
          <div
            className={cn(
              TYPO.caption,
              "font-medium",
              plain ? "border-b border-[var(--brand-line)] pb-1 text-[var(--brand-strong)]" : "px-1 text-ink-3",
            )}
          >
            {title}
          </div>
        )}
        {/* 组容器：boxed 只给发丝边（**白底**，不要任何淡黄底色）；plain 连边框都不要。
            两种变体都在组内相邻两项之间加分隔（第一项上面不加）。 */}
        <div
          data-slot="cell-group"
          className={cn(
            "[&>*+*]:border-t",
            plain
              ? "[&>*+*]:border-line-2"
              : "overflow-hidden rounded-xl border border-line bg-surface [&>*+*]:border-line",
            boxClassName,
          )}
        >
          {children}
        </div>
        {/* 组脚注（如果有）：给它自己一点底部内边距 —— 侧边栏分区的内容区底部不留内边距
            （最后一个 Cell 要贴着手风琴底边），所以脚注得自带一点，免得贴着分隔线。 */}
        {footnote && (
          <div className={cn(TYPO.caption, "pb-1 leading-relaxed text-ink-3")}>{footnote}</div>
        )}
      </div>
    </CellGroupCtx.Provider>
  );
}

function Cell({
  title,
  desc,
  hint,
  icon,
  control,
  restore,
  controlFill,
  onClick,
  disabled,
  chevron,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "title" | "onClick"> & {
  /** 左侧标题（可省略：省略时这一行交给 `children` 自定义排布，比如「控件在左、名字在右」） */
  title?: React.ReactNode;
  /** 标题下面的一行说明（可省略） */
  desc?: React.ReactNode;
  /** 整行下方的脚注（比说明更弱，例如参数的含义提示） */
  hint?: React.ReactNode;
  /** 标题前的小图标 */
  icon?: React.ReactNode;
  /** 右列控件 */
  control?: React.ReactNode;
  /**
   * 控件左侧的「恢复默认」入口（传 `RestoreButton`）。
   *
   * 它被渲染成控件列的**第一个**子项，永远贴着控件；`RestoreButton` 自带负外边距，
   * 在布局上不占宽度 —— 所以它出现时输入框 / 下拉**不会被压窄**（画布尺寸、数字框都踩过）。
   * ⚠️ 这个做法假设控件列是固定宽度（`controlWidth`），`controlFill` 的行不要用它。
   */
  restore?: React.ReactNode;
  /** 控件撑满剩余宽度：标题保持自然宽度，**控件吃掉剩下的全部**（长下拉 / 长输入框） */
  controlFill?: boolean;
  /** 整行可点（动作格）；给 onClick 时这一行会渲染成 button */
  onClick?: () => void;
  disabled?: boolean;
  /** 可点的时候右侧给一个指示箭头 */
  chevron?: boolean;
  /** 标题下方的整行控件（滑块、按钮组、色板…） */
  children?: React.ReactNode;
}) {
  const { size, controlWidth, plain } = React.useContext(CellGroupCtx);
  const interactive = typeof onClick === "function";
  const Tag = (interactive ? "button" : "div") as "button";

  const titleClass = size === "md" ? TYPO.bodyLg : TYPO.label;
  const descClass = size === "md" ? TYPO.body : TYPO.caption;
  // plain（侧边栏）时行不缩进：与分区标题左对齐，不再套一层卡片内边距。
  // boxed 用 px-3：与对话框里「整行按钮」的内容左缘对齐（按钮是 1px 边框 + px-3）。
  const pad = cn("gap-1 py-2", !plain && (size === "md" ? "px-4 py-3.5" : "px-3"));

  return (
    <Tag
      {...(props as React.ComponentProps<"button">)}
      {...(interactive ? { type: "button" as const, onClick, disabled } : {})}
      data-slot="cell"
      className={cn(
        "group/cell flex w-full flex-col text-left",
        pad,
        interactive && "transition-colors duration-150 hover:bg-surface-3 active:bg-surface-3",
        interactive && disabled && "pointer-events-none opacity-45",
        className,
      )}
    >
      {/* 没有 title 时这一行就只有 children（自定义排布），不用再包一层标题行 */}
      {title !== undefined && (
        // ⚠️ `min-h-8`：这一行的高度**不能**由控件自己决定（色块 28 / 输入框 32 / 开关 20 各不一样，
        //    同一个分区里会出现三种行高）。统一到 32px 并把控件垂直居中，整列行高才齐。
        <span className="flex min-h-8 w-full items-center gap-2.5">
          {icon && (
            <span
              aria-hidden="true"
              className={cn(
                "shrink-0 [&_svg]:size-4",
                // 动作格（可点）给主题色，纯信息行给弱色，别让每行都在抢注意力
                interactive && !disabled ? "text-[var(--brand-strong)]" : "text-ink-3",
              )}
            >
              {icon}
            </span>
          )}
          {/* 标题列：`controlFill` 时保持自然宽度（可收缩、不撑开），把剩余宽度留给控件；
              否则吃掉剩余宽度，让右列控件（有 controlWidth 时）左边缘整齐 */}
          <span className={cn("flex min-w-0 flex-col", controlFill ? "flex-initial" : "flex-1")}>
            <span className={cn(titleClass, "font-medium text-ink")}>{title}</span>
            {desc && <span className={cn(descClass, "mt-0.5 leading-snug text-ink-3")}>{desc}</span>}
          </span>
          {(control || restore) && (
            // 恢复入口是控件列里的**第一个**子项（保证它永远贴着控件），但它自带负外边距
            // （见 RestoreButton），在布局上不占宽度 → 输入框 / 下拉不会被压窄。
            <span
              className={cn("flex items-center justify-end gap-1.5", controlFill ? "min-w-0 flex-1" : "shrink-0")}
              style={!controlFill && controlWidth ? { width: controlWidth } : undefined}
            >
              {restore}
              {control}
            </span>
          )}
          {interactive && chevron && <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-ink-4" />}
        </span>
      )}
      {children && <span className={cn("block w-full", title !== undefined && "mt-1.5")}>{children}</span>}
      {hint && <span className={cn(TYPO.caption, "mt-0.5 block leading-snug text-ink-3")}>{hint}</span>}
    </Tag>
  );
}

export { Cell, CellGroup };
