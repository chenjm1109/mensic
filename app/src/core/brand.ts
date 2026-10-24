/**
 * 主题色（强调色）。
 *
 * 默认是应用原生的玫红 `#e05f79` —— 这个默认值**不可修改**，
 * 用户可以在设置里换成自己的颜色，也可以随时恢复默认。
 *
 * 整套色阶由主色推导（默认色直接用设计稿的精确色值，不做推导，保证像素级一致）：
 *   brand   主色     填充 / 手绘底色 / 强调
 *   strong  深一档   文字、图标（浅底上可读）
 *   deep    最深     需要高对比的文字
 *   soft    浅底     选中态背景、标签底
 *   line    中间调   下划线、描边
 */

export const DEFAULT_BRAND = "#e05f79";

export interface BrandTokens {
  brand: string;
  strong: string;
  deep: string;
  soft: string;
  line: string;
}

/** 默认色的精确色阶（设计稿原值） */
const DEFAULT_TOKENS: BrandTokens = {
  brand: "#e05f79",
  strong: "#c2546a",
  deep: "#8e3448",
  soft: "#fbeef0",
  line: "#dfa0ac",
};

export function isDefaultBrand(hex: string): boolean {
  return hex.toLowerCase() === DEFAULT_BRAND;
}

/* ---------------- 颜色工具 ---------------- */

function clamp(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function parse(hex: string): [number, number, number] {
  const s = hex.replace("#", "");
  const full = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(r: number, g: number, b: number): string {
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** a 与 b 按 t 比例线性混合（t=0 得 a，t=1 得 b） */
function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);
  return toHex(clamp(r1 + (r2 - r1) * t), clamp(g1 + (g2 - g1) * t), clamp(b1 + (b2 - b1) * t));
}

export function brandTokens(hex: string, dark = false): BrandTokens {
  if (!dark && isDefaultBrand(hex)) return DEFAULT_TOKENS;
  if (dark) {
    // 深色底：文字色往白提亮，浅底用「品牌色 + 深底」调和出的暗色调
    return {
      brand: hex,
      strong: mix(hex, "#ffffff", 0.32),
      deep: mix(hex, "#ffffff", 0.52),
      soft: mix(hex, "#1a1917", 0.82),
      line: mix(hex, "#1a1917", 0.5),
    };
  }
  return {
    brand: hex,
    strong: mix(hex, "#000000", 0.24),
    deep: mix(hex, "#000000", 0.46),
    soft: mix(hex, "#ffffff", 0.92),
    line: mix(hex, "#ffffff", 0.38),
  };
}

/** 把主题色写进 :root 的 CSS 变量（同时同步 shadcn 的 --primary / --ring） */
export function applyBrand(hex: string, dark = false): void {
  if (typeof document === "undefined") return;
  const t = brandTokens(hex, dark);
  const s = document.documentElement.style;
  s.setProperty("--brand", t.brand);
  s.setProperty("--brand-strong", t.strong);
  s.setProperty("--brand-deep", t.deep);
  s.setProperty("--brand-soft", t.soft);
  s.setProperty("--brand-line", t.line);
  // shadcn 的 primary 在亮色沿用「深一档」的品牌色（保持原有观感）；
  // 深色底上则用原品牌色 + 深色前景，对比度更稳。
  s.setProperty("--primary", dark ? t.brand : t.strong);
  s.setProperty("--primary-foreground", dark ? "#1a1917" : "#ffffff");
  const [r, g, b] = parse(t.brand);
  s.setProperty("--ring", `rgba(${r}, ${g}, ${b}, ${dark ? 0.55 : 0.45})`);
}

/** 设置页里的预设（第一项是默认色，不可修改） */
export const BRAND_PRESETS: { name: string; hex: string }[] = [
  { name: "玫红", hex: DEFAULT_BRAND },
  { name: "珊瑚橙", hex: "#e8734a" },
  { name: "琥珀", hex: "#d99a2b" },
  { name: "松绿", hex: "#2f9e7a" },
  { name: "海蓝", hex: "#3b82c4" },
  { name: "黛紫", hex: "#7b6bd6" },
];

/** 颜色的展示名（命中预设用中文名，否则用十六进制） */
export function brandLabel(hex: string): string {
  const hit = BRAND_PRESETS.find((p) => p.hex.toLowerCase() === hex.toLowerCase());
  if (!hit) return hex.toUpperCase();
  return isDefaultBrand(hex) ? t("{v1}（默认）", { v1: t(hit.name) }) : t(hit.name);
}
