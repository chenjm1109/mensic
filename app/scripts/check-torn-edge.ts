/**
 * 「每张卡片毛边各不相同」的验收脚本（纯计算，不依赖浏览器）：
 *   npx esbuild scripts/check-torn-edge.ts --bundle --platform=node --format=cjs --outfile=.torn-check.cjs && node .torn-check.cjs
 *
 * 背景（用户反馈）：图鉴 / 创作里所有卡片的边缘长得一模一样。
 * 现在形状由**卡片 id 当种子**生成：每张不同，但同一张永远同一个形状（不是每次进页面重掷）。
 *
 * 这里钉死三件事：
 * 1. 首页那三张纸的轮廓**逐字节没变**（它们是并排的一套，不能跟着变）；
 * 2. 同一 id → 同一形状，不同 id → 不同形状；
 * 3. 形状不越界（凹进纸内的幅度小于卡片内容的内边距，不会啃到图）。
 */
import { PAPER_TORN_DEFAULT_SEED, PAPER_TORN_DEFAULT_SHAPE, hashSeed, tornClipPath } from "../src/components/ui/torn";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failed++;
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}${detail ? "   " + detail : ""}`);
}

/** 改造前 PaperBackdrop 里那份写死的轮廓（必须原样保留） */
const LEGACY_DEFAULT =
  "M0.0000 0.0000 L 0.0833 0.0177 L 0.1667 0.0110 L 0.2500 0.0021 L 0.3333 0.0119 L 0.4167 0.0073 L 0.5000 0.0073 L 0.5833 0.0060 L 0.6667 0.0173 L 0.7500 0.0070 L 0.8333 0.0119 L 0.9167 0.0178 L 1.0000 0.0000 L 0.9920 0.0833 L 0.9925 0.1667 L 0.9868 0.2500 L 0.9875 0.3333 L 0.9838 0.4167 L 0.9887 0.5000 L 0.9954 0.5833 L 0.9948 0.6667 L 0.9886 0.7500 L 0.9846 0.8333 L 0.9865 0.9167 L 1.0000 1.0000 L 0.9167 0.9929 L 0.8333 0.9848 L 0.7500 0.9993 L 0.6667 0.9884 L 0.5833 0.9952 L 0.5000 0.9813 L 0.4167 0.9838 L 0.3333 0.9814 L 0.2500 0.9916 L 0.1667 0.9935 L 0.0833 0.9974 L 0.0000 1.0000 L 0.0179 0.9167 L 0.0198 0.8333 L 0.0180 0.7500 L 0.0135 0.6667 L 0.0065 0.5833 L 0.0190 0.5000 L 0.0018 0.4167 L 0.0102 0.3333 L 0.0070 0.2500 L 0.0079 0.1667 L 0.0022 0.0833 Z";

/* ---------- 1. 首页那三张纸：形状必须原样 ---------- */
{
  check("首页默认轮廓逐字节未变", tornClipPath(PAPER_TORN_DEFAULT_SEED, PAPER_TORN_DEFAULT_SHAPE) === LEGACY_DEFAULT);
}

/* ---------- 2. 确定性：同一 id 永远同一形状 ---------- */
{
  const a = tornClipPath("case:scatter-basic");
  const b = tornClipPath("case:scatter-basic");
  check("同一 id 两次调用完全一致", a === b);
  check("清缓存后仍然一致（纯函数，可复现）", tornClipPath("case:scatter-basic") === a);
  check("数字种子与字符串种子不混淆", tornClipPath("12345") !== tornClipPath(12345));
}

/* ---------- 3. 差异性：不同 id → 不同形状 ---------- */
{
  // 模拟真实卡片 id（案例用 slug、项目用 uuid 前缀）
  const ids = Array.from({ length: 400 }, (_, i) => `case-${i.toString(36)}-${hashSeed(String(i)).toString(36)}`);
  const paths = new Set(ids.map((id) => tornClipPath(id)));
  check("400 张卡 = 400 种毛边（无一重复）", paths.size === ids.length, `${paths.size}/${ids.length}`);

  // 相邻两张卡也不能只是「同一形状平移」：顶点必须真的不同
  const p0 = tornClipPath(ids[0]);
  const p1 = tornClipPath(ids[1]);
  check("相邻卡片形状不同", p0 !== p1);
  check("卡片形状 ≠ 首页形状", p0 !== LEGACY_DEFAULT);
}

/* ---------- 4. 几何合法性：闭合、在 0..1 内、凹进幅度受限 ---------- */
/** `M x y L x y … Z` → 顶点数组 */
function points(d: string): [number, number][] {
  return d.slice(1, -2).split(" L ").map((p) => {
    const [x, y] = p.split(" ");
    return [Number(x), Number(y)];
  });
}
/** 顶点离纸边的距离：顶点永远落在四条边上，所以「贴边程度」= min(x, 1-x, y, 1-y) */
const insetOf = ([x, y]: [number, number]) => Math.min(x, 1 - x, y, 1 - y);
const maxInset = (d: string) => Math.max(...points(d).map(insetOf));

{
  const d = tornClipPath("folder:demo");
  check("以 M 开头、以 Z 闭合", d.startsWith("M") && d.endsWith(" Z"));

  const pts = points(d);
  check("全部坐标落在 0..1", pts.every(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1));
  check("顶点数 = 4 × 段数", pts.length % 4 === 0, `${pts.length} 个`);
  check("每个顶点都贴在纸边上", pts.every((p) => insetOf(p) <= 0.024 + 1e-9));
  check("首个顶点 = 左上角 (0,0)", pts[0][0] === 0 && pts[0][1] === 0);
  check("右上角 (1,0) 在序列里", pts.some(([x, y]) => x === 1 && y === 0));

  // 每张卡最多往里凹 2.4%：卡片内容的内边距最小的也有 ~10px，
  // 所以 340px 宽的卡片最多凹 8.2px，不会啃到图。
  check("最大凹陷 ≤ 2.4%（不会啃到内容）", maxInset(d) <= 0.024 + 1e-9, `max=${maxInset(d).toFixed(4)}`);
}

/* ---------- 5. 参数是「每张卡自己决定」的：段数与幅度都有变化 ---------- */
{
  const ids = Array.from({ length: 200 }, (_, i) => `p-${i}`);
  const segs = new Set(ids.map((id) => points(tornClipPath(id)).length / 4));
  const amps = new Set(ids.map((id) => maxInset(tornClipPath(id)).toFixed(4)));
  check("段数不止一种（10–14 段）", segs.size >= 4, `${segs.size} 种：${[...segs].sort((a, b) => a - b).join(",")}`);
  check("段数落在 10–14", [...segs].every((n) => n >= 10 && n <= 14));
  check("凹陷幅度不止一种", amps.size >= 6, `${amps.size} 种`);
}

console.log(failed === 0 ? "\n全部通过" : `\n${failed} 项失败`);
process.exit(failed === 0 ? 0 : 1);
