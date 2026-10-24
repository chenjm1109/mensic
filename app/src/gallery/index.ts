// 案例清单：由 scripts/sync-catalog.mjs 生成，勿手工编辑 cases.json。
import type { Canvas, CaseCapabilities, CaseSchemaColumn, Params } from "@/core/types";
import { libraryCases } from "./library";
import raw from "./cases.json";

export interface CaseParam {
  key: string;
  type: string;
  default: unknown;
  min?: number;
  max?: number;
  options?: { label: string; value: string }[];
}

/**
 * 模板声明的「图形元素」（meta.yaml 的 `elements:`）。
 *
 * 一个元素 = 图里一类可见对象（散点的点、折线的线…），界面上对应一个
 * 「颜色 / 大小 / 透明度」的配置块。**分组图表自动按分组展开**：
 * 只要有「分组 / 颜色」角色的数据列，每个分组各出一块（见 `features/editor/elements.ts`），
 * 所以同一份声明既管单组散点图、也管分组散点图，模板不用写两遍。
 *
 * `size` / `opacity` 指向案例参数的 key：默认值由那些参数给（模板只声明"归谁管"，
 * 不重复写一遍默认值），用户改了之后落在项目的 `elements` 覆盖里，覆盖优先。
 */
export interface CaseElement {
  key: string;
  /** 中文名（数据层的 label 属内容，不翻译），如「数据点」 */
  label: string;
  /** 大小取自哪个案例参数（不写 = 元素没有大小配置） */
  size?: string;
  /** 透明度取自哪个案例参数（不写 = 元素没有透明度配置） */
  opacity?: string;
  /** 颜色是否可配（热力图这种「颜色 = 数值」的图设为 false，只留大小 / 透明度） */
  color?: boolean;
  /**
   * 分组口径：
   * - `series`：按 series / color 列的**取值**分组（分组散点、分组柱…，默认）
   * - `column`：按宽表里的每个 **series 列**分组（多线折线图）
   * - `category`：按 x / label / value 列的**取值**分组（饼图、单系列柱状图）
   * - `none`：整张图只有一块
   */
  group_by?: "series" | "column" | "category" | "none";
  /** `category` 分组时指定用哪个 role（不写按 x → label → value → series 找） */
  group_role?: string;
}

export interface GalleryCase {
  id: string;
  title: string;
  category: string;
  categoryTitle: string;
  categoryOrder: number;
  tags: string[];
  summary: string;
  order: number;
  image: string | null;
  dataUrl: string | null;
  specUrl: string | null;
  engine: "matplotlib" | "plotly";
  theme: string;
  projection: string;
  canvas: { size: [number, number]; dpi: number };
  params: CaseParam[];
  /** 图形元素（颜色 / 大小 / 透明度按元素配置）；没有声明就用不着这个分区 */
  elements: CaseElement[];
  presentation: Record<string, unknown>;
  schema: CaseSchemaColumn[];
  requires: string[];
  /** 模板内容版本（改 schema / params / presentation / 代码 / 数据 必须 +1） */
  version: number;
  /** 模板内容指纹（见 sync-catalog.mjs） */
  assetsHash: string;
  /** 能力清单：这张图有哪些可配置项（面板据此显隐） */
  capabilities: CaseCapabilities;
}

export const GALLERY: GalleryCase[] = raw as unknown as GalleryCase[];

/** 内置图鉴 + 用户导入的模板（图鉴列表、搜索、分类都用这个） */
export function allCases(): GalleryCase[] {
  return [...GALLERY, ...libraryCases()];
}

export function getCase(id: string): GalleryCase | undefined {
  return GALLERY.find((c) => c.id === id) ?? libraryCases().find((c) => c.id === id);
}

export function assetUrl(path: string | null): string | null {
  if (!path) return null;
  // 已经是绝对地址（blob: / data: / http:）就原样返回：
  // 用户导入的模板，缩略图是内存里的 objectURL，不该再拼 BASE_URL。
  if (/^(blob:|data:|https?:)/i.test(path)) return path;
  return `${import.meta.env.BASE_URL}${path}`.replace(/\/{2,}/g, "/");
}

/** 案例画布（英寸 × dpi）→ 像素 */
export function caseCanvas(c: GalleryCase): Canvas {
  const [w, h] = c.canvas.size;
  return { width: Math.round(w * c.canvas.dpi), height: Math.round(h * c.canvas.dpi) };
}

/** 案例参数的默认值 */
export function defaultParams(c: GalleryCase): Params {
  const out: Params = {};
  for (const p of c.params) out[p.key] = p.default;
  return out;
}

export interface GalleryCategory {
  id: string;
  title: string;
  order: number;
  cases: GalleryCase[];
}

export const GALLERY_CATEGORIES: GalleryCategory[] = (() => {
  const map = new Map<string, GalleryCategory>();
  for (const c of GALLERY) {
    let group = map.get(c.category);
    if (!group) {
      group = { id: c.category, title: c.categoryTitle, order: c.categoryOrder, cases: [] };
      map.set(c.category, group);
    }
    group.cases.push(c);
  }
  return [...map.values()].sort((a, b) => a.order - b.order);
})();

/** 分类视图（含用户导入的模板）；每次调用都重算，导入模板后立刻出现 */
export function allCategories(): GalleryCategory[] {
  const map = new Map<string, GalleryCategory>();
  for (const c of allCases()) {
    let group = map.get(c.category);
    if (!group) {
      group = { id: c.category, title: c.categoryTitle, order: c.categoryOrder, cases: [] };
      map.set(c.category, group);
    }
    group.cases.push(c);
  }
  return [...map.values()].sort((a, b) => a.order - b.order);
}
