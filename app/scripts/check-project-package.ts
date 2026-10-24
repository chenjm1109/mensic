/**
 * 项目包（.mensic）格式自检。
 *
 * 验的是「导出 → 解析」这一整条链路不丢东西：
 *  1. 打包出来的东西能被解析回来（manifest / project / template 三块齐全）；
 *  2. 模板的版本与内容指纹原样带过去（导入端靠它判断「同名但不同内容」）；
 *  3. 项目本体（数据 / 参数 / 映射 / 模板引用）逐字段一致；
 *  4. 更高 formatVersion 的包要**明确拒绝**，不能瞎猜；
 *  5. 不带模板的包也能解析（只是 template 为空）。
 *
 * 用法：npx esbuild scripts/check-project-package.ts --bundle --platform=node --format=cjs --outfile=.chk.cjs && node .chk.cjs
 */

// 核心模块里会用到全局 t（i18n 在浏览器里注入 globalThis.t），node 下给个直通实现
(globalThis as unknown as { t: (s: string) => string }).t = (s: string) => s;

import type { CaseProject } from "@/core/types";
import type { GalleryCase } from "@/gallery";
import { PACKAGE_FORMAT_VERSION, PACKAGE_KIND, buildProjectPackage, parseProjectPackage } from "@/packages/project-package";

const fail: string[] = [];
function ok(cond: boolean, msg: string) {
  if (!cond) fail.push(msg);
}

const template = {
  id: "demo-template",
  title: "演示模板",
  category: "scatter",
  categoryTitle: "散点图",
  categoryOrder: 10,
  tags: ["演示"],
  summary: "",
  order: 1,
  image: null,
  dataUrl: "cases/demo-template/data.csv",
  specUrl: null,
  engine: "matplotlib",
  theme: "rose",
  projection: "rect",
  canvas: { size: [8, 5], dpi: 150 },
  params: [{ key: "point_size", type: "number", default: 100, min: 10, max: 400 }],
  elements: [{ key: "point", label: "数据点", size: "point_size", opacity: "alpha" }],
  presentation: { title: { text: "演示", loc: "left" } },
  schema: [
    { name: "x", role: "x", type: "quantitative", required: true },
    { name: "y", role: "y", type: "quantitative", required: true },
  ],
  requires: [],
  version: 7,
  assetsHash: "abc123def456",
  capabilities: { projection: "rect", axes: { x: true, y: true, limits: true, ticks: true }, legend: true },
} as unknown as GalleryCase;

const project = {
  id: "p1",
  name: "我的图",
  caseId: template.id,
  data: { name: "data.csv", columns: ["x", "y"], rows: [[1, 2], [3, 4]] },
  params: { point_size: 120 },
  elements: { point: { "*": { size: 180, color: "#1F9D55" } } },
  presentation: { title: { text: "我的图", loc: "left" } },
  canvas: { width: 1200, height: 750 },
  createdAt: 1,
  updatedAt: 2,
  folderId: null,
  favorite: false,
  order: 0,
  lastOpenedAt: 0,
  schemaVersion: 3,
  coverVersion: 0,
  theme: "rose",
  mapping: { x: "x", y: "y" },
  templateRef: { id: template.id, version: template.version, hash: template.assetsHash },
} as unknown as CaseProject;

async function main() {
  // 1) 带模板的包
  const pkg = await buildProjectPackage({
    project,
    template,
    templateSource: "def create_chart(ax, data, params):\n    pass\n",
    templateData: "x,y\n1,2\n3,4\n",
  });
  ok(pkg.name === "我的图.mensic", `包名应为「我的图.mensic」，实得 ${pkg.name}`);
  const bytes = new Uint8Array(await pkg.blob.arrayBuffer());
  ok(bytes.length > 200, "包体积异常");

  const parsed = parseProjectPackage(bytes);
  ok(parsed.manifest.kind === PACKAGE_KIND, "manifest.kind 不对");
  ok(parsed.manifest.formatVersion === PACKAGE_FORMAT_VERSION, "manifest.formatVersion 不对");
  ok(parsed.manifest.template?.embedded === true, "manifest 应标记模板已内嵌");
  ok(parsed.manifest.template?.version === 7, "manifest 里的模板版本丢了");
  ok(parsed.manifest.template?.hash === "abc123def456", "manifest 里的模板指纹丢了");

  ok(!!parsed.template, "包里应能解析出模板");
  ok(parsed.template?.id === template.id, "模板 id 不一致");
  ok(parsed.template?.version === 7, "模板 version 不一致");
  ok(parsed.template?.hash === "abc123def456", "模板 hash 不一致");
  ok(parsed.template?.source.includes("create_chart"), "模板源码丢了");
  ok(parsed.template?.dataCsv.includes("3,4"), "模板数据丢了");
  ok((parsed.template?.def as { capabilities?: unknown })?.capabilities != null, "模板能力清单丢了");

  ok(parsed.project.caseId === template.id, "项目 caseId 不一致");
  ok(parsed.project.name === "我的图", "项目名不一致");
  ok(parsed.project.data.rows.length === 2, "项目数据行数不一致");
  ok(parsed.project.params.point_size === 120, "项目参数不一致");
  ok(
    parsed.project.elements?.point?.["*"]?.size === 180 && parsed.project.elements?.point?.["*"]?.color === "#1F9D55",
    "图形元素覆盖（按元素 + 分组）没随包走",
  );
  ok((parsed.template?.def as { elements?: unknown })?.elements != null, "模板的图形元素声明丢了");
  ok(parsed.project.mapping?.x === "x", "项目映射不一致");
  ok(parsed.project.templateRef?.version === 7, "项目里的模板引用丢了");

  // 2) 不带模板的包
  const pkg2 = await buildProjectPackage({ project });
  const parsed2 = parseProjectPackage(new Uint8Array(await pkg2.blob.arrayBuffer()));
  ok(parsed2.template === undefined, "没带模板的包不该解析出模板");
  ok(parsed2.project.id === "p1", "无模板包的项目应能正常解析");

  // 3) 更高版本 → 明确拒绝
  let rejected = false;
  try {
    const { zipSync, strToU8 } = await import("fflate");
    const future = zipSync({
      "manifest.json": strToU8(JSON.stringify({ kind: PACKAGE_KIND, formatVersion: PACKAGE_FORMAT_VERSION + 1, createdAt: 0 })),
      "project.json": strToU8(JSON.stringify(project)),
    });
    parseProjectPackage(new Uint8Array(future as unknown as ArrayBuffer));
  } catch {
    rejected = true;
  }
  ok(rejected, `formatVersion 更高时应拒绝，而不是硬解析`);

  if (fail.length) {
    console.error(`项目包自检失败 ${fail.length} 项：`);
    for (const f of fail) console.error(`  · ${f}`);
    process.exit(1);
  }
  console.log("项目包自检全部通过");
}

void main();
