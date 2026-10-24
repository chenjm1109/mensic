import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { PAPER_TORN_DEFAULT_SEED, PAPER_TORN_DEFAULT_SHAPE, tornClipPath } from "./torn";

/**
 * 纸张卡片的通用外观：撕边纸片层 + **跟着撕边轮廓走**的投影。
 *
 * 全站所有「纸」（首页入口纸、图鉴卡片、创作卡片、文件夹卡片）都走这里，
 * 保证**画法**一致；**只有底色分两种**（见 `PaperTone`）：
 * 首页入口保留暖纸色，图鉴 / 创作里的卡片用纯白。内容由调用方自己放在容器里（记得加 `relative`）。
 *
 * 毛边形状**每张卡不同**：传 `seed`（一般是案例 / 项目 id）即可，同一 id 永远同一形状
 * （种子生成见 `ui/torn.ts`，有缓存）。不传 `seed` 就用首页那三张纸的固定形状。
 *
 * ## ⚠️ 为什么是「SVG path 填色 + CSS filter 投影」，别再改成 canvas 烘焙（实测否决）
 *
 * 曾经为了去掉 `filter`，把「撕边 + 投影」烘焙成 `<canvas>` 位图。**结果是全面变差**：
 * 1. 投影要溢出纸面 ~31px，于是画布必须向外扩 —— 而**创作页的瀑布流是 CSS `columns`**，
 *    Chromium 有一条硬规则：**脱离文档流、且溢出 multicol 子元素的盒子，包含块会被提升为分片容器**。
 *    除第一张卡外，所有纸层都按**整个容器**定位（实测：卡片 355×293，纸层变成 803×644、偏移 -413），
 *    纸层与卡片彻底对不上。`contain: layout / paint / content`、`isolation` 都拦不住。
 * 2. 即使把结构改回不溢出（画布 `inset-0`、投影交给外层 filter），**帧率反而更差**：
 *    同样一页图鉴，SVG 路径版 162 FPS / 0 长帧，canvas 版只有 29 FPS / 11 个长帧。
 *
 * 真正有效的优化是「**去掉 `clip-path: url(#…)`**」那一步（`filter` 里再套 URL clip-path 会让 Blink
 * 每次挂载做几何映射 + 蒙版合成，每卡 ~5.5ms）—— 保留；烘焙不是。
 *
 * 想让投影也不再走 filter，前提是把创作页的瀑布流从 CSS `columns` 换成 flex/grid 分栏（另一件事）。
 */

/**
 * 投影：零偏移均匀光晕（让上/左/右三边浮起来）+ 一条「接触 + 环境」的合并投影。
 *
 * ⚠️ **只允许两条 `drop-shadow`**：链式 filter 的输入是**上一条的输出**（已模糊过、更大的面），
 * 所以成本不是线性叠加而是滚起来的。实测（图鉴切分类，240Hz 屏，掉帧 = 单帧 >20ms）：
 *   3 条 → 45~49 个掉帧、帧率腰斩；2 条 → **0 个掉帧**；0 条 → 0 个掉帧（下界）。
 * 原来的第 2/3 条（接触 `0 2px 4px .033` + 环境 `0 5px 8px .053`）数学上等价于
 * 一条 `0 3.5px 7px .085`（对 1D 高斯复合的最小二乘拟合，**误差 <1/255**，肉眼不可分），
 * 于是合并成一条即可 —— 观感不变，成本减半。要再调投影，照这个办法拟合，别再往上加条数。
 */
const PAPER_FILTER =
  "drop-shadow(0 0 6px rgba(70,58,40,0.05)) drop-shadow(0 3.5px 7px rgba(82,68,46,0.085))";
/** 抬起 / 悬停时略强一点（同样两条：光晕 + 合并后的下沉投影，误差 1/255） */
const PAPER_FILTER_RAISED =
  "drop-shadow(0 0 8px rgba(70,58,40,0.068)) drop-shadow(0 6.5px 14px rgba(84,70,47,0.128))";

/**
 * 纸面颜色。外形（毛刺边、投影）两套完全相同，只有底色不同：
 * - `paper`：首页入口那三张，暖纸色、微微泛黄；
 * - `white`：图鉴 / 创作里的卡片，纯白（亮色下 `--surface` 就是 #ffffff），
 *   暗色下取次级底 `--surface-2`，仍比页面底略亮，卡片不会糊进背景。
 */
export type PaperTone = "paper" | "white";

const PAPER_FILL: Record<PaperTone, string> = {
  paper: "fill-[#fdfcf8] dark:fill-[#232120]",
  white: "fill-surface dark:fill-surface-2",
};

/** 归一化（0..1）路径用的画布：`viewBox` 0..1 + `preserveAspectRatio="none"` 等价于 objectBoundingBox */
const PATH_BOX = {
  viewBox: "0 0 1 1",
  preserveAspectRatio: "none",
} as const;

export function PaperLayers({
  tone = "paper",
  raised = false,
  selected = false,
  seed,
  className,
}: {
  tone?: PaperTone;
  /** 抬起状态（悬停 / 聚焦）：投影略强（filter 过渡，300ms） */
  raised?: boolean;
  /**
   * 选中态（批量模式）：在纸面上压一层主题色掩膜 + 一圈描边。
   * **掩膜跟着这张纸自己的毛边走** —— 所以它必须和 `seed` 一起用：
   * 圆角矩形的掩膜压在毛边纸上，四角与边上都会露馅（曾经就是这样）。
   */
  selected?: boolean;
  /**
   * 毛边形状的种子（案例 id / 项目 id / 文件夹 id…）。
   * 传了 → 这张卡自己一款毛边（同一 id 永远同一形状，不会每次进页面重掷）；
   * 不传 → 用首页那三张纸的固定形状（并排的一套，形状一致）。
   */
  seed?: string;
  className?: string;
}) {
  // 形状只跟 seed 有关，且 torn.ts 里有缓存：列表滚动 / 重渲染都不会重算
  const d = useMemo(
    () => (seed === undefined ? tornClipPath(PAPER_TORN_DEFAULT_SEED, PAPER_TORN_DEFAULT_SHAPE) : tornClipPath(seed)),
    [seed],
  );
  return (
    <>
      {/*
        纸 + 投影。⚠️ **这一层是被 `filter: drop-shadow(...)` 光栅化的**：浏览器会把整棵子树
        渲染进一个离屏缓冲、再糊出投影，所以**每一次重绘都要重跑一遍**，塞进来的东西越复杂越贵。
      */}
      <span
        aria-hidden
        className={cn("pointer-events-none absolute inset-0 transition-[filter] duration-300", className)}
        // ⚠️ 这个 span 必须保持 `inset-0`（不溢出）：见文件头 —— 溢出的 abspos 盒子会让 multicol 分栏失效。
        style={{ filter: raised ? PAPER_FILTER_RAISED : PAPER_FILTER }}
      >
        {/* 纸：直接把毛边路径填成纸色（**不要**换成 clip-path，见文件头注释） */}
        <svg aria-hidden {...PATH_BOX} className={cn("absolute inset-0 h-full w-full", PAPER_FILL[tone])}>
          <path d={d} />
        </svg>
      </span>

      {/*
        选中掩膜 + 描边。

        ⚠️ **必须放在上面那个 `filter` 之外**（曾经放在里面，是个性能 bug）：
        投影层每次重绘都要重新光栅化整棵子树，而这条描边开了 `non-scaling-stroke`
        （线宽按**设备像素**算），**根本没法缓存** —— 于是每张被选中的卡在每次重绘时都要
        重做一遍「几何映射 + 描边 + 三连 drop-shadow」。批量模式下选中的卡一多，
        鼠标一动（悬停 / 光标 / 任何重绘）就掉帧，且与选中数量成正比。
        放到 filter 外面后，这层只是一张普通的、可缓存的 SVG，只在尺寸或选中态变化时才重画。
      */}
      {selected && (
        <svg
          aria-hidden
          {...PATH_BOX}
          className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
        >
          {/* 掩膜：同一条毛边填出来的主题色底 */}
          <path d={d} style={{ fill: "var(--brand)", fillOpacity: 0.12 }} />
          {/* 描边：**沿着同一条路径**画（box-shadow 的 ring 会被裁掉、也跟不上毛边）。
              viewBox 是 0..1 的归一化坐标 + preserveAspectRatio="none"，所以线宽会被非等比拉伸，
              必须开 `non-scaling-stroke` 才还是 1px。 */}
          <path
            d={d}
            fill="none"
            vectorEffect="non-scaling-stroke"
            style={{ stroke: "var(--brand)", strokeOpacity: 0.45, strokeWidth: 1 }}
          />
        </svg>
      )}
    </>
  );
}
