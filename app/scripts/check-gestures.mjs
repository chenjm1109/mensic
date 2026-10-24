/**
 * 移动端手势 + 沉浸式全屏的验收脚本（静态检查源码，不需要真机/浏览器）。
 *
 * 背景（用户反馈）：
 *  1. 打包到安卓 / 网页后，**双指可以把整个应用界面缩放** —— 这是不允许的：
 *     缩放手势只应在「自己有实现」的区域生效（数据表格、图表预览）。
 *  2. 安卓打开后状态栏没收起来，要像游戏一样全屏。
 *
 * 这两条约束分散在 5 个文件里（viewport / CSS / MainActivity / ZoomPane / DataTable），
 * **少任何一道都会退回去**，所以在这里钉住。
 *
 * 用法：node scripts/check-gestures.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const desktop = join(here, "..");
const read = (rel) => readFileSync(join(desktop, rel), "utf8");
const fail = [];
const ok = (cond, msg) => {
  if (!cond) fail.push(msg);
};

/* ---------- 1) 整页缩放：viewport（浏览器那一道） ---------- */

const html = read("index.html");
ok(/name="viewport"/.test(html) && /user-scalable=no/.test(html), "index.html 的 viewport 必须带 user-scalable=no");
ok(/maximum-scale=1(\.0)?\b/.test(html), "index.html 的 viewport 必须带 maximum-scale=1");
ok(/viewport-fit=cover/.test(html), "index.html 的 viewport 必须带 viewport-fit=cover（安卓沉浸式铺满屏）");

/* ---------- 2) 整页缩放：touch-action（合成器那一道） ---------- */

const css = read("src/styles.css");
ok(
  /html\s*,\s*\n\s*body\s*\{[^}]*touch-action:\s*pan-x\s+pan-y/.test(css),
  "styles.css 必须给 html, body 写 touch-action: pan-x pan-y（Android WebView 的 viewport meta 不生效时靠它）",
);

/* ---------- 3) 自己的缩放手势：只有这两个区域有 ---------- */

const zoomPane = read("src/features/editor/ZoomPane.tsx");
ok(/addEventListener\("touchstart"/.test(zoomPane), "ZoomPane 必须监听 touchstart（图表预览的双指捏合）");
ok(
  /addEventListener\("touchmove"[^)]*\{\s*passive:\s*false/.test(zoomPane),
  "ZoomPane 的 touchmove 必须是非 passive（否则 preventDefault 无效、会被当成滚动吞掉）",
);
ok(/e\.touches\.length !== 2/.test(zoomPane) && /preventDefault\(\)/.test(zoomPane), "ZoomPane 的捏合必须拦住默认手势");
ok(/zoomAt\(/.test(zoomPane), "ZoomPane 的捏合必须走逐帧落值的 zoomAt（缓动会变拖橡皮筋）");

const table = read("src/features/data/DataTable.tsx");
ok(
  /touchAction:\s*"pan-x pan-y"/.test(table),
  "数据表格宿主元素必须保持 touch-action: pan-x pan-y（单指平移可用、双指留给表格自己）",
);

const gallery = read("src/pages/Gallery.tsx");
ok(
  /data-carousel[\s\S]{0,500}touch-pan-y/.test(gallery),
  "画廊详情轮播必须写 touch-pan-y（横向拖动交给 pointer，纵向仍可滚动）",
);
ok(
  /addEventListener\("touchmove"[\s\S]{0,120}\{\s*passive:\s*false/.test(gallery),
  "画廊详情轮播的触摸拖动必须用非 passive touchmove（安卓 WebView 才拦得住横向滚动）",
);
ok(
  /e\.pointerType\s*!==\s*"mouse"[\s\S]{0,300}return/.test(gallery),
  "画廊横向 DragScroll 在触屏上必须交给原生滚动，不要和 pointer 拖动抢",
);

/* ---------- 4) 安卓：沉浸式 + 原生兜底关掉整页缩放 ---------- */

const activity = read("src-tauri/gen/android/app/src/main/java/com/mensic/app/MainActivity.kt");
ok(/hide\(WindowInsetsCompat\.Type\.systemBars\(\)\)/.test(activity), "MainActivity 必须隐藏状态栏与导航栏（沉浸式全屏）");
ok(
  /BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE/.test(activity),
  "沉浸式必须用「滑动可临时唤出」的行为，否则没法看时间",
);
ok(/override fun onResume\(\)/.test(activity) && /goImmersive\(\)/.test(activity), "MainActivity 的 onResume 必须重新收起系统栏");
ok(/setSupportZoom\(false\)/.test(activity), "MainActivity 必须关掉 WebView 自身的整页缩放（原生兜底）");

if (fail.length) {
  console.log(`移动端手势/全屏检查失败 ${fail.length} 项：`);
  for (const f of fail) console.log(`  FAIL  ${f}`);
  process.exit(1);
}
console.log("移动端手势 + 沉浸式全屏检查通过（viewport / touch-action / ZoomPane / DataTable / MainActivity）");
