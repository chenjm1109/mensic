/**
 * 选区 → 行号的换算。
 *
 * glide-data-grid 的选区有**两种形态**，只看一种就会写错：
 * 1. 整行 / 整列选中 → 信息在 `rows` / `columns`（CompactSelection）；
 * 2. **框选矩形** → `rows` / `columns` 都是空的，信息只在 `current.range` 里。
 *
 * 「删除选中的行」必须把两种都算上 —— 之前只看了 `rows`，所以框选多行之后右键
 * 「删除此行」只删掉了右键点中那一行，多行根本删不掉。
 */

export interface SelectionLike {
  rows: Iterable<number>;
  current?: { range?: { y: number; height: number } } | undefined;
}

/** 选区涉及的数据行号：去重、升序、剔除越界 */
export function rowsInSelection(sel: SelectionLike | undefined, rowCount: number): number[] {
  if (!sel) return [];
  const out = new Set<number>(Array.from(sel.rows));
  const r = sel.current?.range;
  if (r) for (let y = r.y; y < r.y + r.height; y++) out.add(y);
  return [...out].filter((i) => i >= 0 && i < rowCount).sort((a, b) => a - b);
}

/** 菜单动作要作用在哪些行：右键点在选区内 → 整个选区；点在外面 → 只这一行 */
export function rowsForAction(
  sel: SelectionLike | undefined,
  rowCount: number,
  row: number,
): number[] {
  const picked = rowsInSelection(sel, rowCount);
  if (picked.includes(row)) return picked;
  return row >= 0 && row < rowCount ? [row] : [];
}
