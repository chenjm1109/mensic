/**
 * 「主题配色 / 文字与字体」两个分区共用的小工具。
 *
 * 三件事：
 * 1. `parseTokenDefaults` —— 从 `design/tokens.yaml` 里读出基础色板与字体候选
 *    （界面要显示"默认是什么颜色"，而项目里没有 YAML 解析依赖，所以只认本项目自己的写法）；
 * 2. `paletteGroups` —— 找出分组列在数据里出现的顺序，与 chart.py 的 `palette[i]` 对齐；
 * 3. `effectivePalette` —— 把「用户覆盖」与「主题默认」拼成界面上实际要展示的色板。
 */
import type { CaseSchemaColumn, DataSet, TokensOverride } from "@/core/types";

export interface TokenDefaults {
  /** tokens.yaml 顶层 color 块里的标量（figure / axes / edge / text / label / grid …） */
  color: Record<string, string>;
  /** tokens.yaml 的分类色板 */
  palette: string[];
  /** font.weight / font.size 等标量（数值也按字符串存，界面用时再转） */
  font: Record<string, string>;
  /** font.family 候选族 */
  families: string[];
  /** themes: 下的预设名 */
  themes: string[];
  /** 每个预设里的 color 覆盖（`themes.<name>.color.*`）—— 界面要按当前主题解析默认值 */
  themeColors: Record<string, Record<string, string>>;
  /** grid.width（网格线线宽的模板默认值） */
  gridWidth?: number;
}

const EMPTY: TokenDefaults = { color: {}, palette: [], font: {}, families: [], themes: [], themeColors: {} };

/** 只解析我们需要的几个块；解析不到就返回空，界面会退化成「不显示默认色」而不是报错 */
export function parseTokenDefaults(text: string): TokenDefaults {
  const out: TokenDefaults = { color: {}, palette: [], font: {}, families: [], themes: [], themeColors: {} };
  const scalar = /^\s+([A-Za-z0-9_]+):\s*(?:"([^"]+)"|([^"\s]+))\s*$/;
  /** 只有键、没有值（`palette:` / `family:`）—— 后面跟着的就是列表项 */
  const bare = /^\s+([A-Za-z0-9_]+):\s*$/;
  const item = /^\s+-\s*(?:"([^"]+)"|([^"\s]+))\s*$/;
  let section: string | null = null;
  let list: "palette" | "families" | null = null;
  /** themes: 下当前正在读的预设名（`themes.<name>.color.*`） */
  let themeName: string | null = null;

  for (const raw of text.split(/\r?\n/)) {
    // 只把「空白 + # 后面还有空白/行尾」当注释 —— 否则会把 "#ffffff" 这种色值也当注释切掉
    const line = raw.replace(/\s+#(?=\s|$).*$/, "").trimEnd();
    if (!line.trim()) continue;
    const indent = line.length - line.trimStart().length;

    if (indent === 0) {
      const top = line.match(/^([A-Za-z0-9_]+):\s*$/);
      section = top ? top[1] : null;
      list = null;
      themeName = null;
      continue;
    }
    if (section === "themes") {
      // 预设名（2 空格）／`color:` 块（4 空格）／块里的键（6 空格）——
      // 界面要用「主题预设解析后的颜色」当默认值，否则显示的和渲染出来的对不上（刻度色曾因此不一致）。
      const name = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
      if (name) {
        themeName = name[1];
        out.themes.push(themeName);
        out.themeColors[themeName] = {};
        continue;
      }
      if (themeName && /^ {4}color:\s*$/.test(line)) continue;
      const kv = themeName ? line.match(/^ {6}([A-Za-z0-9_]+):\s*(?:"([^"]+)"|([^"\s#]+))\s*$/) : null;
      if (kv) out.themeColors[themeName as string][kv[1]] = kv[2] ?? kv[3];
      continue;
    }
    if (section === "color" || section === "font" || section === "grid") {
      const kv = line.match(scalar);
      if (kv) {
        const key = kv[1];
        const val = kv[2] ?? kv[3];
        list = null;
        if (section === "color") out.color[key] = val;
        else if (section === "font") out.font[key] = val;
        else if (key === "width") out.gridWidth = Number(val);
        continue;
      }
      const bk = line.match(bare);
      if (bk) {
        const key = bk[1];
        list = section === "color" && key === "palette" ? "palette" : section === "font" && key === "family" ? "families" : null;
        continue;
      }
      const li = line.match(item);
      if (li && list) (list === "palette" ? out.palette : out.families).push(li[1] ?? li[2]);
    }
  }
  return out;
}

/**
 * 分组列里各分组的出现顺序 —— 与案例 `chart.py` 里
 * `for i, g in enumerate(data[col].unique())` + `palette[i % len]` 严格对齐。
 * 没有分组角色（单系列图）时返回空数组，界面就退化成普通色板。
 */
export function paletteGroups(
  schema: CaseSchemaColumn[],
  data: DataSet,
  mapping: Record<string, string>,
): string[] {
  const role = schema.find((s) => s.role === "series") ?? schema.find((s) => s.role === "color");
  if (!role) return [];
  const col = mapping[role.role] || role.name;
  const i = data.columns.indexOf(col);
  if (i < 0) return [];
  const seen: string[] = [];
  const set = new Set<string>();
  for (const row of data.rows) {
    const v = row[i];
    if (v === null || v === undefined || v === "") continue;
    const s = String(v);
    // 用 Set 判重（原来是 seen.includes）：分组多 + 行多时那是 O(n·k)
    if (set.has(s)) continue;
    set.add(s);
    seen.push(s);
  }
  return seen;
}

/**
 * 界面要展示的色板：第 i 位优先用用户覆盖，否则回落到主题默认（循环取）。
 * `count` 是分组数（或至少 1，用于普通色板编辑）。
 */
export function effectivePalette(
  override: TokensOverride | undefined,
  base: string[],
  count: number,
): string[] {
  const over = override?.color?.palette;
  const n = Math.max(count, 1);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(over?.[i] ?? base[i % Math.max(1, base.length)] ?? "#888888");
  }
  return out;
}

/** 把某一格改成新颜色（写成整条色板，保证顺序稳定、可预期） */
export function withPaletteColor(
  override: TokensOverride | undefined,
  base: string[],
  count: number,
  index: number,
  color: string,
): string[] {
  const next = effectivePalette(override, base, count);
  next[index] = color;
  return next;
}

export const DEFAULT_TOKEN_DEFAULTS = EMPTY;
