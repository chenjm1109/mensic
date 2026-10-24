// 生成 design/icon/preview.html：把全部方案内联进一张对照页
// 跑法：node design/icon/build.mjs
import { readFileSync, writeFileSync } from "node:fs";

const dir = new URL("./", import.meta.url);
const read = (f) =>
  readFileSync(new URL(f, dir), "utf8")
    .replace(/<\?xml[^>]*\?>/g, "")
    .replace(/^\s+/, "")
    .trim();

const items = [
  {
    file: "01-paper-pen.svg",
    n: "01",
    title: "纸上一根手绘柱",
    en: "Paper & Pen",
    tag: "保留",
    desc: "奶油纸 + 三根手绘柱 + 墨蓝基线 + 手绘下划线。和界面里的纸卡、rough.js 图案、SketchUnderline 完全同源。",
    tone: "最贴现有视觉语言；缺点是「柱状图」这个形本身不独占。",
  },
  {
    file: "02-grid-case.svg",
    n: "02",
    title: "案例格里被点亮的那一格",
    en: "The Chosen Case",
    tag: "保留",
    desc: "3 列方格纸，顶边不封口；一格被玫红手绘色块选中，另一格留一个浅点。讲的是「从案例库里挑一个」。",
    tone: "产品动作最强的表达；16px 依然是一块 + 一点。",
  },
  {
    file: "05-seal.svg",
    n: "05",
    title: "朱印",
    en: "Seal",
    tag: "保留",
    desc: "玫红实底 + 奶白负形柱状图，边缘三处小缺口模仿盖印。指向「这张图是我出的」。",
    tone: "Dock 里最扎眼；实心红块在 16px 会显大，需缩 6–8%。",
  },
  {
    file: "06-stack.svg",
    n: "06",
    title: "一叠纸卡",
    en: "Stack",
    tag: "新增",
    desc: "首页那三张纸卡的复刻，最上面一张压着一根玫红折线。等于把启动页直接做成图标。",
    tone: "叙事最直白；32px 以下退化成三片浅色叠块，靠折线撑住。",
  },
  {
    file: "07-ink-blot.svg",
    n: "07",
    title: "墨滴洇纸",
    en: "Ink Blot",
    tag: "新增",
    desc: "一滴玫红落在方格纸上向外洇开，旁边几粒飞溅。「涵」本义就是浸润，加上三点水，语义和质感一次说完。",
    tone: "质感最独特；16px 只剩「网格上的一个点」，要靠形状不规则来区别于普通数据点。",
  },
  {
    file: "08-dog-ear.svg",
    n: "08",
    title: "折角的纸",
    en: "Dog-ear",
    tag: "新增",
    desc: "一页纸右下角折起，折回来的一面是玫红，像夹了个书签。纸 + 翻阅 + 「这页在你这儿」。",
    tone: "安静、耐看；折角在 32px 以下会糊成一块红三角。",
  },
  {
    file: "09-notebook.svg",
    n: "09",
    title: "摊开的笔记本",
    en: "Notebook",
    tag: "新增",
    desc: "左页表格、右页折线，直译 README 里那句「数据可视化笔记本」：数据在左，图在右。",
    tone: "最好懂的一版；代价是最像笔记类 App，品类感弱。",
  },
  {
    file: "10-polar-rose.svg",
    n: "10",
    title: "玫瑰线",
    en: "Polar Rose",
    tag: "新增",
    desc: "r = cos 5θ 的五瓣玫瑰线：它本身就是一张极坐标图，同时撞上 tokens 里默认主题名 rose 和主色玫红。三层含义叠在一个形上。",
    tone: "最漂亮、最独占；也最容易被当成「装饰花瓣」，得靠节点和坐标感把它拉回数据。",
  },
  {
    file: "11-area-mountain.svg",
    n: "11",
    title: "面积山",
    en: "Area Mountain",
    tag: "新增",
    desc: "两层面积图叠成山峦，前实后虚。数据图与山水画的同一个形，是这套里唯一有东方气质的方向。",
    tone: "气质最好；灰阶下两层会靠得很近，得靠明度差撑。",
  },
  {
    file: "12-donut.svg",
    n: "12",
    title: "甜甜圈",
    en: "Donut",
    tag: "已采用",
    desc: "一整圈圆环 + 一块浅色扇区，中间两条细缝分开。最「图表」的一版，16px 也认得出是环。已作为应用图标与 logo 落地。",
    tone: "360° 整圈保证小尺寸不塌；浅色那块负责说「取其中一份」。",
  },
  {
    file: "13-letter-m.svg",
    n: "13",
    title: "字母 m",
    en: "Letterform",
    tag: "新增",
    desc: "几何小写 m，两条拱的轮廓就是折线的走法。英文名 mensic 的字标直接当图形用。",
    tone: "品牌感最强、最耐缩；但字母图标在 Dock 里容易和别的字标混。",
  },
  {
    file: "14-heatmap.svg",
    n: "14",
    title: "热力方块",
    en: "Heatmap",
    tag: "新增",
    desc: "4×4 圆角方块，明度即数值，其中一格最亮。把「热力矩阵」这个案例类型直接当图形。",
    tone: "小尺寸是一块有层次的色块；方块一多就偏「调色板」，需要那个亮格来点题。",
  },
  {
    file: "15-cube.svg",
    n: "15",
    title: "数据立方",
    en: "Cube",
    tag: "新增",
    desc: "等轴测立方，三面三档玫红，顶面压一层坐标网格。对应 plotly3d 那类三维案例。",
    tone: "体感最强；也最容易读成「箱子 / 包裹」，顶面的网格是唯一的解药。",
  },
];

const ico = (svg, size, cls = "") =>
  `<div class="ico ${cls}" style="width:${size}px;height:${size}px">${svg}</div>`;

const section = (it) => {
  const svg = read(it.file);
  const ladder = [200, 128, 64, 48, 32, 24, 16]
    .map((s) => `<div class="cell">${ico(svg, s)}<span class="sz">${s}</span></div>`)
    .join("");
  return `
  <section>
    <div class="head">
      <div>
        <h2><b>${it.n}</b> ${it.title}<span class="en">${it.en}</span><span class="tag ${it.tag === "保留" ? "keep" : ""}">${it.tag}</span></h2>
        <p>${it.desc}</p>
      </div>
      <div class="hero">${ico(svg, 200)}</div>
    </div>
    <div class="ladder">${ladder}</div>
    <div class="tests">
      <div class="panel dark">
        <div class="plate">${ico(svg, 64)}${ico(svg, 40)}${ico(svg, 32)}${ico(svg, 16)}</div>
        <span class="cap">深色任务栏 / 暗色桌面</span>
      </div>
      <div class="panel">
        <div class="plate gray">${ico(svg, 64)}${ico(svg, 32)}${ico(svg, 16)}</div>
        <span class="cap">灰阶（判断剪影是否还成立）</span>
      </div>
      <div class="panel">
        <div class="plate blur">${ico(svg, 128)}</div>
        <span class="cap">眯眼 / 模糊 1.5 秒</span>
      </div>
    </div>
    <p class="tone">${it.tone}</p>
  </section>`;
};

const dock = (dark) => `
  <div class="dock ${dark ? "dark" : "light"}">
    ${items.map((it) => `<div class="dockico">${read(it.file)}</div>`).join("")}
  </div>`;

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>涵数 · mensic — 图标方案示意</title>
<style>
  :root{
    --paper:#FDFBF7; --paper-2:#F4F1EA; --ink:#515A85; --ink-2:#8A90A8;
    --rose:#E05F79; --rose-deep:#C2546A; --line:#E7DED0; --dark:#1A1917;
  }
  *{box-sizing:border-box}
  body{margin:0;padding:36px 40px 80px;background:var(--paper-2);color:var(--ink);
       font:14px/1.65 "Microsoft YaHei","Noto Sans SC",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
  header{max-width:1180px;margin:0 auto 28px}
  h1{margin:0 0 6px;font-size:24px;letter-spacing:.02em;color:#2C3150}
  h1 small{font-size:13px;font-weight:400;color:var(--ink-2);margin-left:10px;letter-spacing:0}
  .lede{margin:0;color:var(--ink-2);font-size:13px}
  .lede b{color:var(--rose-deep);font-weight:600}
  .wrap{max-width:1180px;margin:0 auto}
  .dockrow{display:flex;gap:16px;flex-wrap:wrap;margin:18px 0 6px}
  .dock{display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:14px;border:1px solid var(--line);background:#fff}
  .dock.dark{background:var(--dark);border-color:#33312D}
  .dockico{width:44px;height:44px;border-radius:10px;overflow:hidden;flex:0 0 auto}
  .dockico svg{display:block;width:100%;height:100%}
  section{background:var(--paper);border:1px solid var(--line);border-radius:16px;padding:26px 28px;margin:20px 0}
  .head{display:flex;gap:32px;align-items:flex-start;justify-content:space-between}
  .head > div:first-child{flex:1;min-width:0}
  h2{margin:0 0 8px;font-size:17px;color:#2C3150;letter-spacing:.01em}
  h2 b{display:inline-block;min-width:30px;color:var(--rose);font-variant-numeric:tabular-nums}
  .en{margin-left:10px;font-size:12px;font-weight:400;color:var(--ink-2);letter-spacing:.06em;text-transform:uppercase}
  .tag{margin-left:10px;font-size:10px;font-weight:400;letter-spacing:.08em;padding:1px 7px;border-radius:99px;
       border:1px solid var(--rose);color:var(--rose-deep);vertical-align:2px}
  .tag.keep{border-color:var(--line);color:var(--ink-2)}
  .head p{margin:0;max-width:62ch;color:#5F6788;font-size:13px}
  .hero{flex:0 0 auto;padding:6px}
  .ico{display:block;line-height:0}
  .ico svg{display:block;width:100%;height:100%}
  .ladder{display:flex;align-items:flex-end;gap:26px;flex-wrap:wrap;margin:26px 0 22px;padding:18px 20px;border:1px dashed var(--line);border-radius:12px}
  .cell{display:flex;flex-direction:column;align-items:center;gap:8px}
  .sz{font-size:11px;color:var(--ink-2);font-variant-numeric:tabular-nums}
  .tests{display:flex;gap:16px;flex-wrap:wrap}
  .panel{flex:1 1 240px;border:1px solid var(--line);border-radius:12px;padding:14px 16px;background:#fff;
         display:flex;flex-direction:column;gap:10px}
  .panel.dark{background:var(--dark);border-color:#33312D}
  .panel.dark .cap{color:#9C9A93}
  .plate{display:flex;align-items:center;gap:18px;min-height:64px}
  .plate.gray{filter:grayscale(1)}
  .plate.blur{filter:blur(1.6px)}
  .cap{font-size:11.5px;color:var(--ink-2);letter-spacing:.02em}
  .tone{margin:16px 0 0;font-size:12.5px;color:var(--rose-deep)}
  .tone::before{content:"取舍 · ";color:var(--ink-2)}
  footer{max-width:1180px;margin:34px auto 0;color:var(--ink-2);font-size:12px;line-height:1.9}
  footer code{font-family:ui-monospace,Consolas,monospace;background:#fff;border:1px solid var(--line);border-radius:5px;padding:1px 6px;color:var(--ink)}
  @media (max-width:720px){ body{padding:20px} .head{flex-direction:column} .ladder{gap:18px} }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>涵数 · mensic<small>图标方案示意 · 13 个方向</small></h1>
    <p class="lede">主色锁定 <b>#E05F79</b>，辅助墨蓝 #515A85。真正的验收尺寸是 <b>16px</b>：先看下面那排小图标里哪个还认得出，再看大的。</p>
    <div class="dockrow">${dock(false)}${dock(true)}</div>
  </header>
  ${items.map(section).join("")}
  <footer>
    全部矢量（512 画布，圆角 114），可直接缩。文件：<code>design/icon/*.svg</code>；改完跑 <code>node design/icon/build.mjs</code> 重新生成本页（玫瑰线是脚本算的，见 <code>gen-polar-rose.mjs</code>）。<br>
    12 已落地为应用图标：改完 <code>12-donut.svg</code> 后按 <code>design/icon/README.md</code> 那条链重生成。
    02 / 05 是上一轮留下的，06–15 是本轮新增。32 / 24 / 16 三档如果看不成一个图形，方案就得换或简化，不能靠大图好看糊弄过去。
  </footer>
</div>
</body>
</html>`;

writeFileSync(new URL("preview.html", dir), html, "utf8");
console.log("wrote preview.html");
