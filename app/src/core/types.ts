// 核心类型：案例驱动（case-based）模型 + matplotlib(Pyodide) 渲染。

export type Cell = string | number | null;

export interface DataSet {
  name: string;
  columns: string[];
  rows: Cell[][];
}

export interface Canvas {
  width: number;
  height: number;
}

export interface Presentation {
  title: string;
  subtitle: string;
  /** 以下为可选的呈现覆盖（与渲染器 presentation 字段一致） */
  xlabel?: string | null;
  ylabel?: string | null;
  /** 坐标范围覆盖；某轴写 `null` = 明确去掉该轴范围（含案例自带的） */
  limits?: { x?: [number, number] | null; y?: [number, number] | null };
  ticks?: {
    x_major?: number;
    x_minor?: number;
    y_major?: number;
    y_minor?: number;
    /** 刻度朝向：`in` = 内刻度，`out` = 外刻度（**不写 = 外**，matplotlib 的默认） */
    direction?: "in" | "out";
  };
  legend?: boolean | { loc?: string; ncols?: number; frameon?: boolean };
}

/** 案例数据列的角色（用于「数据映射」面板） */
export interface CaseSchemaColumn {
  name: string;
  role: string;
  type: string;
  required?: boolean;
}

/** 原始工作表（尚未确定表头，全部按字符串读入，保证各种文件统一处理） */
export interface RawSheet {
  name: string;
  rows: string[][];
}

/** 一次导入的用户选择（会被存档，供「重选数据」预填向导） */
export interface ImportPlan {
  /** 表头所在行（0 基）；-1 表示无表头，用「列 1/列 2…」。
   *  由「数据范围」的起始行推出：起始行 − 2（起始行 = 第 2 行 → 表头是第 1 行）。 */
  headerRow: number;
  /** 数据范围的最后一行（1 基，相对当前视图）；null = 到最后一行 */
  endRow?: number | null;
  /** 变量在行上（需要转置） */
  transpose: boolean;
  /** 角色 → 源列名 */
  mapping: Record<string, string>;
  /** 是否保留没有被用到的列 */
  keepUnused: boolean;
}

/**
 * 模板与项目之间的绑定。
 *
 * ⚠️ 这是「模板演进 ↔ 已有项目」不失同步的地基：
 *  - `id` 稳定不变（永远不要用同一个 id 装两套语义）；
 *  - `version` 是**内容版本**：改 schema / params / presentation / 代码 / 数据都必须 +1；
 *  - `hash` 是**内容指纹**：即使忘了升 version，也能靠它发现「同版本但内容不同」。
 * 详见 `app/scripts/sync-catalog.mjs`（构建期护栏）与 `gallery/template-ref.ts`（运行期对齐）。
 */
export interface TemplateRef {
  id: string;
  version: number;
  hash: string;
}

/**
 * 模板「能力清单」：这张图**有哪些**可配置的东西。
 * 面板按它决定显示哪些配置项（例如饼图没有直角坐标轴 → 不显示轴名 / 轴范围 / 图例）。
 * 现在由 projection + schema 推导（见 `gallery/capabilities.ts`），存量模板零改动。
 */
export interface CaseCapabilities {
  /** 投影类型：rect / polar / 3d / pie / … */
  projection: string;
  axes: {
    /** 有 X 轴（可配轴名） */
    x: boolean;
    /** 有 Y 轴（可配轴名） */
    y: boolean;
    /** 轴范围可配 */
    limits: boolean;
    /** 有刻度文字（刻度文本样式、网格线、轴边框才有意义） */
    ticks: boolean;
  };
  /** 图例可配 */
  legend: boolean;
}

/**
 * 用户模板库里的一个模板（导入进来的模板）。
 * 只存「渲染 + 面板」真正需要的东西：定义（含 schema/params/presentation/能力清单）、
 * 该引擎的实现源码、模板自带数据；缩略图可选。
 */
export interface StoredTemplate {
  id: string;
  version: number;
  hash: string;
  /** 模板定义（与内置 cases.json 里的一条同构） */
  def: Record<string, unknown>;
  /** 实现源码（matplotlib 的 chart.py；Plotly 案例为 spec 文本） */
  source: string;
  /** 模板自带数据的 CSV 文本 */
  dataCsv: string;
  /** 缩略图（可选；没有就用项目封面或占位） */
  thumb?: Blob;
  /** 安装时间 */
  installedAt: number;
}

/**
 * 工程里存档的**数据源**。
 *
 * 一个工程有两组数据，别混：
 * 1. **数据源**（本类型）—— 导入时原样存下来的原始表 + 那一次的导入选择；
 * 2. **有效数据**（`CaseProject.data`）—— 数据表格里真正在编辑、渲染用的那份。
 *
 * 「导入数据」= 换一份新的数据源，两组一起替换；
 * 「重选数据」= 拿这份存档重做一次字段映射，只替换第 2 组。
 */
export interface ProjectSource {
  /** 原始文件名（只存档；参数栏不展示） */
  fileName: string;
  sheets: RawSheet[];
  /** 上次的导入选择，重选时预填 */
  plan: ImportPlan;
  savedAt: number;
}

export type Params = Record<string, unknown>;

/**
 * 「图形元素」的外观覆盖：图里**画出来的那一类东西**（散点的点、折线的线…）长什么样。
 *
 * 为什么单独一层、而不塞进 `params`：分组图表里**每个分组各有一份**（分组散点图 = A 组一个、
 * B 组一个，各自有大小 / 透明度 / 颜色），而 `params` 是「一张图一份」的标量参数，套不上。
 *
 * 只存用户**改过**的字段：没写 = 用模板给的默认值（大小 / 透明度来自案例参数，
 * 颜色来自主题色板）。这样「改回默认」不会在项目里留下脏数据。
 */
export interface ElementStyle {
  /** 颜色；不写 = 跟随主题色板（按分组在数据里首次出现的顺序取） */
  color?: string;
  /** 大小（散点是点的面积）；不写 = 用模板默认 */
  size?: number;
  /** 透明度 0~1；不写 = 用模板默认 */
  opacity?: number;
}

/**
 * 项目里的元素覆盖表：`elements[元素key][分组key] = 覆盖值`。
 * 分组 key 就是分组列的取值（如 "A"）；**不分组**的图只有一份，key 用 `SINGLE_GROUP`。
 */
export type ElementStyles = Record<string, Record<string, ElementStyle>>;

/** 单组图表的元素 key（分组图表用分组列的取值当 key） */
export const SINGLE_GROUP = "*";

/**
 * 合并一处元素覆盖；写 `undefined` = 清除该项，回到模板默认。
 * 清完的层会被删掉，项目里不留空壳（与 `mergeTokensOverride` 同一套思路）。
 */
export function mergeElementStyle(
  styles: ElementStyles | undefined,
  elementKey: string,
  groupKey: string,
  patch: ElementStyle,
): ElementStyles | undefined {
  const next: ElementStyles = {};
  for (const [k, groups] of Object.entries(styles ?? {})) next[k] = { ...groups };
  const groups: Record<string, ElementStyle> = { ...(next[elementKey] ?? {}) };
  const bucket: ElementStyle = { ...(groups[groupKey] ?? {}), ...patch };
  for (const k of Object.keys(bucket) as (keyof ElementStyle)[]) {
    if (bucket[k] === undefined) delete bucket[k];
  }
  if (Object.keys(bucket).length === 0) delete groups[groupKey];
  else groups[groupKey] = bucket;
  if (Object.keys(groups).length === 0) delete next[elementKey];
  else next[elementKey] = groups;
  return Object.keys(next).length > 0 ? next : undefined;
}

/**
 * 图表令牌覆盖（与 `design/tokens.yaml` **同形状**，只存用户改过的那部分）。
 *
 * 为什么做成同形状：`chart.py` 取色是 `params["tokens"]["color"]["palette"][i]`，
 * 所以只要把用户改的颜色并进 tokens，**案例代码一行都不用改**；
 * 导出包里内联的就是合并后的 tokens，预览与导出天然一致。
 *
 * 优先级：tokens.yaml 基础值 < 案例主题（rose / slate）< 本覆盖。
 */
export interface TokensOverride {
  color?: {
    /** 画布背景（整张图的底色 → matplotlib 的 figure.facecolor） */
    figure?: string;
    /** 绘图区背景（坐标轴里那块 → axes.facecolor） */
    axes?: string;
    /** 边框 */
    edge?: string;
    /** 标题 / 正文 */
    text?: string;
    /** 轴标签 */
    label?: string;
    /** 刻度文本。基础 tokens 里**故意不定义**这个键：一旦有值就表示用户要接管刻度颜色
     *  （各案例里常自己给刻度上色，例如双轴图左右各一色，所以默认不去覆盖它们）。 */
    tick?: string;
    /** 网格线 */
    grid?: string;
    /** 分类色板：按「分组在数据里首次出现的顺序」逐个取用 */
    palette?: string[];
  };
  font?: {
    /** 中文字体族（缺字时的兜底，中文不出方块靠它） */
    cjk?: string;
    /** 英文字体族（数字 / 拉丁字母用它，缺字自动回退中文字体） */
    latin?: string;
    /** 遗留：早期的单一「字体」选项。老项目里可能还留着，渲染时按老规则处理（见 render.py 的 _font_family） */
    primary?: string;
    /** 全局字号（轴标签 / 刻度留空时跟随它） */
    size?: number;
    /** 全局字重（轴标签 / 刻度的字重选「跟随全局」时用它） */
    weight?: string;
    /** 轴标签字号。不写 = 跟随全局字号 */
    axis_label_size?: number;
    /** 轴标签字重。不写 = 跟随全局字重 */
    axis_label_weight?: string;
    /** 刻度字号。不写 = 跟随全局字号 */
    tick_label_size?: number;
    /** 刻度字重。不写 = 跟随全局字重 */
    tick_label_weight?: string;
  };
  /**
   * 绘图区边框（坐标轴那圈线）。`on` 不写 = 不接管，用模板自己的；颜色仍走 `color.edge`。
   * `spines` = 四条边线各自的显示（true / 不写 = 显示，false = 不显示）。
   * ⚠️ 界面已不再写 `on`（改成直接控制上下左右四条边），它只为兼容旧项目保留。
   */
  frame?: {
    on?: boolean;
    spines?: {
      top?: boolean;
      bottom?: boolean;
      left?: boolean;
      right?: boolean;
    };
  };
  /**
   * 网格线。`on` 不写 = **不接管**（默认：很多模板自己画网格 ——
   * 柱状图的白线、极坐标只画 x 轴、日历图的 minor 格 —— 一律覆盖会把它们的设计抹平）。
   * `on: true` = 按下面这套样式统一施加到所有轴；`on: false` = 统一关掉。颜色仍走 `color.grid`。
   */
  grid?: {
    on?: boolean;
    /** matplotlib linestyle："-" 实线 / "--" 虚线 / ":" 点线 / "-." 点划线 */
    style?: string;
    width?: number;
    alpha?: number;
  };
}

/** 深合并令牌覆盖；字段给 `undefined` 表示「清除该字段，回到主题默认」 */
export function mergeTokensOverride(
  base: TokensOverride | undefined,
  patch: TokensOverride,
): TokensOverride | undefined {
  const color = { ...(base?.color ?? {}), ...patch.color };
  const font = { ...(base?.font ?? {}), ...patch.font };
  const frame = { ...(base?.frame ?? {}), ...patch.frame };
  const grid = { ...(base?.grid ?? {}), ...patch.grid };
  for (const k of Object.keys(color) as (keyof NonNullable<TokensOverride["color"]>)[]) {
    if (color[k] === undefined) delete color[k];
  }
  for (const k of Object.keys(font) as (keyof NonNullable<TokensOverride["font"]>)[]) {
    if (font[k] === undefined) delete font[k];
  }
  for (const k of Object.keys(frame)) {
    if (frame[k as keyof typeof frame] === undefined) delete frame[k as keyof typeof frame];
  }
  for (const k of Object.keys(grid)) {
    if (grid[k as keyof typeof grid] === undefined) delete grid[k as keyof typeof grid];
  }
  const out: TokensOverride = {};
  if (Object.keys(color).length > 0) out.color = color;
  if (Object.keys(font).length > 0) out.font = font;
  if (Object.keys(frame).length > 0) out.frame = frame;
  if (Object.keys(grid).length > 0) out.grid = grid;
  // ⚠️ 这里必须**列出所有子块**：只判断 color / font 的话，只改边框或网格的那次补丁会被整个丢掉
  //    （表现为「绘图区边框 / 显示网格的开关点不动」）。
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * 覆盖层里真的改过东西吗？
 * ⚠️ 同样要覆盖**所有子块**（别只数 color / font）。
 */
export function hasTokensOverride(o: TokensOverride | undefined): boolean {
  if (!o) return false;
  return (Object.keys(o) as (keyof TokensOverride)[]).some(
    (k) => Object.keys((o[k] as object | undefined) ?? {}).length > 0,
  );
}

/** 项目：绑定一个案例（case），数据/参数可编辑 */
export interface CaseProject {
  id: string;
  name: string;
  caseId: string;
  data: DataSet;
  params: Params;
  /** 图形元素的外观覆盖（按「元素 → 分组」两层；没改过就是空） */
  elements?: ElementStyles;
  presentation: Presentation;
  canvas: Canvas;
  createdAt: number;
  updatedAt: number;
  /** 所属文件夹（null = 未归类） */
  folderId: string | null;
  /** ⚠️ 收藏功能已整体移除：字段只为兼容旧数据保留，不再有 UI / setter（排序也不再按它置顶） */
  favorite: boolean;
  /** 手动排序权重（越小越靠前） */
  order: number;
  /** 最近打开时间 */
  lastOpenedAt: number;
  /** 数据模型版本（用于迁移） */
  schemaVersion: number;
  /** 封面版本（用于失效判定） */
  coverVersion: number;
  /** 主题覆盖（为空则用案例主题） */
  theme?: string;
  /** 数据映射：角色 → 项目中数据列名 */
  mapping?: Record<string, string>;
  /** 导入时存档的数据源（供「重选数据」复用；老项目可能没有） */
  source?: ProjectSource;
  /** 图表令牌覆盖（配色 / 字体），见 TokensOverride */
  tokensOverride?: TokensOverride;
  /** 创建这个项目时所用模板的版本与指纹（老项目没有；见 TemplateRef） */
  templateRef?: TemplateRef;
}

/** 文件夹（层级组织，面包屑导航） */
export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  order: number;
  createdAt: number;
}

/** 项目元数据：列表/索引使用，不含 data/params 等重内容 */
export interface ProjectMeta {
  id: string;
  name: string;
  caseId: string;
  folderId: string | null;
  favorite: boolean;
  order: number;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number;
  hasCover: boolean;
  coverVersion: number;
  bytes: number;
}

export type ProjectSort = "updated" | "created" | "name" | "case";

/** 项目索引（元数据 + 文件夹 + UI 偏好） */
export interface ProjectIndex {
  version: number;
  folders: Folder[];
  projects: ProjectMeta[];
  ui: { sort: ProjectSort };
}

export const PROJECT_SCHEMA_VERSION = 3;

/**
 * 数值规范化（v3 起在加载老项目时执行一次）：
 * 1. 能是整数的写成整数（含 22.000000000000004 这种精度噪声）；
 * 2. |v| >= 0.01 的四舍五入到 2 位小数；
 * 3. 0 < |v| < 0.01 的保留 3 位有效数字（数据里的极小值不能被抹成 0，例如体积场 1.1e-05）。
 */
export function tidyNumber(v: Cell): Cell {
  if (typeof v !== "number" || !Number.isFinite(v)) return v;
  if (Math.abs(v - Math.round(v)) < 1e-9) return Math.round(v);
  if (Math.abs(v) >= 0.01) return Number(v.toFixed(2));
  return Number(v.toPrecision(3));
}

/** 对整个数据集做数值规范化 */
export function tidyDataSet(data: DataSet): DataSet {
  return { ...data, rows: data.rows.map((row) => row.map(tidyNumber)) };
}

/** 从项目内容派生元数据 */
export function toMeta(p: CaseProject): ProjectMeta {
  return {
    id: p.id,
    name: p.name,
    caseId: p.caseId,
    folderId: p.folderId ?? null,
    favorite: !!p.favorite,
    order: typeof p.order === "number" ? p.order : 0,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    lastOpenedAt: p.lastOpenedAt ?? 0,
    hasCover: (p.coverVersion ?? 0) > 0,
    coverVersion: p.coverVersion ?? 0,
    bytes: 0,
  };
}

/** 规范化为当前模型（兼容旧数据） */
export function normalizeProject(p: Partial<CaseProject> & { id: string }): CaseProject {
  const nowMs = Date.now();
  return {
    id: p.id,
    name: p.name ?? t("未命名项目"),
    caseId: p.caseId ?? "",
    data: p.data ?? { name: "data.csv", columns: [], rows: [] },
    params: p.params ?? {},
    elements: p.elements,
    presentation: p.presentation ?? { title: p.name ?? "", subtitle: "" },
    canvas: p.canvas ?? { width: 1200, height: 750 },
    createdAt: p.createdAt ?? nowMs,
    updatedAt: p.updatedAt ?? nowMs,
    folderId: p.folderId ?? null,
    favorite: !!p.favorite,
    order: typeof p.order === "number" ? p.order : 0,
    lastOpenedAt: p.lastOpenedAt ?? 0,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    coverVersion: p.coverVersion ?? 0,
    theme: p.theme,
    mapping: p.mapping,
    source: p.source,
    tokensOverride: p.tokensOverride,
    templateRef: p.templateRef,
  };
}


/** 仍用于 Plotly（3D）渲染视图 */
export interface BuildResult {
  data: Record<string, unknown>[];
  layout: Record<string, unknown>;
}
