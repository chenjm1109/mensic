/**
 * 数据导入的模块化定义。
 *
 * 设计目标：**导入策略完全由案例的 schema 驱动**。
 * 案例在 cases.json 里声明自己需要哪些列（role + 期望列名 + 类型），
 * 导入流程就读这份声明来决定「要用户挑哪些字段」——
 * 以后案例改了列名、加了新列，这里的代码一行都不用改。
 */
import type { CaseSchemaColumn, Cell, DataSet, ImportPlan, RawSheet } from "@/core/types";

// 这两个形状会随工程一起存档（见 ProjectSource），所以定义放在 core 里，
// 这里只做转出，避免两边各写一份慢慢跑偏。
export type { ImportPlan, RawSheet };

/** 图表对某一列的需求（由案例 schema 派生） */
export interface RoleNeed {
  /** 角色标识，如 x / y / color / size / series …（任意新角色都能直接显示） */
  role: string;
  /** 界面上的中文名 */
  label: string;
  /** 案例期望的列名（用于自动匹配） */
  expected: string;
  /** quantitative / nominal / … */
  type: string;
  required: boolean;
}

/** 导入结果 */
export interface ImportResult {
  data: DataSet;
  /** 角色 → 数据里的列名（写回项目，供渲染时改名用） */
  mapping: Record<string, string>;
  rowCount: number;
}

/** 由案例 schema 派生「需要用户挑哪些字段」 */
export function roleNeeds(schema: CaseSchemaColumn[]): RoleNeed[] {
  return schema.map((s) => ({
    role: s.role,
    label: ROLE_LABEL_FALLBACK[s.role] ?? s.role,
    expected: s.name,
    type: s.type,
    required: s.required !== false,
  }));
}

/** 角色中文名（与编辑器面板一致；未知角色直接显示原标识） */
const ROLE_LABEL_FALLBACK: Record<string, string> = {
  x: "X 轴",
  y: "Y 轴",
  color: "颜色",
  size: "大小",
  series: "分组",
  label: "标签",
  value: "数值",
};

/** 角色的同义词（自动匹配用，覆盖中英文常见写法） */
export const ROLE_ALIASES: Record<string, string[]> = {
  x: ["x", "x轴", "横轴", "水平", "自变量", "时间", "time", "date", "日期", "年份", "年", "年份", "value", "longitude", "lon", "经度"],
  y: ["y", "y轴", "纵轴", "垂直", "因变量", "value", "count", "值", "数值", "销量", "sales", "贵", "lat", "latitude", "纬度"],
  color: ["color", "colour", "颜色", "配色", "等级", "level", "z", "密度", "value", "值"],
  size: ["size", "大小", "尺寸", "气泡", "权重", "weight", "population", "人口"],
  series: ["series", "group", "分组", "组别", "类别", "category", "class", "类型", "品种", "区域", "地区"],
  label: ["label", "标签", "名称", "name", "标题", "title", "text"],
  value: ["value", "数值", "值", "count", "数量", "amount", "金额"],
};

/** 把单元格文本按内容转成数字 / 文本 / 空 */
export function coerceCell(raw: string): Cell {
  const s = raw.trim();
  if (s === "" || s === "-" || s === "NA" || s === "null" || s === "NaN") return null;
  // 支持千分位、百分号、前后空格
  const cleaned = s.replace(/,/g, "");
  if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(cleaned)) return Number(cleaned);
  const pct = s.match(/^(-?\d+(\.\d+)?)%$/);
  if (pct) return Number(pct[1]) / 100;
  return s;
}

/** 归一化列名（用于自动匹配：忽略大小写、空格、下划线、标点） */
export function normName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s_\-./\\()[\]{}（）【】:：,，、|]+/g, "")
    .trim();
}
