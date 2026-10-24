import type { CaseCapabilities, TemplateRef } from "@/core/types";
import type { GalleryCase } from "./index";

/**
 * 模板能力清单（运行时取用）与「项目 ↔ 模板」的对齐判断。
 *
 * 真正的默认值表在构建期（`app/scripts/sync-catalog.mjs` 的 `CAP_DEFAULTS`）——
 * 那儿会把 `meta.yaml` 里可选的 `capabilities: { axes: none, legend: true }` 合并进去，
 * 写进 `cases.json`。这里只留一份**兜底**，防的是「cases.json 是旧版生成的 / 手写的测试数据」
 * 这种缺少字段的情况。
 */
const FALLBACK: Record<string, CaseCapabilities> = {
  rect: { projection: "rect", axes: { x: true, y: true, limits: true, ticks: true }, legend: true },
  polar: { projection: "polar", axes: { x: true, y: true, limits: true, ticks: true }, legend: true },
  figure: { projection: "figure", axes: { x: false, y: false, limits: false, ticks: false }, legend: true },
  "3d": { projection: "3d", axes: { x: false, y: false, limits: false, ticks: false }, legend: false },
};

export function capabilitiesOf(c: Pick<GalleryCase, "projection" | "capabilities">): CaseCapabilities {
  return c.capabilities ?? FALLBACK[c.projection] ?? FALLBACK.rect;
}

/** 项目创建 / 导入时记下的模板引用 */
export function makeTemplateRef(c: Pick<GalleryCase, "id" | "version" | "assetsHash">): TemplateRef {
  return { id: c.id, version: c.version, hash: c.assetsHash };
}

export interface TemplateDrift {
  /** 需要提示用户（版本变了，或同版本但内容变了） */
  stale: boolean;
  /** 版本号变了 */
  versionChanged: boolean;
  /** 版本没变但内容指纹变了（开发期改了内容忘升版本） */
  codeChanged: boolean;
  from?: number;
  to?: number;
}

/**
 * 判断「这个项目绑定的模板」和「当前模板」是否对不上。
 * 老项目没有记录 ref → 视为未知，不打扰（不误报）。
 */
export function templateDrift(ref: TemplateRef | undefined, c: GalleryCase | undefined): TemplateDrift {
  if (!c || !ref) return { stale: false, versionChanged: false, codeChanged: false };
  const versionChanged = ref.version !== c.version;
  const codeChanged = !versionChanged && ref.hash !== c.assetsHash;
  return { stale: versionChanged || codeChanged, versionChanged, codeChanged, from: ref.version, to: c.version };
}
