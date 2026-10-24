import { caseCanvas, getCase } from "@/gallery";
import type { Rect } from "@/store";

/** 右侧配置栏宽度 + 分隔线（与 Editor.tsx 的 PANEL_W 对应） */
const PANEL_W = 341;
/** 预览工作区四周的留白（ZoomPane 的 `p-12`，两侧各 48） */
const WORKSPACE_PAD = 112;

/**
 * 估算编辑器里预览画布（`[data-preview-stage]`）的**最终屏幕矩形**。
 *
 * 给共享元素过场（HeroFlip）当「目标还没出现时的临时落点」用：点击后第一帧就朝着
 * 最终位置长大，而不是先停在原地、等编辑器挂载后再走。
 *
 * 两个入口都要用它，所以放在这里共用：
 * - 创作页点卡片 → 编辑器（Projects.tsx）
 * - 画廊详情点「创建项目」→ 编辑器（Gallery.tsx）
 */
export function estimatePreviewStage(caseId: string): Rect | undefined {
  const caseInfo = getCase(caseId);
  const main = document.querySelector("main");
  if (!caseInfo || !main) return undefined;
  const canvas = caseCanvas(caseInfo);
  const box = main.getBoundingClientRect();
  const wsW = box.width - PANEL_W;
  const wsH = box.height;
  const z = Math.floor(Math.min((wsW - WORKSPACE_PAD) / canvas.width, (wsH - WORKSPACE_PAD) / canvas.height) * 100) / 100;
  const w = canvas.width * z;
  const h = canvas.height * z;
  return { x: Math.round((wsW - w) / 2), y: Math.round(box.top + (wsH - h) / 2), w: Math.round(w), h: Math.round(h) };
}
