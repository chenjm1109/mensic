import type { ReactNode } from "react";
import { useGoUp } from "@/app/nav";
import { BackButton, FLOATING_INSET } from "@/components/ui/back-button";
import { SP } from "@/core/spacing";
import { cn } from "@/lib/utils";

/**
 * 页面顶部：返回按钮在左上角，页面内容居中。
 *
 * 返回按钮刻意放在**页面内容里**而不是标题栏 —— 标题栏在 Web / Android / iOS 下整条不渲染，
 * 放在那里等于没有回退入口。
 *
 * 位置（**与图像编辑区的返回按钮严格同一坐标**）：
 * - 左边距全站统一为 `FLOATING_INSET`（= 编辑区右上那组 Tab 的右边距），
 *   跨页面连续点击时鼠标不必横向移动；
 * - 纵坐标也用编辑区那一个：编辑区是 `top-4`（悬浮工具条那一行），所以这里同样落在 **16**。
 *   实现上用 `relative + -top-4` **只挪视觉位置、不占位** —— 行高仍由原来的子元素决定，
 *   标题 / 标签 / 下方内容的坐标一个都不动（否则设置页那种「按钮就是最高元素」的行会矮掉 16px）。
 */
export function PageTopBar({
  children,
  className,
  onBack,
  backTitle,
  leading,
}: {
  children?: ReactNode;
  className?: string;
  /** 覆盖默认的「返回上一级」行为（创作页用它先播完退出动效再切目录） */
  onBack?: () => void;
  /**
   * 覆盖返回按钮的 title / 无障碍标签。
   * `onBack` 改成「不是返回上一级」的动作时（例如创作页在根目录先退出批量管理）必须一起给，
   * 否则提示还写着「返回主页」，读屏与悬停提示都在说谎。
   */
  backTitle?: string;
  /**
   * 紧贴返回按钮右侧的「页面标题 / 面包屑」。
   *
   * ⚠️ 它**不占位、也不参与居中**：左列宽度仍是固定的 `sideW`，标题只是顺着往右长
   * （长了会跟中间那块叠在一起，所以调用方自己限宽 —— 放不下干脆隐藏，见创作页的说明）。
   * 这样**中间那块（工具栏 / 分类 Tab 组）在任何页面都落在同一坐标、同一高度** ——
   * 页面之间来回切时它不会上下跳。标题自己的纵坐标也不变（`pt-8` 行顶）。
   */
  leading?: ReactNode;
}) {
  const goUp = useGoUp();
  // 左列比按钮本身宽出「FLOATING_INSET − 32」，右侧用同宽占位，中间内容才是真正居中
  const sideW = 44 + (FLOATING_INSET - 32);

  return (
    <div className={cn("flex shrink-0 items-start gap-4", SP.gutterTop, SP.gutterX, className)}>
      <div className="flex shrink-0 items-center justify-start" style={{ width: sideW, paddingLeft: FLOATING_INSET - 32 }}>
        {goUp && (
          <div className="relative -top-4">
            <BackButton
              onClick={onBack ?? goUp.go}
              title={backTitle ?? t("返回{target}", { target: t(goUp.label) })}
            />
          </div>
        )}
        {/* `h-9`：与返回按钮的内径（size-9）同高 —— 保证标题**撑不动左列**，
            也不会把返回按钮顶下去（实测：不加时左列被撑到 52，返回按钮从 y=16 掉到 21）。
            标题自己 26px 的行盒比这高没关系，`items-center` 会把文字居中。 */}
        {leading && <div className="relative -top-4 ml-3 flex h-9 shrink-0 items-center">{leading}</div>}
      </div>
      {/*
        ⚠️ 中间这块（工具栏 / 分类 Tab 组）必须带 `-top-4`：返回按钮为了和编辑区的悬浮工具条
        对齐，视觉上是**抬高 16px** 画的（同样是 `-top-4`）。中间这块不带就等于比它低 16px
        —— 看起来「矮了一截、没对齐」。两者都用 `-top-4` 之后，**垂直中心严格一致**
        （实测：按钮 45×45 中心 y=39，胶囊 45 高中心 y=39）。
        `relative` 只挪视觉位置、不占位，所以整条顶栏的高度不变。
      */}
      <div className="relative -top-4 flex min-w-0 flex-1 flex-col items-center">{children}</div>
      {/* 右侧对称占位：保证中间内容真正居中 */}
      <div className="shrink-0" aria-hidden="true" style={{ width: sideW }} />
    </div>
  );
}
