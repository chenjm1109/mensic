import { useEffect, useRef, useState } from "react";
import rough from "roughjs";

export type RoughCanvas = ReturnType<typeof rough.canvas>;
export type RoughOpts = NonNullable<Parameters<RoughCanvas["path"]>[1]>;

/**
 * 观测元素尺寸。使用 ResizeObserver 的 contentRect（不受 CSS transform 影响）。
 * 元素被重新挂载（换 key）时会自动改为观察新元素，避免停留在旧尺寸。
 */
export function useSize<T extends Element>() {
  const ref = useRef<T>(null);
  const observed = useRef<T | null>(null);
  const ro = useRef<ResizeObserver | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const set = (w: number, h: number) =>
    setSize((s) => (Math.abs(s.w - w) < 0.5 && Math.abs(s.h - h) < 0.5 ? s : { w, h }));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // 元素没变**且观察者还在** → 不用重建（这个 effect 每次渲染都会跑，不能每次都重建）
    if (el === observed.current && ro.current) return;
    observed.current = el;
    ro.current?.disconnect();
    const r = new ResizeObserver((entries) => {
      const b = entries[0]?.contentRect;
      if (b) set(b.width, b.height);
    });
    r.observe(el);
    ro.current = r;
    // ⚠️ 这里**不要**再用 getBoundingClientRect() 补一次初始尺寸：
    // 那一瞬间字体/图片/CSS 还没稳定，量到的可能是元素默认尺寸（canvas 是 300×150），
    // 一旦量错就再也不会被纠正（下面那个 cleanup 曾把观察者拆掉后不再重建，见下）。
    // ResizeObserver 在 observe() 时会立刻投递一次当前尺寸，本来就够。
  });

  useEffect(
    () => () => {
      ro.current?.disconnect();
      // ⚠️ 必须置空：dev 下 StrictMode 会「挂载 → 卸载 → 再挂载」跑两遍 effect，
      // 不置空的话第二次挂载会以为「观察者还在」而直接早退 → 之后卡片尺寸变化再没人通知
      // （纸张烘焙就是踩了这个：位图停在首次测量的尺寸，纸被拉伸变形）。
      ro.current = null;
    },
    [],
  );

  return [ref, size] as const;
}

/**
 * 把 rough.js 手绘图形「烘焙」到 <canvas>：
 * 只在尺寸变化时绘制一次，之后只是一个位图，动画/滚动时无需重新光栅化矢量与滤镜。
 */
export function useBakedCanvas(
  draw: (ctx: CanvasRenderingContext2D, rc: RoughCanvas, w: number, h: number) => void,
  deps: unknown[] = [],
) {
  const [ref, size] = useSize<HTMLCanvasElement>();
  useEffect(() => {
    const c = ref.current;
    if (!c || size.w < 2 || size.h < 2) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.max(1, Math.round(size.w * dpr));
    const H = Math.max(1, Math.round(size.h * dpr));
    if (c.width !== W) c.width = W;
    if (c.height !== H) c.height = H;
    const rc = rough.canvas(c);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    draw(ctx, rc, size.w, size.h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w, size.h, ...deps]);
  return ref;
}

/* ------------------------------------------------------------------ *
 * 铅笔噪点瓦片：程序化生成一次并缓存，用来给网格线做「若隐若现」的断续效果。
 * 相比在每个组件上叠 feTurbulence 滤镜，这种方式几乎没有运行时开销。
 * ------------------------------------------------------------------ */

function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** 分形值噪声瓦片：rgba(0,0,0,alpha)，alpha 为噪声强度 */
function makeNoise(size: number, baseCells: number, octaves: number, gain: number, seed: number) {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  const img = ctx.createImageData(size, size);
  const d = img.data;

  const rnd = makeRng(seed);
  const grids: { cells: number; g: Float32Array }[] = [];
  let cells = baseCells;
  for (let o = 0; o < octaves; o++) {
    const g = new Float32Array((cells + 1) * (cells + 1));
    for (let i = 0; i < g.length; i++) g[i] = rnd();
    grids.push({ cells, g });
    cells *= 2;
  }
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const at = (g: Float32Array, cells: number, x: number, y: number) =>
    g[Math.min(y, cells) * (cells + 1) + Math.min(x, cells)];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0;
      let amp = 1;
      let norm = 0;
      for (const G of grids) {
        const u = (x / size) * G.cells;
        const w = (y / size) * G.cells;
        const x0 = Math.floor(u);
        const y0 = Math.floor(w);
        const tx = smooth(u - x0);
        const ty = smooth(w - y0);
        const a = at(G.g, G.cells, x0, y0);
        const b = at(G.g, G.cells, x0 + 1, y0);
        const cc = at(G.g, G.cells, x0, y0 + 1);
        const dd = at(G.g, G.cells, x0 + 1, y0 + 1);
        v += amp * ((a * (1 - tx) + b * tx) * (1 - ty) + (cc * (1 - tx) + dd * tx) * ty);
        norm += amp;
        amp *= gain;
      }
      v /= norm;
      const alpha = Math.max(0, Math.min(1, v * 1.7 - 0.12));
      const i = (y * size + x) * 4;
      d[i] = 0;
      d[i + 1] = 0;
      d[i + 2] = 0;
      d[i + 3] = Math.round(alpha * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

let coarseTile: HTMLCanvasElement | null = null;
let fineTile: HTMLCanvasElement | null = null;

/** 两块噪点瓦片：粗斑（低频）+ 细密颗粒（高频），叠加得到铅笔的深浅疏密 */
export function getNoiseTiles() {
  if (!coarseTile) coarseTile = makeNoise(320, 3, 2, 0.5, 0x51ed);
  if (!fineTile) fineTile = makeNoise(220, 26, 3, 0.55, 0x9e37);
  return { coarse: coarseTile, fine: fineTile };
}
