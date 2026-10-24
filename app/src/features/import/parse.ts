/**
 * 文件解析与结构识别。
 *
 * - CSV / TSV / TXT：papaparse 解析（自动嗅探分隔符）
 * - Excel（.xlsx/.xls）：按需动态加载 SheetJS，不进主包
 * - 表头行识别：兼容「前面若干行是标题/说明」的常见 Excel 导出结构
 */
import Papa from "papaparse";
import type { RawSheet } from "./types";

const EXCEL_RE = /\.(xlsx|xls|xlsm)$/i;

export async function parseDataFile(file: File): Promise<RawSheet[]> {
  if (EXCEL_RE.test(file.name)) return parseExcel(file);
  const text = await file.text();
  return [parseDelimited(text, file.name.replace(/\.[^.]+$/, ""))];
}

/** CSV / TSV：整表按字符串读入（表头、空行处理统一放到后面） */
export function parseDelimited(text: string, name = t("数据")): RawSheet {
  const res = Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), {
    skipEmptyLines: "greedy",
  });
  const rows = (res.data ?? []).map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? "")) : []));
  return { name, rows };
}

async function parseExcel(file: File): Promise<RawSheet[]> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: false });
  return wb.SheetNames.map((sheetName) => {
    const ws = wb.Sheets[sheetName];
    // header:1 → 二维数组；raw:false → 取「显示值」（日期/百分比等按表格里看到的样子）
    const rows = XLSX.utils.sheet_to_json<string[]>(ws, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: false,
    });
    return { name: sheetName, rows: rows.map((r) => r.map((c) => String(c ?? ""))) };
  }).filter((s) => s.rows.length > 0);
}

const NUM_RE = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;

/**
 * 猜测表头所在行：在前若干行里找「本行几乎都是文本、下一行几乎都是数值/文本混杂」的那一行。
 * 返回 0 基下标；-1 表示判定为「没有表头」。
 */
export function detectHeaderRow(rows: string[][]): number {
  const limit = Math.min(rows.length - 1, 8);
  let best = 0;
  let bestScore = -Infinity;

  for (let i = 0; i <= limit; i++) {
    const row = rows[i] ?? [];
    const next = rows[i + 1] ?? [];
    const filled = row.filter((c) => c.trim() !== "");
    if (filled.length === 0) continue;

    const textish = filled.filter((c) => !NUM_RE.test(c.trim())).length;
    const uniq = new Set(filled.map((c) => c.trim())).size;
    const nextNumeric = next.filter((c) => NUM_RE.test(c.trim())).length;
    const nextFilled = next.filter((c) => c.trim() !== "").length || 1;

    // 本行以文本为主、去重率高；下一行有一定比例是数值 → 更像表头
    let score = textish * 2 + uniq - filled.length * 0.25 + (nextNumeric / nextFilled) * 3;
    if (i === 0) score += 0.5; // 没有额外线索时优先首行
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }

  const row = rows[best] ?? [];
  const filled = row.filter((c) => c.trim() !== "");
  // 全数字的一行不像表头
  if (filled.length > 0 && filled.every((c) => NUM_RE.test(c.trim()))) return -1;
  return best;
}

/** 取表头（无表头时生成「列 1/列 2…」） */
export function headerOf(rows: string[][], headerRow: number, width: number): string[] {
  if (headerRow < 0) return Array.from({ length: width }, (_, i) => t("列 {v1}", { v1: i + 1 }));
  const row = rows[headerRow] ?? [];
  return Array.from({ length: width }, (_, i) => {
    const v = (row[i] ?? "").trim();
    return v || t("列 {v1}", { v1: i + 1 });
  });
}

/** 行列互换 */
export function transpose(rows: string[][]): string[][] {
  const width = Math.max(0, ...rows.map((r) => r.length));
  return Array.from({ length: width }, (_, c) => rows.map((r) => r[c] ?? ""));
}
