/**
 * 导入策略：把「原始表 + 用户选择」变成「项目数据 + 角色映射」。
 *
 * 全过程由案例 schema 驱动：
 *   案例声明需要哪些角色（x/y/color/size/…）→ 这里自动猜一版映射 → 用户微调 → 生成数据。
 * 案例以后改列名或加新角色，本文件不需要改。
 */
import type { Cell } from "@/core/types";
import { headerOf, transpose } from "./parse";
import { ROLE_ALIASES, coerceCell, type ImportPlan, type ImportResult, type RawSheet, type RoleNeed } from "./types";

export { roleNeeds } from "./types";

export interface SheetView {
  columns: string[];
  /** 数据行（已剔除表头与空行，数值已转成 number） */
  rows: Cell[][];
  /** 每列的推断类型（用于提示「数值角色选了文本列」这类问题） */
  types: Record<string, "number" | "text">;
}

/** 原始表 → 列名 + 数据行（应用表头行 / 转置选项） */
export function viewOf(sheet: RawSheet, headerRow: number, doTranspose: boolean): SheetView {
  const raw = doTranspose ? transpose(sheet.rows) : sheet.rows;
  const width = Math.max(0, ...raw.map((r) => r.length));
  if (width === 0) return { columns: [], rows: [], types: {} };
  const header = headerOf(raw, headerRow, width);
  const body = raw.slice(headerRow + 1);
  const rows = body
    .filter((r) => r.some((c) => String(c ?? "").trim() !== ""))
    .map((r) => Array.from({ length: width }, (_, i) => coerceCell(String(r[i] ?? ""))));
  const cols = dedupe(header);

  const types: Record<string, "number" | "text"> = {};
  cols.forEach((c, i) => {
    let num = 0;
    let tot = 0;
    for (const r of rows.slice(0, 50)) {
      const v = r[i];
      if (v === null || v === undefined || v === "") continue;
      tot++;
      if (typeof v === "number") num++;
    }
    types[c] = tot > 0 && num / tot >= 0.6 ? "number" : "text";
  });

  return { columns: cols, rows, types };
}

/** 重名列自动加序号，保证映射键唯一 */
function dedupe(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((n) => {
    const k = n.trim() || t("列");
    const hit = seen.get(k);
    if (hit === undefined) {
      seen.set(k, 1);
      return k;
    }
    seen.set(k, hit + 1);
    return `${k} (${hit + 1})`;
  });
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[\s_\-./\\()[\]{}（）【:：,，、|]+/g, "");
}

/**
 * 自动匹配角色 → 列：
 *   1. 与案例期望列名完全一致
 *   2. 与角色别名完全一致
 *   3. 与角色别名互相包含
 *   4. 按类型兜底（定量角色优先数值列，定性角色优先文本列）
 *   5. 还剩角色没匹配上就按顺序补
 */
export function guessMapping(needs: RoleNeed[], view: SheetView): Record<string, string> {
  const { columns, rows } = view;
  const used = new Set<string>();
  const out: Record<string, string> = {};
  const sample = rows.slice(0, 40);

  const numericRatio = (col: string): number => {
    const i = columns.indexOf(col);
    if (i < 0) return 0;
    let num = 0;
    let tot = 0;
    for (const r of sample) {
      const v = r[i];
      if (v === null || v === undefined || v === "") continue;
      tot++;
      if (typeof v === "number") num++;
    }
    return tot === 0 ? 0 : num / tot;
  };

  const assign = (need: RoleNeed, pred: (col: string) => boolean): boolean => {
    for (const c of columns) {
      if (used.has(c)) continue;
      if (pred(c)) {
        out[need.role] = c;
        used.add(c);
        return true;
      }
    }
    return false;
  };

  for (const need of needs) {
    const want = norm(need.expected);
    const aliases = [need.role, need.label, ...(ROLE_ALIASES[need.role] ?? [])].map(norm).filter(Boolean);
    if (want && assign(need, (c) => norm(c) === want)) continue;
    if (assign(need, (c) => aliases.includes(norm(c)))) continue;
    if (assign(need, (c) => aliases.some((a) => a.length > 1 && (norm(c).includes(a) || a.includes(norm(c)))))) continue;
    const quantitative = /quant|num|number/i.test(need.type);
    if (assign(need, (c) => (quantitative ? numericRatio(c) >= 0.6 : numericRatio(c) < 0.4))) continue;
    assign(need, () => true);
  }
  return out;
}

/**
 * 按用户选择生成可写入项目的数据（只保留用得上的列，顺序 = 角色顺序）。
 *
 * ⚠️ 输出列名用**案例 schema 里的规范列名**（`need.expected`），而不是源文件表头里的叫法：
 * 导入后数据表格显示的、以及「数据预览」栏里预览的，都是「本图用的这套数据结构」，
 * 两边完全一致；源文件里的原始叫法只留在左侧「原始数据」栏与存档的 source 里。
 * chart.py 认的也是这套规范列名（见 features/editor/render.ts 的 mappedData）。
 */
export function buildImported(view: SheetView, needs: RoleNeed[], plan: ImportPlan): ImportResult {
  const used: string[] = [];
  for (const need of needs) {
    const col = plan.mapping[need.role];
    if (col && view.columns.includes(col) && !used.includes(col)) used.push(col);
  }
  const extras = plan.keepUnused ? view.columns.filter((c) => !used.includes(c)) : [];
  const srcCols = [...used, ...extras];

  // 源列名 → 输出列名：优先用 schema 规范名；规范名缺失或撞名时退回源列名
  const taken = new Set(extras);
  const outName = new Map<string, string>();
  for (const need of needs) {
    const src = plan.mapping[need.role];
    if (!src || !used.includes(src) || outName.has(src)) continue;
    const want = (need.expected ?? "").trim();
    const name = want && !taken.has(want) ? want : src;
    outName.set(src, name);
    taken.add(name);
  }

  const columns = srcCols.map((c) => outName.get(c) ?? c);
  const index = new Map(view.columns.map((c, i) => [c, i]));
  const rows = view.rows.map((r) => srcCols.map((c) => r[index.get(c)!] ?? null));

  const mapping: Record<string, string> = {};
  for (const need of needs) {
    const src = plan.mapping[need.role];
    if (src && used.includes(src)) mapping[need.role] = outName.get(src) ?? src;
  }
  return { data: { name: "data.csv", columns, rows }, mapping, rowCount: rows.length };
}
