import { useEffect } from "react";
import rough from "roughjs";
import { useSize, useBakedCanvas, type RoughOpts } from "./baked";

function rgba(hex: string, a: number) {
  // 允许直接传 CSS 变量：用 color-mix 表达透明度
  if (!/^#[0-9a-fA-F]{3,8}$/.test(hex)) return `color-mix(in srgb, ${hex} ${Math.round(a * 100)}%, transparent)`;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/**
 * 手绘填充：淡色打底 + 铅笔排线（无重描边），接近参考图的柔和铅笔质感。
 * 同一图形画两遍：solid 淡色打底，再叠 hachure 排线。
 */
function fill2(make: (o: RoughOpts) => void, color: string, angle = -41, gap = 4.5, seed = 1) {
  make({ fill: rgba(color, 0.3), fillStyle: "solid", stroke: "none", roughness: 1.2, bowing: 1.1, seed });
  make({
    fill: rgba(color, 0.6),
    fillStyle: "hachure",
    hachureAngle: angle,
    hachureGap: gap,
    stroke: "none",
    roughness: 1.5,
    bowing: 1.3,
    seed: seed + 1,
  });
}

/** 拱形路径（矩形 + 半圆顶） */
function archPath(x: number, y: number, w: number, h: number) {
  const r = w / 2;
  return `M${x} ${y + h} L${x} ${y + r} A ${r} ${r} 0 0 1 ${x + w} ${y + r} L${x + w} ${y + h} Z`;
}

const PINK_L = "#f7c8d0";
const PINK_M = "#f0a6b4";
const PINK_D = "#e8889a";
const BLUE_L = "#d3def6";
const BLUE_M = "#b3c9ef";
const BLUE_D = "#7f9fdc";

/** 首页背景：左右拱形 + 球体/点 + 弧线（烘焙到画布） */
export function RoughScene({ className }: { className?: string }) {
  const ref = useBakedCanvas((_ctx, rc, w, h) => {
    const arch = (x: number, y: number, wd: number, ht: number, color: string, gap: number, seed: number) =>
      fill2((o) => rc.path(archPath(x, y, wd, ht), o), color, -41, gap, seed);
    const circle = (cx: number, cy: number, d: number, color: string, gap: number, seed: number) =>
      fill2((o) => rc.circle(cx, cy, d, o), color, -41, gap, seed);

    // 左拱（粉）
    arch(w * 0.05, h * 0.06, w * 0.15, h * 0.88, PINK_L, 6, 1);
    arch(w * 0.077, h * 0.13, w * 0.096, h * 0.76, PINK_M, 5, 2);
    circle(w * 0.125, h * 0.48, Math.min(w * 0.055, h * 0.1), PINK_D, 4, 3);
    circle(w * 0.125, h * 0.32, 11, PINK_D, 3, 4);

    // 右拱（蓝）
    arch(w * 0.8, h * 0.06, w * 0.15, h * 0.88, BLUE_L, 6, 5);
    arch(w * 0.827, h * 0.13, w * 0.096, h * 0.76, BLUE_M, 5, 6);
    circle(w * 0.875, h * 0.43, Math.min(w * 0.05, h * 0.09), "#ffffff", 6, 7);
    circle(w * 0.875, h * 0.35, 11, BLUE_D, 3, 8);

    // 弧线 + 竖线
    rc.curve(
      [
        [w * 0.145, h * 0.33],
        [w * 0.5, h * 0.2],
        [w * 0.855, h * 0.33],
      ],
      { stroke: "rgba(120,130,170,0.5)", strokeWidth: 1.2, roughness: 1.2, bowing: 0.6, seed: 9 },
    );
    rc.line(w * 0.145, h * 0.33, w * 0.145, h * 0.5, {
      stroke: "rgba(120,130,170,0.3)",
      strokeWidth: 1.1,
      roughness: 1.2,
      seed: 10,
    });
  });
  return <canvas ref={ref} className={className} style={{ display: "block", width: "100%", height: "100%" }} />;
}

/** 纸卡内的图案（手绘，烘焙到画布）：粉拱+球 / 蓝拱+斜块+球 */
export function RoughMotif({ kind, className }: { kind: "rose" | "blue"; className?: string }) {
  const ref = useBakedCanvas(
    (_ctx, rc, w, h) => {
      const archX = w * 0.07;
      const archW = w * 0.86;
      const archH = h * 0.78;

      if (kind === "rose") {
        fill2((o) => rc.path(archPath(archX, 0, archW, archH), o), PINK_L, -41, 5, 21);
        fill2((o) => rc.circle(w * 0.5, h * 0.62, Math.min(archW * 0.66, h * 0.6), o), PINK_D, -41, 4, 23);
      } else {
        fill2((o) => rc.path(archPath(archX, 0, archW, archH), o), BLUE_L, -41, 5, 25);
        const sx = w * 0.28;
        const sy = h * 0.24;
        const sw = w * 0.38;
        const sh = h * 0.5;
        const skew = h * 0.06;
        fill2(
          (o) =>
            rc.polygon(
              [
                [sx, sy + skew],
                [sx + sw, sy],
                [sx + sw, sy + sh],
                [sx, sy + sh + skew],
              ],
              o,
            ),
          BLUE_D,
          -41,
          4,
          27,
        );
        fill2((o) => rc.circle(w * 0.7, h * 0.68, Math.min(w * 0.36, h * 0.42), o), BLUE_M, -41, 4, 29);
      }
    },
    [kind],
  );
  return <canvas ref={ref} className={className} style={{ display: "block", width: "100%", height: "100%" }} />;
}

/** 铅笔用的中性灰（和粉/蓝同一族，保证三张图风格一致） */
const INK_LINE = "#a99c86";

/**
 * 首页三张纸上的手绘图形：摊开的图册 / 纸和笔 / 齿轮。
 * 与旧卡片的图案同一套画法（`fill2` = 淡色打底 + 铅笔排线 + 一点点墨线），
 * 所以三张纸放在一起观感是连续的。
 *
 * 前两个是跟着页面改名一起换的：图鉴 = 「一本书里贴着很多图例」，创作 = 「纸和笔」。
 */
export function RoughEntryMotif({ kind, className }: { kind: "gallery" | "projects" | "settings"; className?: string }) {
  const ref = useBakedCanvas(
    (ctx, rc, w, h) => {
      if (kind === "gallery") {
        // 摊开的图册：中缝高、外缘低（像摊在桌上）。
        // **左右完全镜像**：两页同色，两侧的图块 / 图注用同一份规格（位置、配色、柱形都对应），
        // 否则形状对称了、颜色一交叉，并排看还是歪的。
        const cx = w * 0.5;
        const topY = h * 0.22;
        const botY = h * 0.9;
        const outTop = h * 0.33;
        const outBot = h * 0.8;
        const outX = w * 0.03;

        /** 页面坐标 (u,v) → 画布坐标：u = 0 在中缝、1 在外缘；v = 0 上边、1 下边 */
        const at = (side: -1 | 1, u: number, v: number): [number, number] => {
          const x = cx + side * (cx - outX) * u;
          const yt = topY + (outTop - topY) * u;
          const yb = botY + (outBot - botY) * u;
          return [x, yt + (yb - yt) * v];
        };
        const quad = (side: -1 | 1, u0: number, v0: number, u1: number, v1: number): [number, number][] => [
          at(side, u0, v0),
          at(side, u1, v0),
          at(side, u1, v1),
          at(side, u0, v1),
        ];
        const ink = (a: [number, number], b: [number, number], seed: number, alpha = 0.5) =>
          rc.line(a[0], a[1], b[0], b[1], {
            stroke: rgba(INK_LINE, alpha),
            strokeWidth: 1.1,
            roughness: 1.3,
            bowing: 0.8,
            seed,
          });

        // 两页同色：**纸是红的**（同一 seed，连排线的抖动都一致）
        fill2((o) => rc.polygon(quad(-1, 0, 0, 1, 1), o), PINK_L, -41, 5, 71);
        fill2((o) => rc.polygon(quad(1, 0, 0, 1, 1), o), PINK_L, -41, 5, 71);
        // 中缝
        rc.line(cx, topY, cx, botY, {
          stroke: rgba(INK_LINE, 0.55),
          strokeWidth: 1.3,
          roughness: 1.4,
          seed: 77,
        });

        /** 图块规格：左右两侧共用同一份 —— 镜像对称的关键。块里的「图」一律用蓝。 */
        const TILES = [
          { u0: 0.12, v0: 0.1, u1: 0.88, v1: 0.44, color: BLUE_M, bars: [0.55, 0.95, 0.55], seed: 80 },
          { u0: 0.12, v0: 0.62, u1: 0.88, v1: 0.9, color: BLUE_D, bars: [0.85, 0.5, 0.85], seed: 86 },
        ];
        for (const side of [-1, 1] as const) {
          for (const tl of TILES) {
            fill2((o) => rc.polygon(quad(side, tl.u0, tl.v0, tl.u1, tl.v1), o), tl.color, -41, 3.5, tl.seed);
            // 块内三根柱子：等距（左右对称），柱高也对称
            tl.bars.forEach((t, i) => {
              const u = tl.u0 + ((tl.u1 - tl.u0) * (i + 1)) / 4;
              const base = tl.v1 - (tl.v1 - tl.v0) * 0.12;
              ink(at(side, u, base), at(side, u, base - (tl.v1 - tl.v0) * t), tl.seed + 20 + i, 0.45);
            });
            // 图注：两行短横线
            for (let i = 0; i < 2; i++) {
              const v = tl.v1 + 0.07 + i * 0.075;
              ink(
                at(side, tl.u0 + 0.02, v),
                at(side, tl.u0 + (tl.u1 - tl.u0) * (i ? 0.55 : 0.92), v),
                tl.seed + 30 + i,
                0.4,
              );
            }
          }
        }
      } else if (kind === "projects") {
        // 纸 + 笔：纸居中、笔横放在纸的下半部（笔尖在右）。
        // 刻意做成**左右对称**：另外两张（图册 / 齿轮）都是对称的，这张偏了会显得三张不齐。
        const px0 = w * 0.13;
        const px1 = w * 0.87;
        // 纵向中心对齐另外两张（图册约 0.56、齿轮 0.5），否则三张并排会一高一低
        const py0 = h * 0.22;
        const py1 = h * 0.88;
        fill2((o) => rc.rectangle(px0, py0, px1 - px0, py1 - py0, o), BLUE_L, -41, 5, 111);

        // 纸上的图：居中的图框 + 三根柱子（中间高、左右一样）
        const fx0 = w * 0.25;
        const fx1 = w * 0.75;
        const fy0 = h * 0.33;
        const fy1 = h * 0.63;
        rc.rectangle(fx0, fy0, fx1 - fx0, fy1 - fy0, {
          stroke: rgba(INK_LINE, 0.45),
          strokeWidth: 1.1,
          roughness: 1.3,
          bowing: 0.8,
          seed: 113,
        });
        [0.36, 0.66, 0.36].forEach((t, i) => {
          const bw = (fx1 - fx0) * 0.16;
          const bx = fx0 + (fx1 - fx0) * (0.24 + i * 0.26) - bw / 2;
          fill2((o) => rc.rectangle(bx, fy1 - (fy1 - fy0) * t, bw, (fy1 - fy0) * t, o), PINK_M, -41, 3, 116 + i);
        });

        // 笔：横放（笔尖朝右），整体在纸上居中
        const penY = h * 0.74;
        const hw = h * 0.05;
        const x0 = w * 0.2;
        const x1 = w * 0.72;
        fill2((o) => rc.rectangle(x0, penY - hw, x1 - x0, hw * 2, o), PINK_M, -41, 4, 124);
        fill2(
          (o) => rc.polygon([[x1, penY - hw], [x1, penY + hw], [x1 + hw * 1.7, penY]], o),
          PINK_D,
          -41,
          3,
          127,
        );
        // 笔夹
        rc.line(x0 + w * 0.03, penY, x0 + w * 0.13, penY, {
          stroke: rgba(INK_LINE, 0.5),
          strokeWidth: 1.1,
          roughness: 1.3,
          bowing: 0.8,
          seed: 130,
        });
      } else {
        // 齿轮：一圈齿 + 中心孔（孔用「挖掉」的方式做，两种主题下都对）
        const cx = w * 0.5;
        const cy = h * 0.5;
        const r = Math.min(w, h) * 0.27;
        const teeth = 8;
        for (let i = 0; i < teeth; i++) {
          const a = (i / teeth) * Math.PI * 2;
          const tw = r * 0.5;
          const tl = r * 0.42;
          const px = (dx: number, dy: number): [number, number] => [
            cx + Math.cos(a) * (r + dy) - Math.sin(a) * dx,
            cy + Math.sin(a) * (r + dy) + Math.cos(a) * dx,
          ];
          fill2(
            (o) =>
              rc.polygon(
                [px(-tw / 2, -tl * 0.5), px(tw / 2, -tl * 0.5), px(tw / 2, tl * 0.7), px(-tw / 2, tl * 0.7)],
                o,
              ),
            PINK_D,
            -41,
            3.5,
            95 + i,
          );
        }
        fill2((o) => rc.circle(cx, cy, r * 2, o), PINK_M, -41, 4.5, 104);
        ctx.save();
        ctx.globalCompositeOperation = "destination-out";
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.42, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        rc.circle(cx, cy, r * 0.84, {
          stroke: rgba(INK_LINE, 0.6),
          strokeWidth: 1.3,
          roughness: 1.3,
          seed: 106,
        });
      }
    },
    [kind],
  );
  return <canvas ref={ref} className={className} style={{ display: "block", width: "100%", height: "100%" }} />;
}

/** 手绘笔触（标题下划线等，尺寸很小，保留 SVG） */
export function RoughStroke({
  color = "var(--brand-line)",
  className,
  width,
  thickness = 6,
}: {
  color?: string;
  className?: string;
  width?: number;
  thickness?: number;
}) {
  const [ref, { w, h }] = useSize<SVGSVGElement>();
  useEffect(() => {
    const svg = ref.current;
    if (!svg || w < 4 || h < 4) return;
    svg.replaceChildren();
    const rc = rough.svg(svg);
    const len = width ?? w;
    svg.appendChild(
      rc.line(3, h / 2, len - 3, h / 2, {
        stroke: color,
        strokeWidth: thickness,
        roughness: 1.4,
        bowing: 1.6,
        seed: 13,
      }),
    );
  }, [w, h, color, width, thickness]);
  return <svg ref={ref} width="100%" height="100%" className={className} />;
}
