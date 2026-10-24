import { strToU8, strFromU8, unzipSync, zipSync } from "fflate";
import type { CaseProject, StoredTemplate } from "@/core/types";
import { normalizeProject } from "@/core/types";
import type { GalleryCase } from "@/gallery";

/**
 * `.mensic` 项目包（zip）：**连模板一起带走**，对方一定能打开。
 *
 * ```
 * manifest.json    { kind, formatVersion, appVersion, createdAt, template: {id,version,hash,embedded} }
 * project.json     项目本体（含数据；打开即用）
 * template/        模板（可选，默认内嵌）
 *   template.json    定义（含 schema / params / presentation / 能力清单）
 *   source.py        matplotlib 实现；Plotly 案例存的是 spec 文本
 *   data.csv         模板自带数据
 *   thumb.png        缩略图（可选）
 * preview.png      导出时的成品图（导入预览 / 项目封面）
 * ```
 *
 * 约定：
 *  - `formatVersion` 用于将来迁移；读到更高版本要明确提示「请升级应用」，不要瞎猜；
 *  - 模板 `version` + `hash` 与内置/本地库比对，判断「同一个模板但内容不同」；
 *  - 导入**永远分配新的项目 id**，不覆盖本机已有项目。
 */
export const PACKAGE_FORMAT_VERSION = 1;
export const PACKAGE_KIND = "mensic.project";
export const COLLECTION_KIND = "mensic.collection";
/**
 * 改名前的包标识（`vizart.project` / `vizart.collection`）与扩展名（`.vizart`）。
 * ⚠️ **只为读旧包保留**：别人之前发来的 `.vizart` 仍然要能解析，别删。
 */
const LEGACY_PACKAGE_KINDS = ["vizart.project"];
const LEGACY_COLLECTION_KINDS = ["vizart.collection"];
const PACKAGE_EXT_RE = /\.(mensic|vizart)$/;

/** 把多个项目打成「一包多图」：外层 zip 里每张图仍是完整的 `.mensic` 包（各自带模板） */
export async function buildCollectionPackage(
  items: { name: string; blob: Blob }[],
  fileName: string,
): Promise<BuiltPackage> {
  const files: Record<string, Uint8Array> = {};
  files["manifest.json"] = strToU8(
    JSON.stringify(
      { kind: COLLECTION_KIND, formatVersion: PACKAGE_FORMAT_VERSION, createdAt: Date.now(), count: items.length },
      null,
      2,
    ),
  );
  for (let i = 0; i < items.length; i++) {
    const safe = items[i].name.replace(/[\\/:*?"<>|]/g, "_").replace(PACKAGE_EXT_RE, "");
    files[`packages/${String(i + 1).padStart(2, "0")}-${safe}.mensic`] = new Uint8Array(
      await items[i].blob.arrayBuffer(),
    );
  }
  const zip = zipSync(files, { level: 6 });
  return { name: fileName, blob: new Blob([zip as unknown as BlobPart], { type: "application/zip" }) };
}

/** 外层是不是「一包多图」（返回里面每个项目包的字节；不是的话返回空数组） */
export function unzipCollection(bytes: Uint8Array): Uint8Array[] {
  try {
    const files = unzipSync(bytes);
    const m = files["manifest.json"];
    if (!m) return [];
    const manifest = JSON.parse(strFromU8(m)) as { kind?: string };
    if (![COLLECTION_KIND, ...LEGACY_COLLECTION_KINDS].includes(String(manifest.kind))) return [];
    return Object.entries(files)
      .filter(([name]) => name.startsWith("packages/") && PACKAGE_EXT_RE.test(name))
      .map(([, data]) => data);
  } catch {
    return [];
  }
}

export interface PackageManifest {
  kind: string;
  formatVersion: number;
  appVersion?: string;
  createdAt: number;
  /** 模板引用：embedded=true 表示包里带着模板 */
  template?: { id: string; version: number; hash: string; embedded: boolean };
}

export interface BuiltPackage {
  name: string;
  blob: Blob;
}

/** 只保留渲染与面板需要的东西（去掉 notes / 大字段） */
export function templateDefOf(c: GalleryCase): Record<string, unknown> {
  return {
    id: c.id,
    title: c.title,
    category: c.category,
    categoryTitle: c.categoryTitle,
    categoryOrder: c.categoryOrder,
    tags: c.tags,
    summary: c.summary,
    order: c.order,
    engine: c.engine,
    theme: c.theme,
    projection: c.projection,
    canvas: c.canvas,
    params: c.params,
    elements: c.elements ?? [],
    presentation: c.presentation,
    schema: c.schema,
    requires: c.requires,
    capabilities: c.capabilities,
  };
}

/** 打包一个项目（连同它的模板） */
export async function buildProjectPackage(opts: {
  project: CaseProject;
  template?: GalleryCase;
  /** 模板的实现源码（map: "matplotlib" → chart.py 文本；Plotly → spec 文本） */
  templateSource?: string;
  templateData?: string;
  /** 缩略图 / 成品图（来自项目封面或当前渲染结果） */
  thumb?: Blob | null;
  preview?: Blob | null;
}): Promise<BuiltPackage> {
  const { project, template } = opts;
  const files: Record<string, Uint8Array> = {};

  const manifest: PackageManifest = {
    kind: PACKAGE_KIND,
    formatVersion: PACKAGE_FORMAT_VERSION,
    appVersion: "0.1.0",
    createdAt: Date.now(),
    template: template
      ? {
          id: template.id,
          version: template.version,
          hash: template.assetsHash,
          embedded: true,
        }
      : undefined,
  };
  files["manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));
  files["project.json"] = strToU8(JSON.stringify(project));

  if (template) {
    files["template/template.json"] = strToU8(JSON.stringify(templateDefOf(template), null, 2));
    if (opts.templateSource != null) {
      files[template.engine === "plotly" ? "template/spec.json" : "template/source.py"] = strToU8(opts.templateSource);
    }
    if (opts.templateData != null) files["template/data.csv"] = strToU8(opts.templateData);
    if (opts.thumb) files["template/thumb.png"] = new Uint8Array(await opts.thumb.arrayBuffer());
  }
  if (opts.preview) files["preview.png"] = new Uint8Array(await opts.preview.arrayBuffer());

  const zip = zipSync(files, { level: 6 });
  return {
    name: `${(project.name || "project").replace(/[\\/:*?"<>|]/g, "_")}.mensic`,
    blob: new Blob([zip as unknown as BlobPart], { type: "application/zip" }),
  };
}

export interface ParsedPackage {
  manifest: PackageManifest;
  project: CaseProject;
  template?: StoredTemplate;
}

/** 解析项目包（含模板就一并解析出来） */
export function parseProjectPackage(bytes: Uint8Array): ParsedPackage {
  const files = unzipSync(bytes);
  const read = (name: string): string | null => {
    const f = files[name];
    return f ? strFromU8(f) : null;
  };
  const manifestRaw = read("manifest.json");
  const projectRaw = read("project.json");
  if (!manifestRaw || !projectRaw) throw new Error("包里缺少 manifest.json / project.json");
  const manifest = JSON.parse(manifestRaw) as PackageManifest;
  if (![PACKAGE_KIND, ...LEGACY_PACKAGE_KINDS].includes(String(manifest.kind))) {
    throw new Error(t("这不是涵数的项目包"));
  }
  if (manifest.formatVersion > PACKAGE_FORMAT_VERSION) {
    throw new Error(t("这个项目包来自更高版本的应用（v{v1}），请先升级。", { v1: manifest.formatVersion }));
  }
  const project = normalizeProject(JSON.parse(projectRaw) as CaseProject);

  let template: StoredTemplate | undefined;
  const defRaw = read("template/template.json");
  if (defRaw) {
    const def = JSON.parse(defRaw) as Record<string, unknown>;
    const id = String(def.id ?? project.caseId);
    const source = read("template/source.py") ?? read("template/spec.json") ?? "";
    const dataCsv = read("template/data.csv") ?? "";
    const thumbBytes = files["template/thumb.png"];
    template = {
      id,
      version: Number(manifest.template?.version ?? 1),
      hash: String(manifest.template?.hash ?? ""),
      def: { ...def, id },
      source,
      dataCsv,
      thumb: thumbBytes ? new Blob([thumbBytes as unknown as BlobPart], { type: "image/png" }) : undefined,
      installedAt: Date.now(),
    };
  }

  const preview = files["preview.png"];
  return {
    manifest,
    project: preview ? { ...project, coverVersion: project.coverVersion } : project,
    template,
  };
}

/** 包里带的预览图（导入时当项目封面） */
export function previewBlobOf(bytes: Uint8Array): Blob | null {
  try {
    const f = unzipSync(bytes)["preview.png"];
    return f ? new Blob([f as unknown as BlobPart], { type: "image/png" }) : null;
  } catch {
    return null;
  }
}
