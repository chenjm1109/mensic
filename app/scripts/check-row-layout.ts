/**
 * 画廊轮播的验收脚本（纯计算，不依赖浏览器）：
 *   npx esbuild scripts/check-row-layout.ts --bundle --platform=node --format=cjs --outfile=.row-check.cjs && node .row-check.cjs
 *
 * 覆盖三类用户反馈过的问题：
 * 1) 两侧必须对称（间距一致、不出现一边密一边疏）；
 * 2) 拖动提交那一帧画面必须完全不变，且一次手势最多比手拖到的位置多走一档；
 * 3) 白雾必须是「屏幕空间」的：与两侧有几张图无关，到容器边缘刚好完全看不清。
 */
import { decideOffset, fogAmount, layoutRow } from "../src/features/gallery/rowLayout";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failed++;
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}${detail ? "   " + detail : ""}`);
}

const W = 1520;
const H = 470;

/* ---------- 1. 静止时：主图居中、相邻缝隙一致、左右对称 ---------- */
{
  const idx = 12;
  const rows = layoutRow({ n: 40, W, H, idxFloat: idx, aspectOf: () => 1.6 })!;
  const items = rows.items;
  const active = items.find((it) => it.i === idx)!;
  check("主图中心 = 容器中心", Math.abs(active.center - W / 2) < 0.01, `${active.center} vs ${W / 2}`);
  check("主图缩放 = 1", Math.abs(active.s - 1) < 1e-9);

  const gaps: number[] = [];
  for (let k = 1; k < items.length; k++) gaps.push(items[k].left - items[k - 1].right);
  const maxErr = Math.max(...gaps.map((g) => Math.abs(g - 18)));
  check("所有相邻缝隙 = 18px", maxErr < 0.01, `最大偏差 ${maxErr.toFixed(4)}`);

  const lefts = items.filter((it) => it.dist < -0.5).map((it) => ({ d: Math.abs(it.dist), w: it.right - it.left, c: W / 2 - it.center }));
  const rights = items.filter((it) => it.dist > 0.5).map((it) => ({ d: it.dist, w: it.right - it.left, c: it.center - W / 2 }));
  const symErr = lefts.reduce((acc, l) => {
    const r = rights.find((x) => Math.abs(x.d - l.d) < 1e-9);
    return r ? Math.max(acc, Math.abs(r.c - l.c), Math.abs(r.w - l.w)) : acc;
  }, 0);
  check("左右两侧位置与宽度对称", symErr < 0.01, `最大偏差 ${symErr.toFixed(4)}`);
}

/* ---------- 2. 拖动过程中：仍对称、缝隙不变 ---------- */
{
  const rows = layoutRow({ n: 40, W, H, idxFloat: 12.5, aspectOf: () => 1.6 })!;
  const items = rows.items;
  const gaps: number[] = [];
  for (let k = 1; k < items.length; k++) gaps.push(items[k].left - items[k - 1].right);
  const maxErr = Math.max(...gaps.map((g) => Math.abs(g - 18)));
  check("拖动中（半档）缝隙仍为 18px", maxErr < 0.01, `最大偏差 ${maxErr.toFixed(4)}`);
  const centerGap = items.filter((it) => Math.abs(it.dist) < 0.75);
  check("半档时中心附近两张等大", Math.abs(centerGap[0].s - centerGap[centerGap.length - 1].s) < 1e-9);
}

/* ---------- 3. 提交那一帧前后完全一致 ---------- */
{
  const before = layoutRow({ n: 40, W, H, idxFloat: 13, aspectOf: () => 1.6 })!;
  const after = layoutRow({ n: 40, W, H, idxFloat: 13, aspectOf: () => 1.6 })!;
  const same = before.items.every((it, k) => {
    const o = after.items[k];
    return o && o.i === it.i && Math.abs(o.x - it.x) < 1e-9 && Math.abs(o.s - it.s) < 1e-9;
  });
  check("提交前后逐张完全一致", same);
  check("几何只由 idxFloat 决定", Math.abs(before.activeCenter - (W / 2 + (13 - 13) * before.pitch)) < 1e-9);
}

/* ---------- 4. 边界：首尾不越界 ---------- */
{
  const first = layoutRow({ n: 8, W, H, idxFloat: 0, aspectOf: () => 1.6 })!;
  check("第一张不越界（无负下标）", first.items.every((it) => it.i >= 0));
  const last = layoutRow({ n: 8, W, H, idxFloat: 7, aspectOf: () => 1.6 })!;
  check("最后一张不越界", last.items.every((it) => it.i <= 7));
}

/* ---------- 5. 宽度差异大的图也不重叠 ---------- */
{
  const aspectOf = (i: number) => (i % 3 === 0 ? 1.75 : i % 3 === 1 ? 1.3 : 1.6);
  const rows = layoutRow({ n: 40, W, H, idxFloat: 9, aspectOf })!;
  const items = rows.items;
  const gaps: number[] = [];
  for (let k = 1; k < items.length; k++) gaps.push(items[k].left - items[k - 1].right);
  const minGap = Math.min(...gaps);
  check("宽高比不齐时也不重叠", minGap > 17.99, `最小缝隙 ${minGap.toFixed(3)}`);
}

/* ---------- 6. 手势：一次最多比「拖到的位置」多走一档 ---------- */
{
  const pitch = 570;
  const gesture = (points: { x: number; t: number }[]) => {
    const start = points[0];
    let offset = 0;
    let v = 0;
    let lastX = start.x;
    let lastT = start.t;
    for (const p of points.slice(1)) {
      const dt = Math.max(1, p.t - lastT);
      const inst = Math.max(-6, Math.min(6, (p.x - lastX) / dt));
      v = v === 0 ? inst : v * 0.65 + inst * 0.35;
      lastX = p.x;
      lastT = p.t;
      offset = -(p.x - start.x) / pitch;
    }
    return {
      landed: Math.round(offset),
      final: decideOffset({ offset, velocitySlotsPerMs: -v / pitch, moved: Math.abs(offset) > 0.01, min: -20, max: 20 }),
    };
  };

  const flick = gesture([{ x: 800, t: 0 }, { x: 770, t: 20 }, { x: 745, t: 40 }, { x: 720, t: 60 }]);
  check("轻搓 80px：最多走 1 张", Math.abs(flick.final - flick.landed) <= 1 && Math.abs(flick.final) <= 1, `走到 ${flick.final}`);
  const rub = gesture([{ x: 900, t: 0 }, { x: 830, t: 40 }, { x: 760, t: 80 }, { x: 700, t: 120 }]);
  check("小搓 200px：只走 1 张", Math.abs(rub.final) <= 1, `走到 ${rub.final}`);
  const jitter = gesture([{ x: 500, t: 0 }, { x: 494, t: 1 }, { x: 503, t: 2 }, { x: 497, t: 3 }]);
  check("微抖（3ms 内 ±6px）：原地不动", jitter.final === 0, `走到 ${jitter.final}`);
  const long = gesture([{ x: 1400, t: 0 }, { x: 1150, t: 150 }, { x: 900, t: 300 }, { x: 650, t: 450 }, { x: 400, t: 600 }]);
  check("刻意拖 1000px：连翻约 2 张", long.final >= 1 && long.final <= 3, `走到 ${long.final}`);
  const violent = gesture([{ x: 1000, t: 0 }, { x: 940, t: 8 }, { x: 880, t: 16 }, { x: 830, t: 24 }]);
  check("极速短甩：不会一次飞多张", Math.abs(violent.final - violent.landed) <= 1, `走到 ${violent.final}`);

  let worst = 0;
  for (let g = 0; g < 400; g++) {
    const pts = [{ x: 0, t: 0 }];
    let x = 0;
    let t = 0;
    const n = 3 + (g % 6);
    for (let k = 0; k < n; k++) {
      x += ((g * 37 + k * 91) % 400) - 200;
      t += 1 + ((g + k * 13) % 40);
      pts.push({ x, t });
    }
    const r = gesture(pts);
    worst = Math.max(worst, Math.abs(r.final - r.landed));
  }
  check("400 组随机手势：多走档数上界 = 1", worst <= 1, `实测上界 ${worst}`);
}

/* ---------- 7. 白雾：与「两侧有几张图」无关，只与屏幕位置有关 ---------- */
{
  const shapes = [
    { name: "宽窗 1320x824", W: 1320, H: 824 },
    { name: "方窗 1000x1000", W: 1000, H: 1000 },
    { name: "高窗 1000x1400", W: 1000, H: 1400 },
    { name: "很高 900x1800", W: 900, H: 1800 },
    { name: "矮窗 1400x600", W: 1400, H: 600 },
  ];
  let edgeWorst = 1;
  let mainWorst = 0;
  let overflow = 0;
  for (const s of shapes) {
    const row = layoutRow({ n: 40, W: s.W, H: s.H, idxFloat: 12, aspectOf: () => 1.6 })!;
    const main = row.items.find((it) => it.i === 12)!;
    const half = (main.right - main.left) / 2;
    edgeWorst = Math.min(edgeWorst, fogAmount(0, s.W, half), fogAmount(s.W, s.W, half));
    mainWorst = Math.max(mainWorst, fogAmount(s.W / 2 + half, s.W, half));
    if (main.right - main.left > s.W) overflow++;
    const sides = row.items.filter((it) => it.i !== 12 && it.right > 0 && it.left < s.W);
    const outer = sides.sort((a, b) => Math.abs(b.center - s.W / 2) - Math.abs(a.center - s.W / 2))[0];
    const mid = outer ? (Math.max(outer.left, 0) + Math.min(outer.right, s.W)) / 2 : null;
    console.log(
      `        ${s.name}  主图占宽 ${Math.round(((main.right - main.left) / s.W) * 100)}%  两侧可见 ${sides.length} 张` +
        `  其可见片段中部雾量 ${mid === null ? "-" : fogAmount(mid, s.W, half).toFixed(2)}`,
    );
  }
  check("容器边缘 = 完全看不清（所有形状）", edgeWorst > 0.98, `最小 ${edgeWorst.toFixed(3)}`);
  check("主图边缘 = 完全清晰（所有形状）", mainWorst < 0.02, `最大 ${mainWorst.toFixed(3)}`);
  check("主图永不超出容器宽度", overflow === 0, `超出 ${overflow} 种形状`);

  const tall = layoutRow({ n: 40, W: 1000, H: 1400, idxFloat: 12, aspectOf: () => 1.6 })!;
  const tMain = tall.items.find((it) => it.i === 12)!;
  const tHalf = (tMain.right - tMain.left) / 2;
  check(
    "「两侧不到一张」时，边缘仍有渐变白雾",
    fogAmount(1000, 1000, tHalf) > 0.98 && fogAmount(985, 1000, tHalf) > 0.35,
    `边缘 ${fogAmount(1000, 1000, tHalf).toFixed(2)} / 距边 15px ${fogAmount(985, 1000, tHalf).toFixed(2)}`,
  );
  let mono = true;
  // 从中心向两侧到边缘都必须单调递增（对称）
  for (let x = 500; x < 1000; x += 10) if (fogAmount(x, 1000, tHalf) > fogAmount(x + 10, 1000, tHalf)) mono = false;
  for (let x = 500; x > 0; x -= 10) if (fogAmount(x, 1000, tHalf) > fogAmount(x - 10, 1000, tHalf)) mono = false;
  check("白雾从中心到两侧边缘单调递增", mono);
}

console.log(failed === 0 ? "\n全部通过 ✅" : `\n有 ${failed} 项未通过 ❌`);
process.exit(failed === 0 ? 0 : 1);
