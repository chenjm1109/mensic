/**
 * 「框选多行 → 删除」的验收脚本（纯计算，不依赖浏览器）：
 *   npx esbuild scripts/check-data-selection.ts --bundle --platform=node --format=cjs --outfile=.sel-check.cjs && node .sel-check.cjs
 *
 * 背景（用户反馈）：框选多行多列后右键「删除行」，只删掉了右键点中的那一行，
 * 多行根本删不掉 —— 因为代码只看了 `gridSel.rows`，而**框选矩形的信息在 current.range 里**，
 * 那时 rows/columns 都是空的。这里把两种选区的换算钉死。
 */
import { rowsForAction, rowsInSelection } from "../src/features/data/selection";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failed++;
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}${detail ? "   " + detail : ""}`);
}
const eq = (a: number[], b: number[]) => a.join(",") === b.join(",");
const sel = (o: { rows?: number[]; range?: { y: number; height: number } }) => ({
  rows: o.rows ?? [],
  current: o.range ? { range: { x: 0, y: o.range.y, width: 2, height: o.range.height } } : undefined,
});

/* ---------- 1. 框选矩形（rows/columns 都是空的） ---------- */
{
  const s = sel({ range: { y: 3, height: 4 } }); // 选中第 3~6 行
  check("框选矩形能算出涉及的行", eq(rowsInSelection(s, 100), [3, 4, 5, 6]), String(rowsInSelection(s, 100)));
  check("点在框选内 → 删整个框选", eq(rowsForAction(s, 100, 5), [3, 4, 5, 6]), String(rowsForAction(s, 100, 5)));
  check("点在框选外 → 只删这一行", eq(rowsForAction(s, 100, 20), [20]), String(rowsForAction(s, 100, 20)));
}

/* ---------- 2. 整行选中（Ctrl 多选） ---------- */
{
  const s = sel({ rows: [7, 2] });
  check("整行选中按升序去重", eq(rowsInSelection(s, 100), [2, 7]), String(rowsInSelection(s, 100)));
  check("命中其中一行 → 删全部选中行", eq(rowsForAction(s, 100, 7), [2, 7]), String(rowsForAction(s, 100, 7)));
}

/* ---------- 3. 两种选区同时存在（整行选中 + 框选叠加） ---------- */
{
  const s = sel({ rows: [9], range: { y: 1, height: 2 } });
  check("叠加时取并集", eq(rowsInSelection(s, 100), [1, 2, 9]), String(rowsInSelection(s, 100)));
}

/* ---------- 4. 边界：越界行要剔掉 ---------- */
{
  const s = sel({ range: { y: 3, height: 10 } }); // 只有 5 行
  check("越界行被剔除", eq(rowsInSelection(s, 5), [3, 4]), String(rowsInSelection(s, 5)));
  check("点在不存在的行上 → 空", eq(rowsForAction(s, 5, 9), []), String(rowsForAction(s, 5, 9)));
}

/* ---------- 5. 没有选区 ---------- */
{
  check("无选区时只删点中的行", eq(rowsForAction(undefined, 10, 4), [4]));
  check("无选区且行号非法 → 空", eq(rowsForAction(undefined, 10, -1), []));
}

/* ---------- 6. 单行框选（height=1）也不出错 ---------- */
{
  const s = sel({ range: { y: 2, height: 1 } });
  check("单行框选 = 只删那一行", eq(rowsForAction(s, 10, 2), [2]), String(rowsForAction(s, 10, 2)));
}

/* ---------- 7. 空选区对象（没有 current） ---------- */
{
  check("空 rows 且无 current → 空", eq(rowsInSelection({ rows: [] }, 10), []));
}

console.log(failed === 0 ? "\n全部通过" : `\n${failed} 项失败`);
process.exit(failed === 0 ? 0 : 1);
