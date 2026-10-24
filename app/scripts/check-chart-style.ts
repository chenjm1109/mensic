/**
 * 「主题配色 / 文字与字体」纯逻辑的验收脚本（不依赖浏览器）：
 *   npx esbuild scripts/check-chart-style.ts --bundle --platform=node --format=cjs --outfile=.style-check.cjs && node .style-check.cjs
 *
 * 覆盖三处容易悄悄坏掉的地方：
 * 1) tokens.yaml 的解析（色板 / 字体候选是「只有键没有值」的列表，最容易漏）；
 * 2) 分组颜色与数据顺序的对齐（chart.py 是 palette[i % len]，顺序错了颜色就串位）；
 * 3) 令牌覆盖的深合并（清字段用 undefined，不能留下空壳）。
 */
import { mergeTokensOverride, hasTokensOverride } from "../src/core/types";
import { effectivePalette, paletteGroups, parseTokenDefaults, withPaletteColor } from "../src/features/editor/chartStyle";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failed++;
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}${detail ? "   " + detail : ""}`);
}

/* ---------- 1. tokens.yaml 解析 ---------- */
const YAML = `# 注释
color:
  figure: "#ffffff"          # 画布背景
  axes: "#fefaf9"
  edge: "#ffffff"
  text: "#515a85"
  label: "#c0627a"
  grid: "#d3dce8"
  palette:
    - "#e97a7a"
    - "#5595d1"
    - "#e5c679"
  sequential:
    - "#515a85"
    - "#ffffff"
font:
  family:
    - "Microsoft YaHei"
    - "Noto Sans CJK SC"
    - "sans-serif"
  weight: "bold"
  size: 12
figure:
  size: [8, 5]
themes:
  rose:
    color:
      axes: "#fefaf9"
  slate:
    color:
      axes: "#f1f5f9"
`;
{
  const d = parseTokenDefaults(YAML);
  check("解析出画布背景", d.color.figure === "#ffffff", d.color.figure);
  check("解析出轴标签色", d.color.label === "#c0627a", d.color.label);
  check("解析出色板 3 个", d.palette.length === 3 && d.palette[1] === "#5595d1", JSON.stringify(d.palette));
  check("色板不会把 sequential 混进来", !d.palette.includes("#515a85"));
  check("解析出字体候选 3 个", d.families.length === 3 && d.families[0] === "Microsoft YaHei", JSON.stringify(d.families));
  check("解析出全局字重", d.font.weight === "bold", d.font.weight);
  check("解析出全局字号", d.font.size === "12", d.font.size);
  check("解析出主题预设", d.themes.join(",") === "rose,slate", d.themes.join(","));
  check("figure 块不会被当成 font", d.font.figure === undefined);
}

/* ---------- 2. 分组顺序与配色 ---------- */
{
  const schema = [
    { name: "X轴", role: "x", type: "quantitative" },
    { name: "组别", role: "series", type: "categorical" },
  ];
  const data = {
    name: "d",
    columns: ["X轴", "组别"],
    rows: [
      [1, "乙"],
      [2, "甲"],
      [3, "乙"],
      [4, "丙"],
    ] as (string | number | null)[][],
  };
  const groups = paletteGroups(schema, data, {});
  check("分组按首次出现顺序", groups.join(",") === "乙,甲,丙", groups.join(","));

  // 映射到别的列名时也能找到
  const renamed = { ...data, columns: ["a", "b"] };
  check("按映射找列", paletteGroups(schema, renamed, { series: "b" }).join(",") === "乙,甲,丙");

  // 没有分组角色 → 空（界面退化成普通色板）
  check("单系列图没有分组", paletteGroups([{ name: "X", role: "x", type: "quantitative" }], data, {}).length === 0);

  const base = ["#111111", "#222222", "#333333"];
  check("无覆盖时用主题默认", effectivePalette(undefined, base, 3).join(",") === "#111111,#222222,#333333");
  check("只改第 2 个，其余仍用默认", effectivePalette({ color: { palette: ["#ff0000"] } }, base, 3).join(",") === "#ff0000,#222222,#333333");
  check("分组多于色板时循环取", effectivePalette(undefined, base, 5).join(",") === "#111111,#222222,#333333,#111111,#222222");

  const next = withPaletteColor(undefined, base, 3, 1, "#00ff00");
  check("改一格会写成整条色板（顺序稳定）", next.join(",") === "#111111,#00ff00,#333333", next.join(","));
}

/* ---------- 3. 令牌覆盖的合并 ---------- */
{
  const a = mergeTokensOverride(undefined, { color: { figure: "#ffe0e0" } });
  check("首次写入", a?.color?.figure === "#ffe0e0");
  const b = mergeTokensOverride(a, { font: { tick_label_size: 12 } });
  check("两层合并互不覆盖", b?.color?.figure === "#ffe0e0" && b?.font?.tick_label_size === 12);
  const c = mergeTokensOverride(b, { color: { figure: undefined } });
  check("undefined 清除该字段", c?.color?.figure === undefined && c?.color === undefined, JSON.stringify(c));
  const d = mergeTokensOverride(c, { font: { tick_label_size: undefined } });
  check("清空后整体回到 undefined", d === undefined, String(d));
  check("空覆盖不算已自定义", hasTokensOverride(undefined) === false && hasTokensOverride({}) === false);
  check("有内容才算已自定义", hasTokensOverride({ font: { weight: "normal" } }) === true);
  const e = mergeTokensOverride(undefined, { color: { palette: ["#abcdef"] }, font: { primary: "SimSun" } });
  check("色板与字体首选都能存下", e?.color?.palette?.[0] === "#abcdef" && e?.font?.primary === "SimSun");
}

console.log(failed === 0 ? "\n全部通过" : `\n${failed} 项失败`);
process.exit(failed === 0 ? 0 : 1);
