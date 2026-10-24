/**
 * 「图形元素」验收脚本（纯计算，不依赖浏览器）：
 *   npx esbuild scripts/check-element-styles.ts --bundle --platform=node --format=cjs --outfile=.el.cjs && node .el.cjs
 *
 * 覆盖三件事：
 * 1) 覆盖值的合并 / 清除：清空后不留空壳，项目里不存「和默认一样」的脏数据；
 * 2) 分组展开：单组图只有一块（key = "*"），有分组列时按数据里首次出现的顺序每组一块；
 * 3) 默认值来自案例参数（模板只声明"归谁管"，不重复写默认值）。
 */
import { mergeElementStyle } from "../src/core/types";
import { elementGroups, elementParamKeys, sameNumber } from "../src/features/editor/elements";
import type { GalleryCase } from "../src/gallery";

let failed = 0;
function ok(name: string, cond: boolean, detail = "") {
  if (!cond) failed++;
  console.log(`${cond ? "  ok  " : "  FAIL"}  ${name}${detail ? "   " + detail : ""}`);
}

const caseOne = {
  id: "scatter-basic",
  projection: "rect",
  schema: [
    { name: "X轴", role: "x", type: "quantitative", required: true },
    { name: "Y轴", role: "y", type: "quantitative", required: true },
  ],
  params: [
    { key: "point_size", type: "number", default: 100 },
    { key: "alpha", type: "number", default: 0.5 },
    { key: "show_projection", type: "bool", default: true },
  ],
  elements: [{ key: "point", label: "数据点", size: "point_size", opacity: "alpha" }],
} as unknown as GalleryCase;

const caseGrouped = {
  ...caseOne,
  id: "scatter-group",
  schema: [
    { name: "X轴", role: "x", type: "quantitative", required: true },
    { name: "Y轴", role: "y", type: "quantitative", required: true },
    { name: "组别", role: "series", type: "nominal", required: true },
  ],
} as unknown as GalleryCase;

const projectOne = {
  data: { name: "d", columns: ["X轴", "Y轴"], rows: [[1, 2], [3, 4]] },
  mapping: {},
} as never;
const projectGrouped = {
  data: { name: "d", columns: ["X轴", "Y轴", "组别"], rows: [[1, 2, "B"], [3, 4, "A"], [5, 6, "B"]] },
  mapping: {},
  elements: { point: { A: { color: "#ff0000" } } },
} as never;

const caseWide = {
  ...caseOne,
  id: "line-grouped",
  schema: [
    { name: "年份", role: "x", type: "quantitative", required: true },
    { name: "甲", role: "series", type: "quantitative" },
    { name: "乙", role: "series", type: "quantitative" },
  ],
  elements: [{ key: "line", label: "折线", group_by: "column", size: "line_width" }],
} as unknown as GalleryCase;

const caseCategory = {
  ...caseOne,
  id: "pie-basic",
  schema: [
    { name: "类别", role: "x", type: "categorical", required: true },
    { name: "数值", role: "y", type: "quantitative", required: true },
  ],
  elements: [{ key: "wedge", label: "扇区", group_by: "category", group_role: "x", opacity: "alpha" }],
} as unknown as GalleryCase;

const caseStatic = {
  ...caseOne,
  id: "heatmap-table",
  schema: [
    { name: "X", role: "x", type: "quantitative" },
    { name: "Y", role: "y", type: "quantitative" },
    { name: "值", role: "color", type: "quantitative" },
  ],
  elements: [{ key: "cell", label: "色块", group_by: "none", opacity: "alpha", color: false }],
} as unknown as GalleryCase;

/* ---------- 1. 合并 / 清除 ---------- */
{
  const a = mergeElementStyle(undefined, "point", "*", { size: 180 });
  ok("写一处覆盖", a?.point?.["*"]?.size === 180, JSON.stringify(a));
  const b = mergeElementStyle(a, "point", "*", { color: "#123456" });
  ok("同一块合并", b?.point?.["*"]?.size === 180 && b?.point?.["*"]?.color === "#123456");
  const c = mergeElementStyle(b, "point", "*", { size: undefined });
  ok("清掉一项不动其它项", c?.point?.["*"]?.size === undefined && c?.point?.["*"]?.color === "#123456");
  const d = mergeElementStyle(c, "point", "*", { color: undefined });
  ok("清理干净后整条消失（不留空壳）", d === undefined, JSON.stringify(d));
  const e = mergeElementStyle({ point: { A: { size: 1 } } }, "point", "B", { size: 2 });
  ok("分组之间互不影响", e?.point?.A?.size === 1 && e?.point?.B?.size === 2);
}

/* ---------- 2. 分组展开 ---------- */
{
  const g = elementGroups(caseOne, projectOne);
  ok("单组图只出一块", g.length === 1, `实得 ${g.length}`);
  ok("单组的 key 是单组标记", g[0]?.groupKey === "*");
  ok("单组标题用元素名", g[0]?.label === "数据点");
  ok("默认值取自案例参数", g[0]?.defaultSize === 100 && g[0]?.defaultOpacity === 0.5);
  ok("没改过时覆盖为空", g[0] && Object.keys(g[0].style).length === 0);
  ok("元素接管的参数不再单独出现", elementParamKeys(caseOne).join(",") === "point_size,alpha");

  const gg = elementGroups(caseGrouped, { ...(projectGrouped as object), elements: { point: { A: { color: "#ff0000" } } } } as never);
  ok("分组图按分组数出块", gg.length === 2, `实得 ${gg.length}`);
  ok("分组顺序 = 数据里首次出现的顺序", gg.map((x) => x.groupKey).join(",") === "B,A", gg.map((x) => x.groupKey).join(","));
  ok("色板位置与分组顺序对齐", gg.map((x) => x.paletteIndex).join(",") === "0,1");
  ok("分组各自的覆盖只落在自己那块", gg[0]?.style.color === undefined && gg[1]?.style.color === "#ff0000");

  const wideProject = {
    data: { name: "d", columns: ["年份", "甲", "乙"], rows: [[1, 2, 3]] },
    mapping: {},
  } as never;
  const wide = elementGroups(caseWide, wideProject);
  ok("宽表按列分组", wide.map((x) => x.groupKey).join(",") === "甲,乙", wide.map((x) => x.groupKey).join(","));

  const catProject = {
    data: { name: "d", columns: ["类别", "数值"], rows: [["B", 2], ["A", 1], ["B", 3]] },
    mapping: {},
  } as never;
  const cat = elementGroups(caseCategory, catProject);
  ok("按分类列取值分组", cat.map((x) => x.groupKey).join(",") === "B,A", cat.map((x) => x.groupKey).join(","));

  const staticGroups = elementGroups(caseStatic, catProject);
  ok("group_by none 只有一块", staticGroups.length === 1 && staticGroups[0]?.groupKey === "*");
  ok("color: false 会传到界面", staticGroups[0]?.hasColor === false);
}

/* ---------- 3. 回到默认值的判定 ---------- */
{
  // 透明度滑块步进 0.01：浮点乘出来的值必须仍算「等于默认」
  ok("滑块拖回 0.7 能判定为默认", sameNumber(0.01 * 70, 0.7), String(0.01 * 70));
  ok("0.71 ≠ 默认 0.7", !sameNumber(0.71, 0.7));
  ok("没有默认值时不触发清除", !sameNumber(0.5, undefined));
}

console.log(failed === 0 ? "\n图形元素验收全部通过 ✓" : `\n失败 ${failed} 项`);
process.exit(failed === 0 ? 0 : 1);
