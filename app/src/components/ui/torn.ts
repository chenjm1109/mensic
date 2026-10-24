/**
 * 撕纸边缘（torn paper edge）：按 **seed** 生成确定性的归一化轮廓。
 *
 * 为什么是「按 seed 生成」而不是「每次随机」：
 * 卡片形状只需要「每张不一样」，不需要「每次进页面都不一样」。
 * 用案例 / 项目的 id 当种子，同一张卡在任何时候、任何页面都长成同一个形状 ——
 * 于是既能做出差异，又不必把形状存起来（重算也只是几十次算术，且有缓存）。
 *
 * 坐标是 objectBoundingBox（0..1），所以同一段路径套在任意尺寸的卡片上都会自动缩放：
 * 同一种子在一张 272px 宽和一张 300px 宽的卡上，是「同一款毛边」按比例放大，不是各长各的。
 *
 * ⚠️ 边缘只往里凹（`0..j` / `1-j..1`），不往外凸 —— 卡片外框就是毛边的最外沿，
 * 所以种子不能太野：凹得比内容的内边距还深，就会啃到图（见 paper.tsx 里各卡的 padding）。
 */

/** 线性同余（LCG）：同一 seed 永远给出同一串数，纯函数、无状态、跨进程可复现 */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** 字符串 → uint32（FNV-1a）：把案例 / 项目 id 变成种子 */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h >>> 0;
}

/**
 * 首页那三张纸（图鉴 / 创作 / 设置）用的固定种子。
 * 它们是**并排的一套**，形状必须一致，所以不参与「每张卡各长各的」。
 */
export const PAPER_TORN_DEFAULT_SEED = 0x2545f491;

/** 首页那三张纸的固定参数（与改造前逐字节一致） */
export const PAPER_TORN_DEFAULT_SHAPE = { segments: 12, jitter: 0.02 } as const;

export type TornShape = { segments?: number; jitter?: number };

/** 同一个 seed（同一份参数）只算一次：列表里几十张卡重复渲染时是零成本 */
const cache = new Map<string, string>();
const ptsCache = new Map<string, [number, number][]>();

/**
 * 生成撕纸矩形的**归一化顶点**（0..1）。
 * SVG `<path>` 与 canvas 烘焙共用这一份点集，保证两种画法形状完全一致。
 */
export function tornPoints(seed: number | string, shape?: TornShape): [number, number][] {
  const h = (typeof seed === "string" ? hashSeed(seed) : seed) >>> 0;
  const key = `${h}:${shape?.segments ?? ""}:${shape?.jitter ?? ""}`;
  const hit = ptsCache.get(key);
  if (hit) return hit;

  // 参数取种子的不同位段（与几何用的随机流互不干扰）
  const segments = shape?.segments ?? 10 + ((h >>> 8) % 5); // 10..14
  const jitter = shape?.jitter ?? 0.013 + ((h >>> 16) % 12) * 0.001; // 1.3%..2.4%
  const rnd = lcg(h);

  const pts: [number, number][] = [];
  const push = (x: number, y: number) => pts.push([x, y]);
  for (let i = 0; i <= segments; i++) push(i / segments, i === 0 || i === segments ? 0 : rnd() * jitter); // 上
  for (let i = 1; i <= segments; i++) push(i === segments ? 1 : 1 - rnd() * jitter, i / segments); // 右
  for (let i = segments - 1; i >= 0; i--) push(i / segments, i === 0 ? 1 : 1 - rnd() * jitter); // 下
  for (let i = segments - 1; i >= 1; i--) push(rnd() * jitter, i / segments); // 左

  ptsCache.set(key, pts);
  return pts;
}

/**
 * 生成撕纸矩形轮廓的 SVG path。
 * @param seed 任意 id（字符串走 FNV-1a，数字直接用）
 * @param shape 段数 / 抖动幅度；不传则**由种子决定**（段数 10–14、幅度 1.3%–2.4%），
 *              这样每张卡的毛刺疏密与深浅也不一样，光看轮廓就能认出是不同卡片。
 */
export function tornClipPath(seed: number | string, shape?: TornShape): string {
  const h = (typeof seed === "string" ? hashSeed(seed) : seed) >>> 0;
  const key = `${h}:${shape?.segments ?? ""}:${shape?.jitter ?? ""}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const pts = tornPoints(seed, shape).map(([x, y]) => `${x.toFixed(4)} ${y.toFixed(4)}`);
  const d = `M${pts.join(" L ")} Z`;
  cache.set(key, d);
  return d;
}
