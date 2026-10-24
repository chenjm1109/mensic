/**
 * 首屏分包守卫（启动速度的回归测试）。
 *
 * 背景：入口 chunk 一度是 **5.4 MB**（plotly 4.4MB + glide + xlsx 全被静态拖进来），
 * 冷启动白屏十几秒。根因是 `App.tsx` 静态 import 了全部页面。
 *
 * 这里做两层检查（都不需要跑构建，秒级返回）：
 *  1. **源码层**：`App.tsx` 里除首页外，页面必须走 `lazy(() => import(...))`；
 *     任何 `import { X } from "@/pages/xxx"` 的静态写法都直接失败。
 *  2. **产物层**（如果 `dist/` 存在）：首屏 index.html 预加载的 chunk 里
 *     不得出现 plotly / glide-data-grid / xlsx。
 *
 * 用法：node scripts/check-bundle-split.mjs
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const desktop = join(here, "..");
const fail = [];
const ok = (cond, msg) => {
  if (!cond) fail.push(msg);
};

/* ---------- 1) 源码层：页面必须懒加载 ---------- */

const appSrc = readFileSync(join(desktop, "src/app/App.tsx"), "utf8");
const staticPageImports = [...appSrc.matchAll(/import\s*\{[^}]*\}\s*from\s*"@\/pages\/[^"]+"/g)].map((m) => m[0]);

// 首页允许静态（它就是首屏要画的东西）
const STATIC_OK = ["@/pages/Home"];
const bad = staticPageImports.filter((s) => !STATIC_OK.some((p) => s.includes(p)));
ok(bad.length === 0, `App.tsx 里除首页外必须懒加载，发现静态 import：\n      ${bad.join("\n      ")}`);

for (const page of ["Gallery", "Projects", "Editor", "Settings"]) {
  ok(
    new RegExp(`lazy\\(\\(\\)\\s*=>\\s*import\\("@/pages/${page}"\\)`).test(appSrc),
    `App.tsx 里 ${page} 应当写成 lazy(() => import("@/pages/${page}"))`,
  );
}

/* ---------- 2) 产物层：首屏不得预加载重库 ---------- */

const dist = join(desktop, "dist");
const HEAVY = {
  plotly: "plotly.js-dist",
  glide: "glide-data-grid",
  xlsx: "SheetJS",
  papaparse: "papaparse",
};

if (existsSync(join(dist, "index.html"))) {
  const html = readFileSync(join(dist, "index.html"), "utf8");
  const eager = [...new Set([...html.matchAll(/(?:src|href)="\/assets\/([^"]+\.js)"/g)].map((m) => m[1]))];
  ok(eager.length > 0, "dist/index.html 里没找到入口 chunk");

  let total = 0;
  for (const f of eager) {
    const p = join(dist, "assets", f);
    if (existsSync(p)) total += statSync(p).size;
  }
  ok(total < 900 * 1024, `首屏 JS 合计 ${Math.round(total / 1024)}KB，超过 900KB 上限（说明又有大库被拖进首屏）`);

  const all = readdirSync(join(dist, "assets")).filter((f) => f.endsWith(".js"));
  for (const [name, marker] of Object.entries(HEAVY)) {
    const owners = all.filter((f) => readFileSync(join(dist, "assets", f), "utf8").includes(marker));
    const inEager = eager.some((e) => owners.includes(e));
    ok(!inEager, `首屏预加载了 ${name}（所在 chunk：${owners.join(", ")}）`);
  }

  /* ---------- 3) 编辑器 chunk：matplotlib 案例的必经之路，不许再变大库 ---------- */
  // 背景：Editor chunk 曾经是 4.97 MB —— Plotly 通过「取封面 / ChartView / 导出」
  // 三条静态引用被拖进来，matplotlib 案例根本用不到。现在 Plotly 与表格都按需加载。
  const editorChunks = all.filter((f) => /^Editor-/.test(f));
  ok(editorChunks.length > 0, "dist/assets 里没找到 Editor chunk");
  for (const f of editorChunks) {
    const size = statSync(join(dist, "assets", f)).size;
    ok(size < 900 * 1024, `Editor chunk ${f} 有 ${Math.round(size / 1024)}KB（应 < 900KB：又有人把大库静态引进了编辑器）`);
    ok(!eager.includes(f), `Editor chunk ${f} 被首屏预加载了（应当只在进入编辑器时加载）`);
  }
  // Plotly / 数据表格必须落在**独立的按需 chunk** 里
  for (const [name, re] of Object.entries({ plotly: /^plotly/, DataTable: /^DataTable-/ })) {
    const owners = all.filter((f) => re.test(f));
    ok(owners.length > 0, `没有找到 ${name} 的独立 chunk（它应当按需加载）`);
    ok(owners.every((f) => !eager.includes(f)), `${name} 被首屏预加载了`);
  }
  console.log(`首屏 JS：${eager.join(", ")}（合计 ${Math.round(total / 1024)}KB）`);
} else {
  console.log("（没有 dist/，只做了源码层检查；跑一次 npm run build 可加上产物层检查）");
}

if (fail.length) {
  console.error(`\n❌ 首屏分包检查失败 ${fail.length} 项：\n`);
  for (const f of fail) console.error(`   · ${f}`);
  process.exit(1);
}
console.log("首屏分包检查通过");
