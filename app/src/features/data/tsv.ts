/**
 * 剪贴板文本（TSV）与表格数据之间的转换。
 *
 * 与 Excel / CSV 互通都用 TSV：
 * - Excel 复制到剪贴板时给的就是「制表符分隔 + CRLF」的纯文本；
 * - 反过来写回去，Excel / 文本编辑器也能直接按列拆开。
 * 字段里出现制表符 / 换行 / 引号时按 Excel 规则加双引号并转义（"" 表示一个 "）。
 */

/** 单元格文本 → TSV 字段 */
export function tsvField(v: string): string {
  return /[\t\n\r"]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** 解析 TSV / CSV（兼容 Excel 的引号转义、CRLF、末尾多余空行） */
export function parseDelimited(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === "\t") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }
  row.push(cell);
  rows.push(row);
  while (rows.length > 1 && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === "") {
    rows.pop();
  }
  return rows;
}

/** 一块矩形区域 → TSV；withHeader 时在最前面带上列名 */
export function blockToTsv(
  rows: readonly (readonly unknown[])[],
  columns: readonly string[],
  x: number,
  y: number,
  w: number,
  h: number,
  withHeader = false,
): string {
  const lines: string[] = [];
  if (withHeader) lines.push(columns.slice(x, x + w).map(tsvField).join("\t"));
  for (let r = y; r < y + h; r++) {
    const cells: string[] = [];
    for (let c = x; c < x + w; c++) {
      const v = rows[r]?.[c];
      cells.push(tsvField(v === null || v === undefined ? "" : String(v)));
    }
    lines.push(cells.join("\t"));
  }
  return lines.join("\n");
}
