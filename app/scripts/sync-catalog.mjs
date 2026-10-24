// 把「案例库」（仓库根的 catalog/）同步成应用运行期资源：
//   public/cases/<id>/chart.py   案例的 matplotlib 实现（若有）
//   public/cases/<id>/data.csv   案例数据
//   public/cases/<id>/spec.json  仅 Plotly 案例：预生成的交互规格（3D 图用）
//   public/design/tokens.yaml    设计令牌
//   src/gallery/cases.json       案例清单（标题/分类/参数/呈现/主题/引擎/版本/指纹）
//   .gallery-lock.json           构建期护栏用的记录：每个模板的 version + 内容指纹
//
// 清单不在这里手写：meta.yaml 由 `scripts/catalog-manifest.py`（PyYAML）解析，
// 本脚本只做**拷贝 + 校验 + 写 cases.json**。
//
// 发布集：meta.yaml 的 `status: published`（缺省 draft）。加 `--release` 时只同步发布集，
// 并清掉 public/ 里非发布案例的残留 —— 发布包因此不含没适配好的图（体积也小）。
//
// ⚠️ 护栏：内容（schema / params / presentation / 代码 / 数据）变了但 meta.yaml 的 version 没变 →
//   直接报错退出，避免「项目绑定的模板悄悄变了、观感对不上」。
//   确实要临时跳过：node scripts/sync-catalog.mjs --allow-same-version
//
// 用法：
//   node scripts/sync-catalog.mjs             # 开发：全量（52 张）
//   node scripts/sync-catalog.mjs --release   # 发版：只同步 status: published
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { APP_ROOT as appDir, VENV_PY, ensurePythonEnv } from "./python-env.mjs";

const root = join(appDir, "..");
const manifestPath = join(appDir, ".catalog-manifest.json");
const ALLOW_SAME_VERSION = process.argv.includes("--allow-same-version");
const RELEASE = process.argv.includes("--release");

/* ---------- 1. 清单：由 catalog 里各案例的 meta.yaml 解析而来 ---------- */

if (!existsSync(VENV_PY)) {
  console.log("[catalog] 还没有 Python 环境，先建一个（首次较慢）……");
  ensurePythonEnv();
}
const pyRun = spawnSync(VENV_PY, [join(appDir, "scripts", "catalog-manifest.py"), "--out", manifestPath], {
  cwd: appDir,
  stdio: "inherit",
});
if (pyRun.status !== 0) {
  console.error("[catalog] 解析 catalog 失败（见上面的 Python 报错）");
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

/**
 * 角色词表：每种投影「允许哪些角色」。不在表里的角色只**警告**（不阻断），
 * 用来逐步把模板的角色命名规范起来（例如饼图目前复用了 x/y，将来应改成 label/value）。
 */
const ROLE_VOCAB = {
  rect: ["x", "y", "series", "color", "size", "label", "value"],
  polar: ["x", "y", "series", "color", "size", "label", "value"],
  "3d": ["x", "y", "z", "series", "size", "color", "value", "label"],
  pie: ["label", "value", "color"],
};

/**
 * 内容指纹：schema / params / elements / presentation / 代码 / 数据一起算，改任何一项都会变。
 * ⚠️ 换行统一成 \n 再算：git 的 autocrlf 会在 checkout 时把 LF 换成 CRLF，
 *    不归一化的话「什么都没改」也会被判成内容变了。
 * ⚠️ 没声明 elements 的模板**不把该字段写进指纹**：加字段只是指纹定义变了、不是内容变了，
 *    否则所有模板的指纹会一起变，护栏会对 52 个模板齐报「内容变了却没升 version」。
 */
function assetsHash(parts) {
  const norm = (s) => String(s ?? "").replace(/\r\n/g, "\n");
  const elements = parts.elements ?? [];
  const payload = JSON.stringify({
    schema: parts.schema,
    params: parts.params,
    ...(elements.length ? { elements } : {}),
    presentation: parts.presentation,
    engine: parts.engine,
    theme: parts.theme,
    projection: parts.projection,
    chart: norm(parts.chartSrc),
    data: norm(parts.dataText),
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 12);
}

/* ---------- 2. 读写 meta.yaml 的小工具（只解析需要的几项） ---------- */

function readMeta(contentDir) {
  try {
    return readFileSync(join(contentDir, "meta.yaml"), "utf8");
  } catch {
    return "";
  }
}

/**
 * 模板「能力清单」的默认值（按 projection）。
 * 依据是渲染器 `_apply_presentation_ax`：rect / polar 会吃 xlabel/limits/ticks；
 * figure 的子图由案例自己建、3D 场景由实现与规格决定 → 那些控件对它们是空操作，默认关掉。
 * 图例**不看 projection**（饼图没有轴但一定有图例），见 `capabilitiesFor`。
 */
const CAP_DEFAULTS = {
  rect: { axes: { x: true, y: true }, limits: true, ticks: true },
  polar: { axes: { x: true, y: true }, limits: true, ticks: true },
  figure: { axes: { x: false, y: false }, limits: false, ticks: false },
  "3d": { axes: { x: false, y: false }, limits: false, ticks: false },
};

/** 从 meta.yaml 读可选的 `capabilities: { axes: none, legend: true }`（内联表，够用且好解析） */
function readCapabilities(txt) {
  const m = txt.match(/^capabilities:\s*\{([^}]*)\}/m);
  if (!m) return null;
  const out = {};
  for (const part of m[1].split(",")) {
    const i = part.indexOf(":");
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    const raw = part.slice(i + 1).trim();
    if (!key) continue;
    out[key] = raw === "true" ? true : raw === "false" ? false : raw.replace(/^["']|["']$/g, "");
  }
  return out;
}

/**
 * 从 meta.yaml 读可选的 `elements:`（图形元素声明，界面按它显示「颜色 / 大小 / 透明度」）。
 * 写法固定为**一行一个内联表**（与上面的 capabilities 同一套最小解析）：
 *   elements:
 *     - { key: point, label: 数据点, size: point_size, opacity: alpha }
 */
function readElements(txt) {
  const out = [];
  let inside = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/\s+#(?=\s|$).*$/, "").trim();
    if (!line) continue;
    if (/^elements:\s*$/.test(line)) {
      inside = true;
      continue;
    }
    if (!inside) continue;
    if (!line.startsWith("-")) break;
    const body = line.replace(/^-\s*/, "").replace(/^\{|\}$/g, "");
    const item = {};
    for (const part of body.split(",")) {
      const i = part.indexOf(":");
      if (i < 0) continue;
      const k = part.slice(0, i).trim();
      const v = part.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      if (k) item[k] = v;
    }
    if (item.key) {
      // color: false → 布尔；true / 不写都按默认（可配颜色）
      if (item.color === "false") item.color = false;
      else delete item.color;
      out.push(item);
    }
  }
  return out;
}

/**
 * 合并「投影默认值」与「模板显式声明」：`axes: none` 会连带关掉 limits / ticks。
 * ⚠️ 输出结构必须与 `core/types.ts` 的 `CaseCapabilities` **逐字对齐**：
 *    `{ projection, axes: { x, y, limits, ticks }, legend }` —— limits/ticks 在 **axes 内部**。
 *    曾经把它们写到顶层，而面板读的是 `capabilities.axes.limits` / `.ticks` →
 *    全是 undefined → 「轴范围」「刻度文本」这类开关在所有图里都静默消失（很难发现的 bug）。
 * ⚠️ legend 不看 projection，而是**看模板自己**：`presentation.legend` 是对象才算「要图例」
 *    （`legend: false` 或干脆没写 = 这张图不需要图例，例如基本散点图只有一种点）。
 */
function capabilitiesFor(projection, declared, pres) {
  const base = CAP_DEFAULTS[projection] ?? CAP_DEFAULTS.rect;
  const out = {
    projection,
    axes: { x: base.axes.x, y: base.axes.y, limits: base.limits, ticks: base.ticks },
    legend: pres && typeof pres.legend === "object" && pres.legend !== null,
  };
  if (!declared) return out;
  const a = declared.axes;
  if (a === "none" || a === false) {
    out.axes.x = false;
    out.axes.y = false;
    out.axes.limits = false;
    out.axes.ticks = false;
  } else if (a === "x") {
    out.axes.x = true;
    out.axes.y = false;
  } else if (a === "y") {
    out.axes.x = false;
    out.axes.y = true;
  } else if (a === "xy" || a === true) {
    out.axes.x = true;
    out.axes.y = true;
  }
  if (typeof declared.limits === "boolean") out.axes.limits = declared.limits;
  if (typeof declared.ticks === "boolean") out.axes.ticks = declared.ticks;
  if (typeof declared.legend === "boolean") out.legend = declared.legend;
  return out;
}

/* ---------- 3. 输出目录 ---------- */

const categories = Object.fromEntries((manifest.categories ?? []).map((c) => [c.id, c]));
const outCases = join(appDir, "public/cases");
const outDesign = join(appDir, "public/design");
mkdirSync(outCases, { recursive: true });
mkdirSync(outDesign, { recursive: true });
mkdirSync(join(appDir, "src/gallery"), { recursive: true });
copyFileSync(join(root, "design/tokens.yaml"), join(outDesign, "tokens.yaml"));

function firstCsv(dir) {
  try {
    const f = readdirSync(dir).filter((n) => n.toLowerCase().endsWith(".csv"))[0];
    return f ? join(dir, f) : null;
  } catch {
    return null;
  }
}

/** 模板版本号：**以 meta.yaml 为准**（判「绑定的模板是不是变了」时必须立刻跟着变）。 */
function readMetaVersion(txt) {
  const m = txt.match(/^version:\s*(\d+)/m);
  return m ? Number(m[1]) : null;
}

function readMetaTheme(txt) {
  const m = txt.match(/^theme:\s*([^\s#]+)/m);
  return m ? m[1].trim() : "rose";
}

/* ---------- 4. 逐个案例拷资源 + 组装 cases.json ---------- */

/** 发布集：meta.yaml 里显式写了 `status: published` 的案例（缺省 draft） */
const topics = manifest.topics ?? [];
const published = topics.filter((t) => t.status === "published");
const selected = RELEASE ? published : topics;

const lockPath = join(appDir, ".gallery-lock.json");
const prevLock = existsSync(lockPath) ? JSON.parse(readFileSync(lockPath, "utf8")).cases ?? {} : {};
// 发布构建只处理发布集：没被处理的案例保留原有锁记录，免得下次开发同步时丢掉谱系
const nextLock = RELEASE ? { ...prevLock } : {};

const cases = [];
const problems = [];

if (RELEASE && selected.length === 0) {
  console.error("\n✗ 发布集为空：没有任何案例标 `status: published`（见 catalog/*/*/meta.yaml）\n");
  process.exit(1);
}

for (const t of selected) {
  const contentDir = join(root, "catalog", t.category, t.id);
  const caseDir = join(outCases, t.id);
  mkdirSync(caseDir, { recursive: true });
  const metaTxt = readMeta(contentDir);

  const impls = t.implementations ?? [];
  const hasMpl = impls.some((i) => i.library === "matplotlib");
  const hasPlotly = impls.some((i) => i.library === "plotly");

  // chart.py（matplotlib）
  if (hasMpl) {
    const src = join(contentDir, "implementations/matplotlib/chart.py");
    if (existsSync(src)) copyFileSync(src, join(caseDir, "chart.py"));
  }

  // 数据
  const csvSrc = firstCsv(join(contentDir, "data"));
  let dataUrl = null;
  if (csvSrc && existsSync(csvSrc)) {
    copyFileSync(csvSrc, join(caseDir, "data.csv"));
    dataUrl = `cases/${t.id}/data.csv`;
  }

  // Plotly 交互规格：catalog-manifest.py 已经把实现跑过一遍，这里只落盘。
  // ⚠️ 统一用 meta 标题覆盖：旧管线生成的 spec 里中文标题会损坏。
  let specUrl = null;
  if (!hasMpl && hasPlotly && t.spec) {
    const spec = t.spec;
    if (spec.layout?.title) spec.layout.title.text = t.title;
    writeFileSync(join(caseDir, "spec.json"), JSON.stringify(spec), "utf8");
    specUrl = `cases/${t.id}/spec.json`;
  }

  // 缩略图：由 `scripts/gen-thumbnails.py` 生成（与 App 内渲染同一份 renderer、不带标题）。
  // `npm run sync:catalog` 会紧接着跑那一步，所以这里直接引用约定路径。
  const image = `gallery/${t.id}.png`;

  // 发布构建：缺实现 / 缺数据的案例绝不能进包（否则用户看到空白卡片或 404）
  if (RELEASE) {
    if (hasMpl && !existsSync(join(caseDir, "chart.py"))) {
      problems.push(`${t.id}：标了 status: published 但缺少 implementations/matplotlib/chart.py`);
    }
    if (!dataUrl) problems.push(`${t.id}：标了 status: published 但没有 data/*.csv`);
    if (!hasMpl && !specUrl) problems.push(`${t.id}：标了 status: published 但没能生成 spec.json（检查 Plotly 实现）`);
  }

  const chartSrc = hasMpl ? readFileSync(join(contentDir, "implementations/matplotlib/chart.py"), "utf8") : "";
  const requires = [];
  if (/^\s*import\s+scipy|from\s+scipy/m.test(chartSrc)) requires.push("scipy");
  if (/^\s*import\s+sklearn|from\s+sklearn/m.test(chartSrc)) requires.push("scikit-learn");

  const pres = t.presentation ?? {};
  const canvas = pres.canvas ?? { size: [8, 5], dpi: 150 };
  const version = readMetaVersion(metaTxt) ?? Number(t.version ?? 1);
  const theme = readMetaTheme(metaTxt);
  const projection = pres.projection ?? "rect";
  const schema = t.data_schema?.columns ?? [];
  const params = t.params_schema ?? [];
  const elements = readElements(metaTxt);

  // ⚠️ 数据也进指纹：改了案例自带数据，同样要升 version（否则已有项目看到的图会静默变化）
  const dataText = csvSrc && existsSync(csvSrc) ? readFileSync(csvSrc, "utf8") : "";
  const hash = assetsHash({
    schema,
    params,
    elements,
    presentation: pres,
    engine: hasMpl ? "matplotlib" : "plotly",
    theme,
    projection,
    chartSrc,
    dataText,
  });
  nextLock[t.id] = { version, hash };

  cases.push({
    id: t.id,
    title: t.title,
    category: t.category,
    categoryTitle: categories[t.category]?.title ?? t.category,
    categoryOrder: categories[t.category]?.order ?? 999,
    tags: t.tags ?? [],
    summary: t.summary ?? "",
    order: t.order ?? 999,
    image,
    dataUrl,
    specUrl,
    engine: hasMpl ? "matplotlib" : "plotly",
    theme,
    projection,
    canvas: { size: canvas.size ?? [8, 5], dpi: canvas.dpi ?? 150 },
    params,
    elements,
    presentation: pres,
    schema,
    requires,
    // 模板版本 + 内容指纹：项目用它判断「我绑定的模板是不是变了」
    version,
    assetsHash: hash,
    // 能力清单：这张图有哪些可配置项（面板据此显隐）
    capabilities: capabilitiesFor(projection, readCapabilities(metaTxt), pres),
  });
}

/* ---------- 5. 构建期护栏 ---------- */

/**
 * 能力清单的形状护栏：`cases.json` 的 capabilities 必须与 `core/types.ts` 的
 * `CaseCapabilities` **同形**（limits / ticks 在 axes 里，不是顶层）。
 * 形状写错不会报错、只会让面板默默少显示几个开关，所以这里硬校验一次。
 */
for (const c of cases) {
  const cap = c.capabilities;
  const ok =
    cap &&
    cap.projection === c.projection &&
    cap.axes &&
    ["x", "y", "limits", "ticks"].every((k) => typeof cap.axes[k] === "boolean") &&
    typeof cap.legend === "boolean";
  if (!ok) {
    problems.push(
      `${c.id}：capabilities 形状不对（应为 { projection, axes: { x, y, limits, ticks }, legend }，收到 ${JSON.stringify(cap)}）\n` +
        `        → 面板读的是 capabilities.axes.limits / .ticks，写到顶层等于永远关闭`,
    );
  }
}

for (const c of cases) {
  const prev = prevLock[c.id];
  if (prev && prev.hash !== c.assetsHash && prev.version === c.version) {
    problems.push(
      `${c.id}：内容变了但 version 还是 ${c.version}（指纹 ${prev.hash} → ${c.assetsHash}）\n` +
        `        → 请把 catalog/<category>/${c.id}/meta.yaml 的 version 改成 ${c.version + 1}`,
    );
  }
}

const vocabWarnings = [];
for (const c of cases) {
  const allowed = ROLE_VOCAB[c.projection] ?? ROLE_VOCAB.rect;
  for (const col of c.schema) {
    if (col.role && !allowed.includes(col.role)) {
      vocabWarnings.push(`${c.id}（${c.projection}）里的角色「${col.role}」不在词表 [${allowed.join(", ")}] 内`);
    }
  }
}
if (vocabWarnings.length) {
  console.warn(`\n⚠️ 角色词表提醒（${vocabWarnings.length} 条，不阻断构建）：`);
  for (const w of vocabWarnings.slice(0, 20)) console.warn(`   · ${w}`);
  if (vocabWarnings.length > 20) console.warn(`   … 共 ${vocabWarnings.length} 条`);
}

if (problems.length && (!ALLOW_SAME_VERSION || RELEASE)) {
  console.error(`\n❌ 模板同步护栏拦下 ${problems.length} 条（详见上面每条的修法）：\n`);
  for (const p of problems) console.error(`   · ${p}`);
  console.error(
    RELEASE
      ? "\n   发布集必须干净：修完再跑（`--allow-same-version` 在发布模式下不生效）\n"
      : "\n   修完再跑一次；确实要临时跳过：node scripts/sync-catalog.mjs --allow-same-version\n",
  );
  process.exit(1);
}
if (problems.length && ALLOW_SAME_VERSION && !RELEASE) {
  console.warn(`\n⚠️ --allow-same-version：放行了 ${problems.length} 条未处理的模板（锁文件已更新）`);
}

/* ---------- 6. 发布集：清掉 public/ 里非发布案例的残留 ---------- */

/**
 * `public/` 是 .gitignore 的生成目录，发布构建必须清干净：
 * 否则上一次开发同步留下的 50 个案例目录 / 缩略图会一起被打进安装包。
 * （开发构建不清：那是全量同步，留着正好。）
 */
if (RELEASE) {
  const keep = new Set(cases.map((c) => c.id));
  let removed = 0;
  for (const name of readdirSync(outCases)) {
    if (keep.has(name)) continue;
    rmSync(join(outCases, name), { recursive: true, force: true });
    removed++;
  }
  const galleryDir = join(appDir, "public/gallery");
  if (existsSync(galleryDir)) {
    for (const name of readdirSync(galleryDir)) {
      if (!name.endsWith(".png")) continue;
      if (keep.has(name.replace(/\.png$/, ""))) continue;
      unlinkSync(join(galleryDir, name));
      removed++;
    }
  }
  if (removed) console.log(`[catalog] 发布集清理：移除 ${removed} 个非发布案例的残留资源`);
}

/* ---------- 7. 落盘 ---------- */

cases.sort((a, b) => a.categoryOrder - b.categoryOrder || a.order - b.order || a.id.localeCompare(b.id));
writeFileSync(join(appDir, "src/gallery/cases.json"), JSON.stringify(cases, null, 2), "utf8");
writeFileSync(
  lockPath,
  JSON.stringify(
    { note: "由 scripts/sync-catalog.mjs 生成，勿手工编辑", mode: RELEASE ? "release" : "all", cases: nextLock },
    null,
    2,
  ),
  "utf8",
);
console.log(
  RELEASE
    ? `synced ${cases.length} cases（发布集，共 ${topics.length} 个案例里 ${published.length} 个已发布）`
    : `synced ${cases.length} cases（全量，其中 ${published.length} 个已发布）`,
);
