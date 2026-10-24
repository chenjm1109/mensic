/**
 * 「呈现规格合并」的验收（纯计算）：
 *   npx esbuild scripts/check-presentation-merge.ts --bundle --platform=node --format=cjs --outfile=.pres.cjs && node .pres.cjs
 *
 * 覆盖一类很容易再犯的 bug：**把「逐键合并」写成「整块替换」**。
 * 上次就是这样 —— 面板只想改刻度朝向（`ticks.direction`），结果把案例的
 * `x_major` / `x_minor` 一起冲掉，图上表现为「小刻度整片消失」。
 */
import { presentationFor } from "../src/features/editor/presentation-merge";

let failed = 0;
function ok(name: string, cond: boolean, detail = "") {
  if (!cond) failed++;
  console.log(`${cond ? "  ok  " : "  FAIL"}  ${name}${detail ? "   " + detail : ""}`);
}

/** 最小的「案例 / 项目」形状（只用到 presentation / canvas） */
const caseOf = (presentation: Record<string, unknown>) =>
  ({ presentation, canvas: { dpi: 150 } }) as never;
const projOf = (presentation: Record<string, unknown>, width = 1200, height = 750) =>
  ({ presentation, canvas: { width, height } }) as never;

const scatterCase = {
  title: { text: "基本散点图" },
  xlabel: "X轴",
  ylabel: "Y轴",
  ticks: { x_major: 5, x_minor: 1 },
  limits: { y: [0, 110] as [number, number] },
};

/* ---------- ticks：逐键合并（这次踩的坑） ---------- */
{
  const out = presentationFor(caseOf(scatterCase), projOf({ ticks: { direction: "in" } }));
  const t = out.ticks as Record<string, unknown>;
  ok("只改 direction 时保留案例的 x_major/x_minor", t.x_major === 5 && t.x_minor === 1 && t.direction === "in", JSON.stringify(t));
}
{
  const out = presentationFor(caseOf(scatterCase), projOf({}));
  const t = out.ticks as Record<string, unknown>;
  ok("项目没写 ticks 时案例原样留着", t.x_major === 5 && t.x_minor === 1 && t.direction === undefined, JSON.stringify(t));
}

/* ---------- limits：逐轴合并，null = 去掉该轴 ---------- */
{
  const out = presentationFor(caseOf(scatterCase), projOf({ limits: { x: [5, 45] as [number, number] } }));
  const l = out.limits as Record<string, unknown>;
  ok("只改 x 范围时 y 案例值还在", Array.isArray(l.x) && Array.isArray(l.y), JSON.stringify(l));
}
{
  const out = presentationFor(caseOf(scatterCase), projOf({ limits: { y: null } }));
  const l = out.limits as Record<string, unknown>;
  ok("y 写 null = 明确去掉该轴（x 上没有东西就整块没了）", l.y === undefined, JSON.stringify(l));
}

/* ---------- xlabel / ylabel / legend：整块覆盖 ---------- */
{
  const out = presentationFor(caseOf(scatterCase), projOf({ xlabel: "自变量" }));
  ok("xlabel 覆盖", out.xlabel === "自变量", String(out.xlabel));
  ok("没改的 ylabel 保持案例值", out.ylabel === "Y轴", String(out.ylabel));
}

/* ---------- canvas：按项目画布 + 案例 dpi 换算；标题不进来 ---------- */
{
  const out = presentationFor(caseOf(scatterCase), projOf({}, 900, 600));
  const cv = out.canvas as { size: number[]; dpi: number };
  ok("canvas 由项目尺寸换算", Math.abs(cv.size[0] - 6) < 1e-6 && Math.abs(cv.size[1] - 4) < 1e-6 && cv.dpi === 150, JSON.stringify(cv));
  ok("标题不进 presentation（界面另外存）", out.title === undefined);
}

console.log(failed === 0 ? "\n呈现规格合并验收通过" : `\n失败 ${failed} 项`);
process.exit(failed === 0 ? 0 : 1);
