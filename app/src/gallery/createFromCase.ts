import Papa from "papaparse";
import type { CaseProject, Cell, DataSet, RawSheet } from "@/core/types";
import { PROJECT_SCHEMA_VERSION } from "@/core/types";
import { newProjectId } from "@/store";
import { assetUrl, caseCanvas, defaultParams } from "./index";
import type { GalleryCase } from "./index";
import { makeTemplateRef } from "./template-ref";
import { storedTemplate } from "./library";

function isNumeric(v: string): boolean {
  return v !== "" && /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(v);
}
function toCell(v: string): Cell {
  const t = v.trim();
  if (t === "") return "";
  return isNumeric(t) ? Number(t) : v;
}

/**
 * 载入案例数据。除了直接可用的有效数据，还回一份**原始字符串网格**（含表头行），
 * 存进工程的 `source`，这样「重选数据」在案例项目上也能用。
 */
async function loadCaseData(c: GalleryCase): Promise<{ data: DataSet; sheet: RawSheet }> {
  const empty: DataSet = { name: `${c.id}.csv`, columns: [], rows: [] };
  // 用户导入的模板：数据就在模板库里
  const local = storedTemplate(c.id);
  const text = local
    ? local.dataCsv
    : await (async () => {
        const url = assetUrl(c.dataUrl);
        if (!url) return null;
        const res = await fetch(url);
        if (!res.ok) throw new Error(t("读取案例数据失败：{v1}", { v1: res.status }));
        return res.text();
      })();
  if (!text) return { data: empty, sheet: { name: c.title, rows: [] } };
  const parsed = Papa.parse<string[]>(text.replace(/^\uFEFF/, "").trim(), { skipEmptyLines: true });
  const rowsRaw = parsed.data as unknown as string[][];
  if (rowsRaw.length === 0) return { data: empty, sheet: { name: c.title, rows: [] } };
  const columns = rowsRaw[0].map((h) => String(h).trim());
  const rows: Cell[][] = rowsRaw
    .slice(1)
    .map((r) => columns.map((_, i) => toCell(String(r[i] ?? ""))));
  return {
    data: { name: `${c.id}.csv`, columns, rows },
    sheet: { name: c.title, rows: rowsRaw.map((r) => r.map((v) => String(v ?? ""))) },
  };
}

/** 从案例创建项目：载入案例数据 + 默认参数，进入可编辑状态 */
export async function buildCaseProject(c: GalleryCase, folderId: string | null = null): Promise<CaseProject> {
  const { data, sheet } = await loadCaseData(c);
  const t = Date.now();
  const mapping = Object.fromEntries((c.schema ?? []).map((s) => [s.role, s.name]));
  return {
    id: newProjectId(),
    name: c.title,
    caseId: c.id,
    data,
    params: defaultParams(c),
    presentation: { title: c.title, subtitle: "" },
    canvas: caseCanvas(c),
    createdAt: t,
    updatedAt: t,
    folderId,
    favorite: false,
    order: 0,
    lastOpenedAt: t,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    coverVersion: 0,
    theme: c.theme,
    mapping,
    // 记下「这个项目是按模板的哪个版本做的」：模板以后改了，靠它发现对不上
    templateRef: makeTemplateRef(c),
    // 案例自带的数据是整表进来的：表头在第 1 行、不转置、保留全部列
    source: {
      fileName: `${c.id}.csv`,
      sheets: [sheet],
      plan: { headerRow: 0, transpose: false, mapping, keepUnused: true },
      savedAt: t,
    },
  };
}
