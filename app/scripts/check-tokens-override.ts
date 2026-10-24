/**
 * 「令牌覆盖」合并的验收（纯计算）：
 *   npx esbuild scripts/check-tokens-override.ts --bundle --platform=node --format=cjs --outfile=.tok.cjs && node .tok.cjs
 *
 * 覆盖一类很容易再犯的 bug：**合并时只认了部分子块**。
 * 上一次就是这样 —— 新增 `frame` / `grid` 后，`mergeTokensOverride` 的返回只判断 color / font，
 * 于是「只改边框或网格」的那次补丁被整个丢掉，表现为「开关点不动」。
 */
import { hasTokensOverride, mergeTokensOverride } from "../src/core/types";

let failed = 0;
function ok(name: string, cond: boolean, detail = "") {
  if (!cond) failed++;
  console.log(`${cond ? "  ok  " : "  FAIL"}  ${name}${detail ? "   " + detail : ""}`);
}

/* ---------- 每个子块都要能单独存活 ---------- */
{
  ok("color 单独存活", mergeTokensOverride(undefined, { color: { figure: "#fff" } })?.color?.figure === "#fff");
  ok("font 单独存活", mergeTokensOverride(undefined, { font: { cjk: "A" } })?.font?.cjk === "A");
  ok("frame 单独存活", mergeTokensOverride(undefined, { frame: { on: false } })?.frame?.on === false);
  ok("grid 单独存活", mergeTokensOverride(undefined, { grid: { on: true } })?.grid?.on === true);
  const g = mergeTokensOverride(undefined, { grid: { on: true, style: "--", width: 1.5, alpha: 0.4 } })?.grid;
  ok("grid 的四个字段一起存活", g?.on === true && g?.style === "--" && g?.width === 1.5 && g?.alpha === 0.4, JSON.stringify(g));
}

/* ---------- 与其他子块共存、互不覆盖 ---------- */
{
  const a = mergeTokensOverride(undefined, { color: { figure: "#fff" } });
  const b = mergeTokensOverride(a, { grid: { on: true } });
  ok("在已有 color 之上加 grid", b?.color?.figure === "#fff" && b?.grid?.on === true);
  const c = mergeTokensOverride(b, { frame: { on: false } });
  ok("再加 frame 不丢前两块", c?.color?.figure === "#fff" && c?.grid?.on === true && c?.frame?.on === false);
}

/* ---------- 清除：字段 undefined = 删掉；全清 = 返回 undefined ---------- */
{
  const a = mergeTokensOverride(undefined, { grid: { on: true, style: "--" } });
  const b = mergeTokensOverride(a, { grid: { style: undefined } });
  ok("清掉 grid.style 只剩 on", b?.grid?.on === true && b?.grid?.style === undefined, JSON.stringify(b?.grid));
  const c = mergeTokensOverride(b, { grid: { on: undefined } });
  ok("grid 清空后整个块消失", c === undefined, JSON.stringify(c));
  const d = mergeTokensOverride(undefined, { frame: { on: undefined } });
  ok("frame 给 undefined 等于没改", d === undefined);
}

/* ---------- hasTokensOverride 也要认全部子块 ---------- */
{
  ok("hasTokensOverride: frame", hasTokensOverride({ frame: { on: false } }) === true);
  ok("hasTokensOverride: grid", hasTokensOverride({ grid: { on: true } }) === true);
  ok("hasTokensOverride: 空对象 = false", hasTokensOverride({}) === false);
  ok("hasTokensOverride: undefined = false", hasTokensOverride(undefined) === false);
}

console.log(failed === 0 ? "\n令牌覆盖合并验收通过" : `\n失败 ${failed} 项`);
process.exit(failed === 0 ? 0 : 1);
