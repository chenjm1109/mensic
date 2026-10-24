import { useEffect, useId, useRef } from "react";
import rough from "roughjs";
import { useSize, useBakedCanvas, getNoiseTiles } from "./baked";

function rgba(hex: string, a: number) {
  // 允许直接传 CSS 变量 / 颜色关键字：用 color-mix 表达透明度，这样主题色能实时生效
  if (!/^#[0-9a-fA-F]{3,8}$/.test(hex)) return `color-mix(in srgb, ${hex} ${Math.round(a * 100)}%, transparent)`;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** 手绘高亮块（淡色打底 + 铅笔排线）；seed 不同则笔触不同 */
export function SketchHighlight({
  color = "#e8889a",
  radius = 10,
  seed = 4,
  className,
}: {
  color?: string;
  radius?: number;
  seed?: number;
  className?: string;
}) {
  const [ref, { w, h }] = useSize<SVGSVGElement>();
  useEffect(() => {
    const svg = ref.current;
    if (!svg || w < 4 || h < 4) return;
    svg.replaceChildren();
    const rc = rough.svg(svg);
    const pad = 1;
    const r = Math.max(2, Math.min(radius, h / 2 - pad, w / 2 - pad));
    const d =
      `M${pad + r} ${pad} L${w - pad - r} ${pad} Q${w - pad} ${pad} ${w - pad} ${pad + r} ` +
      `L${w - pad} ${h - pad - r} Q${w - pad} ${h - pad} ${w - pad - r} ${h - pad} ` +
      `L${pad + r} ${h - pad} Q${pad} ${h - pad} ${pad} ${h - pad - r} ` +
      `L${pad} ${pad + r} Q${pad} ${pad} ${pad + r} ${pad} Z`;
    svg.appendChild(
      rc.path(d, { fill: rgba(color, 0.3), fillStyle: "solid", stroke: "none", roughness: 1.2, bowing: 1.1, seed }),
    );
    svg.appendChild(
      rc.path(d, {
        fill: rgba(color, 0.62),
        fillStyle: "hachure",
        hachureAngle: -41 + ((seed % 5) - 2) * 2.5, // 排线角度也随种子微调
        hachureGap: 4.5,
        stroke: "none",
        roughness: 1.5,
        bowing: 1.3,
        seed: seed + 1,
      }),
    );
  }, [w, h, color, radius, seed, ref]);
  return <svg ref={ref} width="100%" height="100%" className={className} />;
}

/** 手绘「圆圈 + 箭头」（平面笔触，无阴影/底色） */
export function SketchCircleArrow({
  color = "var(--ink-2)",
  direction = "right",
  className,
}: {
  color?: string;
  direction?: "left" | "right";
  className?: string;
}) {
  const [ref, { w, h }] = useSize<SVGSVGElement>();
  useEffect(() => {
    const svg = ref.current;
    if (!svg || w < 8 || h < 8) return;
    svg.replaceChildren();
    const rc = rough.svg(svg);
    const r = Math.min(w, h) / 2 - 2;
    const cx = w / 2;
    const cy = h / 2;
    svg.appendChild(rc.circle(cx, cy, r * 2, { stroke: color, strokeWidth: 1.2, roughness: 1.3, bowing: 1.2, seed: 5 }));
    const ax = cx - r * 0.44;
    const bx = cx + r * 0.42;
    svg.appendChild(rc.line(ax, cy, bx, cy, { stroke: color, strokeWidth: 1.4, roughness: 1.1, bowing: 0.6, seed: 6 }));
    svg.appendChild(
      rc.line(bx, cy, bx - r * 0.36, cy - r * 0.32, { stroke: color, strokeWidth: 1.4, roughness: 1.1, bowing: 0.6, seed: 7 }),
    );
    svg.appendChild(
      rc.line(bx, cy, bx - r * 0.36, cy + r * 0.32, { stroke: color, strokeWidth: 1.4, roughness: 1.1, bowing: 0.6, seed: 8 }),
    );
  }, [w, h, color]);
  return (
    <svg
      ref={ref}
      width="100%"
      height="100%"
      className={className}
      style={direction === "left" ? { transform: "scaleX(-1)" } : undefined}
    />
  );
}
export function SketchBox({
  color = "#8a847a",
  strokeWidth = 1.1,
  radius = 22,
  seed = 9,
  className,
}: {
  color?: string;
  strokeWidth?: number;
  radius?: number;
  seed?: number;
  className?: string;
}) {
  const [ref, { w, h }] = useSize<SVGSVGElement>();
  useEffect(() => {
    const svg = ref.current;
    if (!svg || w < 4 || h < 4) return;
    svg.replaceChildren();
    const rc = rough.svg(svg);
    const s = strokeWidth;
    const r = Math.max(2, Math.min(radius, h / 2 - s, w / 2 - s));
    const d =
      `M${r} ${s} L${w - r} ${s} Q${w - s} ${s} ${w - s} ${r} ` +
      `L${w - s} ${h - r} Q${w - s} ${h - s} ${w - r} ${h - s} ` +
      `L${r} ${h - s} Q${s} ${h - s} ${s} ${h - r} ` +
      `L${s} ${r} Q${s} ${s} ${r} ${s} Z`;
    svg.appendChild(rc.path(d, { stroke: color, strokeWidth: s, roughness: 1.3, bowing: 1.2, seed }));
  }, [w, h, color, strokeWidth, radius, seed, ref]);
  return <svg ref={ref} width="100%" height="100%" className={className} />;
}

/**
 * 铅笔网格分线：顶部一条 + 行/列内部线（无左右外边线）。
 * 烘焙到画布，并用缓存的噪点瓦片「擦除」出断续的铅笔质感（无运行时滤镜）。
 */
export function SketchGridLines({
  rows,
  cols,
  color = "rgba(116,108,96,0.5)",
  className,
}: {
  rows: number;
  cols: number;
  color?: string;
  className?: string;
}) {
  const ref = useBakedCanvas(
    (ctx, rc, w, h) => {
      const o = { stroke: color, strokeWidth: 1, roughness: 0.9, bowing: 0.5 };
      rc.line(0, 1, w, 1, { ...o, seed: 11 });
      for (let i = 1; i < rows; i++) {
        const y = (h * i) / rows;
        rc.line(0, y, w, y, { ...o, seed: 100 + i * 17 });
      }
      for (let j = 1; j < cols; j++) {
        const x = (w * j) / cols;
        rc.line(x, 0, x, h, { ...o, seed: 700 + j * 23 });
      }
      // 用噪点遮罩擦出「若隐若现」的断续感
      const { coarse, fine } = getNoiseTiles();
      ctx.globalCompositeOperation = "destination-out";
      const pc = ctx.createPattern(coarse, "repeat");
      if (pc) {
        ctx.fillStyle = pc;
        ctx.fillRect(0, 0, w, h);
      }
      const pf = ctx.createPattern(fine, "repeat");
      if (pf) {
        ctx.fillStyle = pf;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.globalCompositeOperation = "source-over";
    },
    [rows, cols, color],
  );
  return <canvas ref={ref} className={className} style={{ display: "block", width: "100%", height: "100%" }} />;
}

/** 手绘药丸按钮底：实心渐变填充 + 手绘描边 + 轻排线质感 */
export function SketchPill({
  from = "#f2608f",
  to = "#e23c7e",
  stroke = "rgba(198,45,105,0.45)",
  seed = 21,
  className,
}: {
  from?: string;
  to?: string;
  stroke?: string;
  seed?: number;
  className?: string;
}) {
  const [ref, { w, h }] = useSize<SVGSVGElement>();
  const uid = useId().replace(/:/g, "");
  useEffect(() => {
    const svg = ref.current;
    if (!svg || w < 4 || h < 4) return;
    svg.replaceChildren();
    const ns = "http://www.w3.org/2000/svg";
    const defs = document.createElementNS(ns, "defs");
    const grad = document.createElementNS(ns, "linearGradient");
    grad.setAttribute("id", `g-${uid}`);
    grad.setAttribute("x1", "0");
    grad.setAttribute("y1", "0");
    grad.setAttribute("x2", "0");
    grad.setAttribute("y2", "1");
    const s1 = document.createElementNS(ns, "stop");
    s1.setAttribute("offset", "0%");
    s1.setAttribute("stop-color", from);
    const s2 = document.createElementNS(ns, "stop");
    s2.setAttribute("offset", "100%");
    s2.setAttribute("stop-color", to);
    grad.append(s1, s2);
    defs.appendChild(grad);
    svg.appendChild(defs);

    const rc = rough.svg(svg);
    const pad = 2;
    const r = (h - pad * 2) / 2;
    const d =
      `M${pad + r} ${pad} L${w - pad - r} ${pad} Q${w - pad} ${pad} ${w - pad} ${pad + r} ` +
      `L${w - pad} ${h - pad - r} Q${w - pad} ${h - pad} ${w - pad - r} ${h - pad} ` +
      `L${pad + r} ${h - pad} Q${pad} ${h - pad} ${pad} ${h - pad - r} ` +
      `L${pad} ${pad + r} Q${pad} ${pad} ${pad + r} ${pad} Z`;
    // 实心渐变底 + 手绘描边（同一路径，避免错位白缝）
    svg.appendChild(
      rc.path(d, {
        fill: `url(#g-${uid})`,
        fillStyle: "solid",
        stroke,
        strokeWidth: 1.1,
        roughness: 0.9,
        bowing: 0.6,
        seed,
      }),
    );
    // 轻排线，增加铅笔质感（同种子，贴合底形）
    svg.appendChild(
      rc.path(d, {
        fill: "rgba(255,255,255,0.08)",
        fillStyle: "hachure",
        hachureAngle: -52,
        hachureGap: 9,
        stroke: "none",
        roughness: 0.9,
        bowing: 0.6,
        seed: seed + 1,
      }),
    );
  }, [w, h, from, to, stroke, seed, uid, ref]);
  return <svg ref={ref} width="100%" height="100%" className={className} />;
}

/** 手绘下划线（标题下的玫色笔触） */
export function SketchUnderline({
  color = "var(--brand-line)",
  width = 64,
  thickness = 5,
  className,
}: {
  color?: string;
  width?: number;
  thickness?: number;
  className?: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    svg.replaceChildren();
    const rc = rough.svg(svg);
    svg.appendChild(
      rc.line(2, thickness / 2 + 1, width - 2, thickness / 2 + 1, {
        stroke: color,
        strokeWidth: thickness,
        roughness: 1.4,
        bowing: 1.4,
        seed: 13,
      }),
    );
  }, [color, width, thickness]);
  return <svg ref={ref} width={width} height={thickness + 4} className={className} />;
}
