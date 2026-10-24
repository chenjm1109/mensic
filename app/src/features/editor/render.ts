import Papa from "papaparse";
import { getCase, type GalleryCase } from "@/gallery";
import { caseSources } from "@/gallery/assets";
import type { CaseRenderSpec, PackageSpec, PngResult, SvgResult } from "@/renderers/types";
import { rendererPng, rendererScript, rendererSvg, rendererZip } from "@/renderers/registry";
import type { CaseProject, DataSet } from "@/core/types";
import { presentationFor } from "@/features/editor/presentation-merge";

export function datasetToCsv(ds: DataSet): string {
  return Papa.unparse({ fields: ds.columns, data: ds.rows });
}

/**
 * 数据映射：把「角色所选的数据列」内容写入案例期望的规范列名。
 * 这样用户可以在数据表里换列/改名，而 chart.py 仍读到它认识的列名。
 */
export function mappedData(c: GalleryCase, project: CaseProject): DataSet {
  const schema = c.schema ?? [];
  const mapping = project.mapping ?? {};
  const { columns, rows } = project.data;
  const outCols = [...columns];
  /** 需要改写的目标列（没有就整张表原样返回，省掉一次全量深拷贝） */
  const rewrites: { si: number; di: number }[] = [];
  for (const col of schema) {
    const src = mapping[col.role];
    if (!src || src === col.name) continue;
    const si = columns.indexOf(src);
    if (si < 0) continue;
    let di = outCols.indexOf(col.name);
    if (di < 0) {
      outCols.push(col.name);
      di = outCols.length - 1;
    }
    rewrites.push({ si, di });
  }
  if (rewrites.length === 0) return project.data;

  const outRows = rows.map((r) => [...r]);
  for (const { si, di } of rewrites) {
    for (let i = 0; i < outRows.length; i++) outRows[i][di] = rows[i]?.[si] ?? "";
  }
  return { name: project.data.name, columns: outCols, rows: outRows };
}

/**
 * 传给渲染器（chart.py）的参数。
 * 「图形元素」的外观覆盖并进 `params["elements"]`（`params["tokens"]` 由渲染器自己注入）——
 * 案例代码里读 `params["elements"][元素key][分组key]`，没覆盖就回落到案例参数与主题色板。
 */
function paramsFor(project: CaseProject): Record<string, unknown> {
  const elements = project.elements;
  return elements && Object.keys(elements).length > 0 ? { ...project.params, elements } : project.params;
}

async function specFor(c: GalleryCase, project: CaseProject): Promise<CaseRenderSpec> {
  const { chartSource, tokensSource } = await caseSources(c);
  const data = mappedData(c, project);
  return {
    chartSource,
    tokensSource,
    theme: project.theme ?? c.theme,
    tokensOverride: project.tokensOverride,
    params: paramsFor(project),
    presentation: presentationFor(c, project),
    data: { columns: data.columns, rows: data.rows },
    requires: c.requires,
  };
}

async function packageSpecFor(c: GalleryCase, project: CaseProject): Promise<PackageSpec> {
  const { chartSource, tokensSource } = await caseSources(c);
  return {
    chartSource,
    tokensSource,
    theme: project.theme ?? c.theme,
    tokensOverride: project.tokensOverride,
    params: paramsFor(project),
    presentation: presentationFor(c, project),
    dataCsv: datasetToCsv(mappedData(c, project)),
    title: String(project.presentation?.title || c.title),
    requires: c.requires,
  };
}

function requireCase(project: CaseProject): GalleryCase {
  const c = getCase(project.caseId);
  if (!c) throw new Error(t("案例不存在"));
  if (c.engine !== "matplotlib") throw new Error(t("该案例由 Plotly 渲染"));
  return c;
}

/** 渲染 PNG（后端由注册表在运行期决定：本端原生 → Pyodide） */
export async function renderCaseProject(project: CaseProject): Promise<PngResult> {
  return rendererPng(await specFor(requireCase(project), project));
}

/** 按需导出 SVG */
export async function renderCaseProjectSvg(project: CaseProject): Promise<SvgResult> {
  return rendererSvg(await specFor(requireCase(project), project));
}

/** 完整运行脚本 run.py 的文本 */
export async function caseScriptProject(project: CaseProject): Promise<{ script: string }> {
  const script = await rendererScript(await packageSpecFor(requireCase(project), project));
  return { script };
}

/** 可运行包（ZIP：run.py + data/ + fonts/ + requirements.txt + README.md） */
export async function packageCaseProject(project: CaseProject): Promise<{ zip: Uint8Array }> {
  const zip = await rendererZip(await packageSpecFor(requireCase(project), project));
  return { zip };
}
