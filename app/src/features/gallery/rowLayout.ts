/**
 * 画廊详情页「一排图片」的排布（纯函数，便于单独验证）。
 *
 * 模型：
 * - 每张图有一个「未缩放的整高盒子」base = 行高 × 图片真实比例，缩放以**盒子中心**为原点；
 * - 缩放比由「离连续档位 idxFloat 几档」决定（连中心 = 1，越远越小）；
 * - 位置按**中心**从锚点向外累加，间距用**可见宽度**算，所以相邻两张的缝隙恒等于 gap，
 *   左右两侧用的是同一套算法 —— 天然对称；
 * - 整排图形只是 idxFloat 的函数；提交时 idxFloat 不变，所以画面在提交那一帧完全一致。
 */

/** 距离 → 缩放比（连续插值） */
export const PEEK = [1, 0.6, 0.46, 0.38, 0.33, 0.29, 0.26, 0.23];

export function peekScale(dist: number): number {
  const a = Math.abs(dist);
  const i0 = Math.floor(a);
  if (i0 >= PEEK.length - 1) return PEEK[PEEK.length - 1];
  return PEEK[i0] + (PEEK[i0 + 1] - PEEK[i0]) * (a - i0);
}

export interface RowItem {
  /** 案例下标 */
  i: number;
  /** 盒子左边缘（未缩放坐标；渲染时作为 translateX） */
  x: number;
  /** 未缩放的整高宽度 */
  base: number;
  /** 缩放比 */
  s: number;
  /** 距中心的档数（连续，负数在左） */
  dist: number;
  /** 缩放后的**可见**中心与左右边缘（供测试/调试用） */
  center: number;
  left: number;
  right: number;
}

export interface RowLayout {
  baseH: number;
  top: number;
  /** 一档的参考间距（拖动像素 ↔ 档数 的换算基准） */
  pitch: number;
  /** 锚点那张的可见中心 */
  activeCenter: number;
  /** 当前视觉上「在中间」的那一张的下标（= round(idxFloat)） */
  activeIndex: number;
  /** 清晰区半宽（屏幕空间）：从这里往外开始起雾，到容器边缘刚好看不清 */
  clearHalf: number;
  items: RowItem[];
}

/**
 * 松手以后停在哪一档（纯函数，可验收）。
 *
 * 硬约束：**一次手势最多比「手已经拖到的那一档」多走一档**。
 * 速度只用来在「靠近档位分界」时决定往哪边落（最多 ±半档），
 * 所以轻轻一搓最多一张，想连续翻多张必须真的把画面拖过去。
 */
export function decideOffset(opts: {
  /** 拖动过程中已经到达的档位（连续；正 = 往后翻） */
  offset: number;
  /** 松手时的速度（档/毫秒；正 = 往后翻） */
  velocitySlotsPerMs: number;
  /** 是否真的拖动过（没动过当点击处理，原地不动） */
  moved: boolean;
  min: number;
  max: number;
}): number {
  const clamp = (v: number) => Math.max(opts.min, Math.min(opts.max, v));
  if (!opts.moved) return clamp(Math.round(opts.offset));
  // 速度补偿：只有明显甩动才接近半档，且永远不超过半档
  const bias = Math.max(-0.5, Math.min(0.5, opts.velocitySlotsPerMs * 40));
  return clamp(Math.round(opts.offset + bias));
}

/**
 * 白雾（屏幕空间）。
 *
 * 要求：不管两侧能放下几张图（五张、三张，还是只有半张），都应该是
 * 「从主图边缘开始，越靠容器边缘越白，到边缘刚好完全看不清」——
 * 所以按**屏幕位置**算，而不是按「隔了几张」算。
 */

/** 清晰区半宽：主图边缘再留一点余量；同时保证边缘至少有 2% 宽的过渡带 */
export function fogClearHalf(activeHalfW: number, W: number): number {
  return Math.min(activeHalfW * 1.04, W / 2 - W * 0.02);
}

/** 某张图（给它屏幕上的中心）该有多少雾：主图范围内 0，容器边缘 1 */
export function fogAmount(centerX: number, W: number, activeHalfW: number): number {
  const dx = Math.abs(centerX - W / 2);
  const inner = fogClearHalf(activeHalfW, W);
  const span = Math.max(1, W / 2 - inner);
  return Math.max(0, Math.min(1, (dx - inner) / span));
}

export function layoutRow(opts: {
  /** 案例总数 */
  n: number;
  /** 容器宽 / 高（px） */
  W: number;
  H: number;
  /** 连续档位（= 锚点 + 位移） */
  idxFloat: number;
  /** 距离 → 图片真实宽高比 */
  aspectOf: (i: number) => number;
  gap?: number;
  /** 主图占可用高度的比例 */
  heightRatio?: number;
}): RowLayout | null {
  const { n, W, H, idxFloat } = opts;
  const gap = opts.gap ?? 18;
  const heightRatio = opts.heightRatio ?? 0.88;
  if (W <= 0 || H <= 0 || n <= 0) return null;

  const anchor = Math.max(0, Math.min(n - 1, Math.round(idxFloat)));
  // 主图高度按可用高度铺满，但**一定不能宽过容器**：
  // 高窗口下如果放任它按高度撑开，主图会被窗口裁掉，两侧也就看不到图了。
  const baseH = Math.min(H * heightRatio, (W * 0.9) / Math.max(0.4, opts.aspectOf(anchor)));
  const top = (H - baseH) / 2 + 4;
  const pitch = baseH * opts.aspectOf(anchor) * 0.8 + gap;
  const activeCenter = W / 2 + (anchor - idxFloat) * pitch;

  const measure = (i: number) => {
    const dist = i - idxFloat;
    const base = baseH * opts.aspectOf(i);
    const s = peekScale(dist);
    return { i, dist, base, s, center: 0, left: 0, right: 0 };
  };
  const half = (it: { base: number; s: number }) => (it.base * it.s) / 2;
  const place = (it: ReturnType<typeof measure>, center: number): RowItem => ({
    ...it,
    center,
    left: center - half(it),
    right: center + half(it),
    x: center - it.base / 2, // 缩放以盒子中心为原点 ⇒ 盒子左边缘 = 中心 − base/2
  });

  const mid = measure(anchor);
  const items: RowItem[] = [place(mid, activeCenter)];
  let cL = activeCenter;
  let cR = activeCenter;
  let prevL = mid;
  let prevR = mid;

  for (let k = 1; k < n; k++) {
    const ri = anchor + k;
    const li = anchor - k;
    if (ri >= n && li < 0) break;
    if (ri < n) {
      const it = measure(ri);
      const c = cR + half(prevR) + gap + half(it);
      if (c - half(it) < W + gap * 2) {
        items.push(place(it, c));
        cR = c;
        prevR = it;
      }
    }
    if (li >= 0) {
      const it = measure(li);
      const c = cL - half(prevL) - gap - half(it);
      if (c + half(it) > -gap * 2) {
        items.push(place(it, c));
        cL = c;
        prevL = it;
      }
    }
  }

  items.sort((a, b) => a.i - b.i);
  const clearHalf = Math.min(half(mid) * 1.04, W / 2 - W * 0.02);
  return { baseH, top, pitch, activeCenter, activeIndex: anchor, clearHalf, items };
}
