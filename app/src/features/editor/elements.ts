/**
 * 「图形元素」的数据侧工具：把模板声明 + 数据分组，摊成界面要渲染的那几个配置块。
 *
 * 一个配置块 = 一类可见对象在一个分组里的外观（颜色 / 大小 / 透明度）。
 * 基本散点图只有一块（「数据点」）；分组散点图每个分组各一块（A / B / …），
 * 所以界面与渲染器只认「元素 + 分组」两层 key，不关心图里有几个系列。
 *
 * 分组口径与 `chart.py` 的 `palette[i]` 严格一致（复用 chartStyle 的 `paletteGroups`），
 * 这样「第 i 组的颜色」在主题配色与图形元素里始终是同一个颜色。
 */
import { SINGLE_GROUP, type CaseProject, type ElementStyle } from "@/core/types";
import type { GalleryCase } from "@/gallery";
import { paletteGroups } from "./chartStyle";

export interface ElementGroup {
  /** 元素 key（meta.yaml 里声明的，如 point） */
  elementKey: string;
  /** 元素名（中文，如「数据点」） */
  elementLabel: string;
  /** 分组 key：不分组 = SINGLE_GROUP（"*"），分组图表 = 分组列的取值 */
  groupKey: string;
  /** 这一块自己显示什么：单组用元素名，分组用组名 */
  label: string;
  /** 主题色板里这一组的位置（颜色没覆盖时显示它） */
  paletteIndex: number;
  /** 默认大小 / 透明度（来自案例参数；模板没声明就是 undefined） */
  defaultSize?: number;
  defaultOpacity?: number;
  /** 颜色是否可配（热力图等「颜色 = 数值」的图为 false） */
  hasColor: boolean;
  /** 项目里这一块的覆盖值（没改过就是空对象） */
  style: ElementStyle;
}

/** 案例参数里某个 key 的默认值（元素的大小 / 透明度都取自案例参数） */
function paramDefault(c: GalleryCase, key: string | undefined): number | undefined {
  if (!key) return undefined;
  const v = c.params.find((p) => p.key === key)?.default;
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** 某个 role 对应的数据列在项目数据里的实际列名（映射优先） */
function columnFor(c: GalleryCase, project: CaseProject, role: string): string | null {
  const def = (c.schema ?? []).find((s) => s.role === role);
  if (!def) return null;
  return project.mapping?.[role] || def.name;
}

/** 某一列在数据里首次出现的取值顺序（与 chart.py 的 unique / 画图顺序一致） */
function uniqueValues(c: GalleryCase, project: CaseProject, role: string): string[] {
  const col = columnFor(c, project, role);
  if (!col) return [];
  const i = project.data.columns.indexOf(col);
  if (i < 0) return [];
  const seen: string[] = [];
  for (const row of project.data.rows) {
    const v = row[i];
    if (v === null || v === undefined || v === "") continue;
    const s = String(v);
    if (!seen.includes(s)) seen.push(s);
  }
  return seen;
}

/**
 * 一个元素声明对应的分组 key（顺序必须与 chart.py 取 palette 的顺序一致）。
 *
 * - `series`：按 series / color 列的取值分组（老行为）
 * - `column`：按宽表里的 series 列分组（列名就是 key）
 * - `category`：按 x / label / value 列的取值分组（可用 group_role 指定）
 * - `none`：只有一块
 */
function groupsFor(el: NonNullable<GalleryCase["elements"]>[number], c: GalleryCase, project: CaseProject): string[] {
  const kind = el.group_by ?? ((c.schema ?? []).some((s) => s.role === "series" || s.role === "color") ? "series" : "none");
  if (kind === "none") return [];
  if (kind === "column") {
    return (c.schema ?? []).filter((s) => s.role === "series" || s.role === "color").map((s) => s.name);
  }
  if (kind === "category") {
    const order = [el.group_role, "x", "label", "value", "series"].filter((r): r is string => !!r);
    for (const role of order) {
      const vals = uniqueValues(c, project, role);
      if (vals.length > 0) return vals;
    }
    return [];
  }
  return paletteGroups(c.schema, project.data, project.mapping ?? {});
}

/**
 * 摊平模板声明 → 界面要显示的配置块。
 * 分组顺序 = 分组列在数据里首次出现的顺序（与调色板取色一致）。
 */
export function elementGroups(c: GalleryCase, project: CaseProject): ElementGroup[] {
  const defs = c.elements ?? [];
  if (defs.length === 0) return [];
  const styles = project.elements ?? {};
  const out: ElementGroup[] = [];
  for (const el of defs) {
    const label = el.label || el.key;
    const groups = groupsFor(el, c, project);
    const buckets = groups.length > 0 ? groups.map((g) => ({ key: g, label: g })) : [{ key: SINGLE_GROUP, label }];
    buckets.forEach((b, i) => {
      out.push({
        elementKey: el.key,
        elementLabel: label,
        groupKey: b.key,
        label: b.label,
        paletteIndex: groups.length > 0 ? i : 0,
        defaultSize: paramDefault(c, el.size),
        defaultOpacity: paramDefault(c, el.opacity),
        hasColor: el.color !== false,
        style: styles[el.key]?.[b.key] ?? {},
      });
    });
  }
  return out;
}

/** 这一块「大小 / 透明度」真正在用的值：项目覆盖优先，否则用案例参数给的默认 */
export function effectiveSize(g: ElementGroup): number | undefined {
  return g.style.size ?? g.defaultSize;
}

export function effectiveOpacity(g: ElementGroup): number | undefined {
  return g.style.opacity ?? g.defaultOpacity;
}

/**
 * 控件的当前值 == 默认值？（回到默认就清覆盖用）
 *
 * ⚠️ 不能用 `===`：透明度滑块的步进是 0.01，`0.01 * 70 = 0.7000000000000001`，
 * 拿等号比永远清不掉（表现为「拖回默认值了，项目里还留着覆盖、恢复图标也不消失」）。
 */
export function sameNumber(a: number, b: number | undefined): boolean {
  return b !== undefined && Math.abs(a - b) < 1e-9;
}

/** 元素声明里出现的案例参数 key（这些参数已经由元素配置块接管，不再单独占一行） */
export function elementParamKeys(c: GalleryCase): string[] {
  const out: string[] = [];
  for (const el of c.elements ?? []) {
    if (el.size) out.push(el.size);
    if (el.opacity) out.push(el.opacity);
  }
  return out;
}
