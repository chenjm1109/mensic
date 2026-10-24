/**
 * 渲染后端上报的字体族 → 结构化列表（见 `renderer/render.py` 的 `font_list`）。
 *
 * 后端返回的是 JSON 文本（本端原生）或已解析的数组（Pyodide worker），两种都走这里，
 * 免得两边各写一套解析。
 */
import type { FontFamily } from "./types";

export function parseFontList(raw: unknown): FontFamily[] {
  let data: unknown = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(data)) return [];
  return data.flatMap((item) => {
    // 老后端只给名字数组（那时还没有字形覆盖）：两个标记都当「有」——
    // 宁可多列几项，也不要把用户的字体从列表里藏起来。
    if (typeof item === "string") return item ? [{ name: item, label: item, cjk: true, latin: true }] : [];
    if (!item || typeof item !== "object") return [];
    const o = item as Partial<FontFamily>;
    if (typeof o.name !== "string" || !o.name) return [];
    return [
      {
        name: o.name,
        label: typeof o.label === "string" && o.label ? o.label : o.name,
        cjk: o.cjk === true,
        latin: o.latin === true,
      },
    ];
  });
}
