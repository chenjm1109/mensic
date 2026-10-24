import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  ClipboardPaste,
  Columns3,
  Copy,
  Eraser,
  Rows3,
  Trash2,
} from "lucide-react";
import {
  CompactSelection,
  DataEditor,
  GridCellKind,
  type DataEditorProps,
  type EditableGridCell,
  type GridCell,
  type GridColumn,
  type GridSelection,
  type Item,
  type Rectangle,
} from "@glideapps/glide-data-grid";
import "@glideapps/glide-data-grid/dist/index.css";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { brandTokens } from "@/core/brand";
import { readClipboardText, writeClipboardText } from "@/core/clipboard";
import type { DataSet } from "@/core/types";
import { rowsForAction } from "@/features/data/selection";
import { blockToTsv, parseDelimited } from "@/features/data/tsv";
import { sfx } from "@/sound";
import { useStore } from "@/store";
import { TYPO } from "@/core/typography";
import { cn } from "@/lib/utils";

/**
 * 画布要的是**真实的字体族串**：`inherit` 在 canvas 的 `font` 简写里是非法值，
 * 整串会被浏览器忽略（字号也就跟着失效）。这里读一次 body 的计算字体（应用的 sans 栈）。
 */
let uiFontFamilyCache: string | null = null;
function uiFontFamily(): string {
  if (uiFontFamilyCache) return uiFontFamilyCache;
  try {
    uiFontFamilyCache = getComputedStyle(document.body).fontFamily || "sans-serif";
  } catch {
    uiFontFamilyCache = "sans-serif";
  }
  return uiFontFamilyCache;
}

// 表格主题：中性底 + 应用主题色（选中、聚焦、强调）。跟随亮/暗模式。
// `scale` = 表格缩放（Ctrl+滚轮 / 双指捏合），字号与内边距跟着按比例放大。
function useGridTheme(scale = 1) {
  const accent = useStore((s) => s.accent);
  const dark = useStore((s) => s.mode) === "dark";
  return useMemo(() => {
    const b = brandTokens(accent, dark);
    // 画布绘制读不到 CSS 变量，这里的颜色必须在 JS 里按当前模式算好
    const c = dark
      ? {
          textDark: "#ece8e1",
          textMedium: "#bdb6aa",
          textLight: "#8d8577",
          bgCell: "#1a1917",
          bgCellMedium: "#232220",
          bgHeader: "#232220", // 列名行：中性深灰（不跟主题色）
          bgBubble: "#232220",
          borderColor: "#34322e",
          horizontalBorderColor: "#2a2825",
        }
      : {
          textDark: "#1f2328",
          textMedium: "#5b6068",
          textLight: "#9aa0a6",
          bgCell: "#ffffff",
          bgCellMedium: "#f7f7f7",
          bgHeader: "#f7f7f7", // 列名行：中性浅灰（不跟主题色，也不要暖黄）
          bgBubble: "#ffffff",
          borderColor: "#e9e4da",
          horizontalBorderColor: "#efece5",
        };
    return {
      // 选中态用**浅主题色**（与 Tab 选中态同一档），不再压饱和色块。
      // glide-data-grid 里 accentLight 才是「选区填充」，默认值为 rgba(...,0.1) 的浅色。
      accentLight: b.soft, // 选区填充（浅主题色）
      accentColor: b.strong, // 强色调：选区描边等
      accentFg: dark ? "#1a1917" : "#ffffff",
      accentFaded: b.soft, // 失焦的选区
      textHeaderSelected: b.deep, // 选中列头的文字
      textBubble: c.textDark,
      ...c,
      bgHeaderHasFocus: b.soft, // 聚焦表头
      bgHeaderHovered: b.soft,
      fontFamily: uiFontFamily(),
      // ⚠️ glide 的正文字体是 `${baseFontStyle} ${fontFamily}` 拼出来的，**不看 `fontSize`** ——
      //    所以字号必须写进 `baseFontStyle`（行号是 `markerFontStyle`，表头是 `headerFontStyle`），
      //    否则缩放时只有行高 / 列宽变大、文字纹丝不动。
      baseFontStyle: `${Math.round(13 * scale)}px`,
      markerFontStyle: `${Math.round(9 * scale)}px`,
      headerFontStyle: `700 ${Math.round(12 * scale)}px`, // 列名加粗（背景保持浅灰，不跟主题色）
      fontSize: Math.round(13 * scale),
      editorFontSize: `${Math.round(13 * scale)}px`,
      cellHorizontalPadding: Math.round(8 * scale),
      cellVerticalPadding: Math.max(2, Math.round(3 * scale)),
    };
  }, [accent, dark, scale]);
}

/* ============================================================
   表格缩放：Ctrl/⌘ + 滚轮，以及触屏的双指捏合
   - 缩放的是**表格自己**（字号 / 行高 / 列宽 / 行号列宽），不是整个界面；
   - 范围 0.6~3，落在本次会话里（sessionStorage）—— 视图状态，不进项目数据；
   - 手势期间在右下角显示当前百分比，点它恢复 100%。
   ============================================================ */

const ZOOM_KEY = "mensic.table-zoom.v1";
const ZOOM_MIN = 0.6;
const ZOOM_MAX = 3;

function clampZoom(v: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(v * 100) / 100));
}

function readZoom(): number {
  try {
    const raw = sessionStorage.getItem(ZOOM_KEY);
    const n = raw === null ? 1 : Number(raw);
    return Number.isFinite(n) ? clampZoom(n) : 1;
  } catch {
    return 1;
  }
}

/**
 * 绑定缩放手势，返回当前缩放比例。
 * 三个要点：
 *  1. 滚轮 / 触摸都要用**非 passive** 的原生监听（capture 阶段）：`preventDefault`
 *     才能拦住 WebView 自己的「Ctrl+滚轮 = 页面缩放」和「双指捏合 = 页面缩放」，
 *     同时也不会让网格跟着滚一格；
 *  2. 宿主元素上写 `touch-action: pan-x pan-y`：允许单指平移，但不让浏览器抢走双指手势；
 *  3. 缩放只改表格自身的尺寸，不动整个界面 —— 其他面板的观感不受影响。
 */
function useTableZoom(host: React.RefObject<HTMLDivElement | null>) {
  const [scale, setScale] = useState(readZoom);
  const [showBadge, setShowBadge] = useState(false);
  const badgeTimer = useRef<number | null>(null);
  const pinch = useRef<{ dist: number; scale: number } | null>(null);

  const apply = useCallback((next: number) => {
    setScale((prev) => {
      const v = clampZoom(next);
      if (v === prev) return prev;
      try {
        sessionStorage.setItem(ZOOM_KEY, String(v));
      } catch {
        /* 忽略：存不下也只是这次会话不记住 */
      }
      return v;
    });
    setShowBadge(true);
    if (badgeTimer.current !== null) window.clearTimeout(badgeTimer.current);
    badgeTimer.current = window.setTimeout(() => setShowBadge(false), 1200);
  }, []);

  useEffect(() => {
    const el = host.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return; // 只有带修饰键才缩放，普通滚轮照常滚动表格
      e.preventDefault();
      // 向下滚 = 缩小、向上滚 = 放大；用指数映射，快慢手感一致
      apply(readZoom() * Math.exp(-e.deltaY * 0.0015));
    };

    const dist = (list: TouchList) => Math.hypot(list[0].clientX - list[1].clientX, list[0].clientY - list[1].clientY);

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      pinch.current = { dist: dist(e.touches), scale: readZoom() };
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !pinch.current) return;
      e.preventDefault(); // 拦住「双指 = 页面缩放」
      apply(pinch.current.scale * (dist(e.touches) / Math.max(1, pinch.current.dist)));
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch.current = null;
    };

    el.addEventListener("wheel", onWheel, { passive: false, capture: true });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("wheel", onWheel, { capture: true });
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [apply, host]);

  useEffect(() => {
    return () => {
      if (badgeTimer.current !== null) window.clearTimeout(badgeTimer.current);
    };
  }, []);

  // glide 的单元格编辑器被传送到 `#portal`（`#root` 的兄弟），拿不到网格上的主题变量，
  // 所以把编辑器字号写到**根元素**上（styles.css 里的 `#portal .gdg-input` 读它）。
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--gdg-editor-font-size", `${Math.round(13 * scale)}px`);
    return () => {
      root.style.removeProperty("--gdg-editor-font-size");
    };
  }, [scale]);

  return {
    scale,
    /** 手势进行中的百分比角标（点击恢复 100%） */
    badge: showBadge ? (
      <button
        type="button"
        data-sfx="none"
        onClick={() => apply(1)}
        title={t("点击恢复 100%")}
        className="chrome text-ink-3 hover:text-ink pointer-events-auto absolute right-3 bottom-3 z-10 rounded-md px-2 py-1 tabular-nums"
        style={{ fontSize: 11 }}
      >
        {Math.round(scale * 100)}%
      </button>
    ) : null,
  };
}

/** 缩放后的行高 / 表头高（glide 默认 34 / 36） */
function zoomSizes(scale: number) {
  return { rowHeight: Math.round(34 * scale), headerHeight: Math.round(36 * scale) };
}

interface Props {
  data: DataSet;
  onChange: (data: DataSet) => void;
}

/** 右键菜单目标：单元格 / 表头 / 行号 */
type MenuTarget =
  | { kind: "cell"; col: number; row: number } // col = -1 表示行号列
  | { kind: "header"; col: number };

interface MenuState {
  x: number;
  y: number;
  target: MenuTarget;
}

/* ============================================================
   剪贴板：与 Excel / CSV 互通
   - 复制：走网格内置复制（TSV + HTML，Excel 直接认），另在右键菜单里提供
   - 粘贴：自己听 paste 事件，从 e.clipboardData 同步取文本（不依赖
     navigator.clipboard.read —— 桌面端 WebView2 下可能没权限），
     按 TSV 解析后写入，行不够会自动补行
   ============================================================ */

/**
 * 数据表格：**只编辑值，不改结构**。
 *
 * 列 = 案例的数据结构（由案例 schema 与导入向导决定），因此不提供新增 / 删除 / 重命名列。
 * 用户要改轴标题，去「坐标轴」里改轴名 —— 那里改的是呈现层，不动数据。
 * 行则是普通数据，可以插入 / 删除，且支持**一次删掉框选到的多行**。
 */
export function DataTable({ data, onChange }: Props) {
  const colCount = data.columns.length;
  const hostRef = useRef<HTMLDivElement>(null);
  const { scale: zoom, badge: zoomBadge } = useTableZoom(hostRef);
  const gridTheme = useGridTheme(zoom);

  const [menu, setMenu] = useState<MenuState | null>(null);
  // 右键事件在坐标处的屏幕位置（capture 阶段记录，早于网格自身处理）
  const pointerAt = useRef({ x: 0, y: 0 });

  // 列由图表数据结构（案例 schema）决定，不提供「添加列」
  const columns: GridColumn[] = useMemo(
    () =>
      data.columns.map((name, i) => ({
        id: `c${i}`,
        title: name,
        // 列宽跟着缩放走（否则放大字号后表头会被截断）
        width: Math.round(150 * zoom),
        hasMenu: false,
      })),
    [data.columns, zoom],
  );

  const getCellContent = useCallback(
    (cell: Item): GridCell => {
      const [col, row] = cell;
      const v = data.rows[row]?.[col];
      const s = v == null ? "" : String(v);
      return { kind: GridCellKind.Text, data: s, displayData: s, allowOverlay: true };
    },
    [data.rows, colCount],
  );

  const applyEdits = useCallback(
    (edits: readonly { location: Item; value: EditableGridCell }[]) => {
      if (edits.length === 0) return;
      const rows = data.rows.map((r) => [...r]);
      let changed = false;
      for (const { location, value } of edits) {
        if (value.kind !== GridCellKind.Text) continue;
        const [col, row] = location;
        if (col >= colCount) continue; // 忽略占位列上的改动
        if (!rows[row]) rows[row] = data.columns.map(() => "");
        rows[row][col] = value.data;
        changed = true;
      }
      if (changed) onChange({ ...data, rows });
    },
    [data, onChange, colCount],
  );

  const onCellEdited = (cell: Item, newValue: EditableGridCell) => {
    applyEdits([{ location: cell, value: newValue }]);
    sfx("edit");
  };

  const onCellsEdited: DataEditorProps["onCellsEdited"] = (edits) => {
    applyEdits(edits as readonly { location: Item; value: EditableGridCell }[]);
    sfx("edit");
    return true; // 表示已处理（粘贴等批量编辑）
  };

  /* ---------------- 行编辑操作（列是固定结构，不参与） ---------------- */

  const deleteRows = (rows: number[]) => {
    if (rows.length === 0) return;
    const drop = new Set(rows);
    onChange({ ...data, rows: data.rows.filter((_, i) => !drop.has(i)) });
    // 选区里的行已经不存在了，清掉免得指向越界行
    setGridSel(undefined);
    sfx("delete");
  };

  const insertRowAt = (at: number) => {
    const rows = data.rows.map((r) => [...r]);
    const clamped = Math.max(0, Math.min(at, rows.length));
    rows.splice(clamped, 0, data.columns.map(() => ""));
    onChange({ ...data, rows });
    sfx("select");
  };

  /* ---------------- 剪贴板（与 Excel / CSV 互通） ---------------- */

  // 注意：glide-data-grid 只要收到 onGridSelectionChange 就进入「受控」模式 ——
  // 它会停止更新内部选区，必须由父组件把 gridSelection 回传，否则点选/框选/行选列选全部失灵。
  const [gridSel, setGridSel] = useState<GridSelection | undefined>(undefined);

  const onGridSelectionChange = useCallback((s: GridSelection) => {
    setGridSel(s);
  }, []);

  /**
   * 网格要选区内容时来问这里（Ctrl+C 复制、导出都走它）。
   * 注意：库的包装层 `useCellsForSelection` 已经**把行号列偏移减掉了**，这里收到的是纯数据坐标，
   * 不要再减一次（减了就会错位/少列）。它还会在选区包含行号列时自行补一个占位格。
   */
  const getCellsForSelection = useCallback(
    (selection: Rectangle): GridCell[][] => {
      const out: GridCell[][] = [];
      for (let y = selection.y; y < selection.y + selection.height; y++) {
        const row: GridCell[] = [];
        for (let x = selection.x; x < selection.x + selection.width; x++) {
          if (x < 0 || x >= colCount) continue; // 越界（含占位列）不进剪贴板
          const s = String(data.rows[y]?.[x] ?? "");
          row.push({ kind: GridCellKind.Text, data: s, displayData: s, allowOverlay: false });
        }
        out.push(row);
      }
      return out;
    },
    [data.rows, colCount],
  );

  /** 选区（onGridSelectionChange 回调给的是**数据坐标**，不含行号列）；没有选区时返回 null */
  const selectionRange = () => {
    const range = gridSel?.current?.range;
    if (!range) return null;
    const x = Math.max(0, range.x);
    const width = Math.max(1, Math.min(range.width, colCount - x));
    return { x, y: range.y, width, height: range.height };
  };

  /** 一块矩形 → TSV（Excel / CSV 都认） */
  const copyBlockToTsv = (x: number, y: number, w: number, h: number, withHeader = false) =>
    blockToTsv(data.rows, data.columns, x, y, w, h, withHeader);

  /** 写剪贴板：桌面端走原生（不弹权限气泡），浏览器才用新 API；都失败再退回 execCommand */
  const writeClipboard = async (tsv: string) => {
    try {
      await writeClipboardText(tsv);
      sfx("notify");
      return;
    } catch {
      /* 继续尝试旧接口 */
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = tsv;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      sfx(ok ? "notify" : "error", ok ? 1 : 0.7);
    } catch {
      sfx("error", 0.7);
    }
  };

  /** 复制：有选区就复制选区，否则复制指定的单元格 / 整行 */
  const copyCellOrSelection = (cell?: { col: number; row: number }, withHeader = false) => {
    setMenu(null);
    const sel = selectionRange();
    if (sel) return void writeClipboard(copyBlockToTsv(sel.x, sel.y, sel.width, sel.height, withHeader));
    if (!cell) return;
    if (cell.col < 0) return void writeClipboard(copyBlockToTsv(0, cell.row, colCount, 1, withHeader));
    return void writeClipboard(copyBlockToTsv(cell.col, cell.row, 1, 1, withHeader));
  };

  /** 把二维文本写到 target 起：行不够自动补行，列超出表格则忽略 */
  const writeBlock = (targetCol: number, targetRow: number, block: string[][]) => {
    if (block.length === 0) return false;
    const startCol = Math.max(0, targetCol);
    const widest = block.reduce((n, r) => Math.max(n, r.length), 0);
    const width = Math.min(widest, colCount - startCol);
    if (width <= 0) return false;
    const rows = data.rows.map((r) => [...r]);
    while (rows.length < targetRow + block.length) rows.push(data.columns.map(() => ""));
    for (let i = 0; i < block.length; i++) {
      const r = rows[targetRow + i];
      if (!r) continue;
      for (let j = 0; j < width; j++) r[startCol + j] = block[i][j] ?? "";
    }
    onChange({ ...data, rows });
    sfx("edit");
    return true;
  };

  /** 粘贴落点：选区左上角 → 选中行/列 → 左上角 */
  const pasteTarget = (cell?: { col: number; row: number }): [number, number] => {
    if (cell && cell.col >= 0) return [cell.col, cell.row];
    if (cell && cell.col < 0) return [0, cell.row]; // 行号列：从该行首列写入
    const range = gridSel?.current?.range;
    if (range) return [Math.max(0, range.x), range.y];
    const firstRow = gridSel?.rows.first();
    if (firstRow !== undefined) return [0, firstRow];
    const firstCol = gridSel?.columns.first();
    if (firstCol !== undefined) return [Math.max(0, firstCol), 0];
    return [0, 0];
  };

  /** 右键菜单里的「粘贴」：读系统剪贴板（桌面端走原生，不弹权限气泡；失败时提示用 Ctrl+V） */
  const pasteCellOrSelection = async (cell?: { col: number; row: number }) => {
    setMenu(null);
    try {
      const text = await readClipboardText();
      if (!text) return;
      const block = parseDelimited(text);
      if (block.length === 0) return;
      const [c, r] = pasteTarget(cell);
      writeBlock(c, r, block);
    } catch {
      sfx("error", 0.7);
    }
  };

  // Ctrl+V：自己接管（同步从 clipboardData 取文本，桌面端最稳）
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const el = e.target as HTMLElement | null;
      // 正在用输入框编辑单元格 / 弹窗里的输入框：交回给它自己
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      const text = e.clipboardData?.getData("text/plain");
      if (!text) return;
      const block = parseDelimited(text);
      if (block.length === 0) return;
      e.preventDefault();
      const [c, r] = pasteTarget();
      writeBlock(c, r, block);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [data, onChange, gridSel]);

  /** 右键菜单里「选中整列 / 整行」：库里拖拽列头是「移动列」而不是选区，所以给一个明确的鼠标入口 */
  const selectColumnAt = (col: number, add: boolean) => {
    setMenu(null);
    if (col < 0 || col >= colCount) return;
    const columns = add
      ? (gridSel?.columns ?? CompactSelection.empty()).add(col)
      : CompactSelection.fromSingleSelection(col);
    setGridSel({ current: undefined, rows: CompactSelection.empty(), columns });
    sfx("select");
  };

  const selectRowAt = (row: number, add: boolean) => {
    setMenu(null);
    if (row < 0 || row >= data.rows.length) return;
    const rows = add
      ? (gridSel?.rows ?? CompactSelection.empty()).add(row)
      : CompactSelection.fromSingleSelection(row);
    setGridSel({ current: undefined, rows, columns: CompactSelection.empty() });
    sfx("select");
  };

  /**
   * Ctrl/Cmd+A：自己接管。
   * 库里的 selectAll 在有行号列时是「x 从行号列起算、宽度却按数据列数算」，会少选最后一列
   * （去掉末尾「＋ 添加列」占位列之后就露出来了）。这里直接全选数据区。
   */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
      if (e.key.toLowerCase() !== "a") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const host = hostRef.current;
      if (!host) return;
      const active = document.activeElement as Node | null;
      if (!host.contains(t) && !(active && host.contains(active))) return; // 只在表格里生效
      e.preventDefault();
      const height = data.rows.length;
      if (colCount <= 0 || height <= 0) return;
      setGridSel({
        current: { cell: [0, 0], range: { x: 0, y: 0, width: colCount, height }, rangeStack: [] },
        rows: CompactSelection.empty(),
        columns: CompactSelection.empty(),
      });
      sfx("select");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [data.rows.length, colCount]);

  const clearCell = (col: number, row: number) => {
    if (col < 0 || col >= colCount || !data.rows[row]) return;
    const rows = data.rows.map((r) => [...r]);
    rows[row][col] = "";
    onChange({ ...data, rows });
    sfx("edit");
  };

  const clearColumn = (col: number) => {
    if (col < 0 || col >= colCount) return;
    onChange({ ...data, rows: data.rows.map((r) => r.map((v, i) => (i === col ? "" : v))) });
    sfx("edit");
  };

  /* ---------------- 右键菜单 ---------------- */

  const openMenu = (target: MenuTarget) => {
    const { x, y } = pointerAt.current;
    setMenu({ x, y, target });
  };

  const onCellContextMenu: DataEditorProps["onCellContextMenu"] = (cell, e) => {
    e.preventDefault();
    openMenu({ kind: "cell", col: cell[0], row: cell[1] });
  };

  const onHeaderContextMenu: DataEditorProps["onHeaderContextMenu"] = (col, e) => {
    e.preventDefault();
    openMenu({ kind: "header", col });
  };

  const onRowAppended = () => {
    onChange({ ...data, rows: [...data.rows, data.columns.map(() => "")] });
    sfx("select");
    return Promise.resolve("bottom" as const);
  };

  /**
   * Delete 键：删掉选中的整行。
   * 列是固定结构，所以这里**不再处理列**（以前整列选中 + Delete 会把列删掉，与约束冲突）。
   * 矩形框选时 `sel.rows` 是空的（信息在 `sel.current.range`），按 Delete 不删行 ——
   * 删多行走右键菜单，避免「按一下 Delete 少掉好几行」这种误伤。
   */
  const onDelete: DataEditorProps["onDelete"] = (sel: GridSelection) => {
    const rowsToDelete = Array.from(sel.rows).filter((i) => i >= 0 && i < data.rows.length);
    if (rowsToDelete.length === 0) return false;
    deleteRows(rowsToDelete);
    return true;
  };

  // 点击末尾「＋」列头新增列 —— 已移除：列由图表数据结构决定

  const renderMenuItems = (target: MenuTarget) => {
    /** 「删除行」的文案：命中多行时把行数说清楚，免得用户以为只删一行 */
    const rowDeleteLabel = (row: number) => {
      const n = rowsForAction(gridSel, data.rows.length, row).length;
      return n > 1 ? t("删除选中的 {v1} 行", { v1: n }) : t("删除此行");
    };
    const rowDeleteItem = (row: number) => (
      <DropdownMenuItem
        variant="destructive"
        onSelect={() => deleteRows(rowsForAction(gridSel, data.rows.length, row))}
      >
        <Trash2 /> {rowDeleteLabel(row)}
      </DropdownMenuItem>
    );

    if (target.kind === "header") {
      if (target.col < 0) return null; // 行号列头：无操作
      return (
        <>
          <DropdownMenuItem onSelect={() => selectColumnAt(target.col, false)}>
            <Columns3 /> {t("选中此列")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => selectColumnAt(target.col, true)}>
            <Columns3 /> {t("追加选中此列")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => clearColumn(target.col)}>
            <Eraser /> {t("清空该列")}
          </DropdownMenuItem>
        </>
      );
    }

    const { col, row } = target;
    // 行号列：仅行操作
    if (col < 0) {
      return (
        <>
          <DropdownMenuItem onSelect={() => selectRowAt(row, false)}>
            <Rows3 /> {t("选中此行")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => selectRowAt(row, true)}>
            <Rows3 /> {t("追加选中此行")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => copyCellOrSelection({ col: -1, row })}>
            <Copy /> {t("复制该行")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void pasteCellOrSelection({ col: -1, row })}>
            <ClipboardPaste /> {t("粘贴到该行")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => insertRowAt(row)}>
            <ArrowUpToLine /> {t("上方插入行")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => insertRowAt(row + 1)}>
            <ArrowDownToLine /> {t("下方插入行")}
          </DropdownMenuItem>
          {rowDeleteItem(row)}
        </>
      );
    }
    return (
      <>
        <DropdownMenuLabel className={cn(TYPO.caption, "font-normal text-muted-foreground")}>
          第 {row + 1} 行
        </DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => copyCellOrSelection({ col, row })}>
          <Copy /> {t("复制")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => copyCellOrSelection({ col, row }, true)}>
          <Copy /> {t("复制（含列名）")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void pasteCellOrSelection({ col, row })}>
          <ClipboardPaste /> {t("粘贴（Excel / CSV）")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => insertRowAt(row)}>
          <ArrowUpToLine /> {t("上方插入行")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => insertRowAt(row + 1)}>
          <ArrowDownToLine /> {t("下方插入行")}
        </DropdownMenuItem>
        {rowDeleteItem(row)}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => clearCell(col, row)}>
          <Eraser /> {t("清空单元格")}
        </DropdownMenuItem>
      </>
    );
  };

  return (
    <div
      ref={hostRef}
      className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col"
      // 单指可以平移，但双指捏合留给表格自己处理（见 useTableZoom）
      style={{ touchAction: "pan-x pan-y" }}
      onContextMenuCapture={(e) => {
        pointerAt.current = { x: e.clientX, y: e.clientY };
      }}
    >
      <div className="min-h-0 flex-1">
        <DataEditor
          columns={columns}
          rows={data.rows.length}
          // 选区：行列都允许 Ctrl/Cmd+点击 追加（multi），单元格允许存在多个矩形选区（multi-rect）
          rowSelect="multi"
          columnSelect="multi"
          rangeSelect="multi-rect"
          getCellContent={getCellContent}
          getCellsForSelection={getCellsForSelection}
          gridSelection={gridSel}
          onGridSelectionChange={onGridSelectionChange}
          keybindings={{ paste: false, selectAll: false }} // 粘贴 / 全选自己处理（见上面的监听）
          onCellEdited={onCellEdited}
          onCellsEdited={onCellsEdited}
          onDelete={onDelete}
          onRowAppended={onRowAppended}
          onCellContextMenu={onCellContextMenu}
          onHeaderContextMenu={onHeaderContextMenu}
          trailingRowOptions={{ hint: t("添加行"), tint: true, sticky: true }}
          rowMarkers="both"
          rowMarkerWidth={Math.round(48 * zoom)}
          // 行高 / 表头高也按比例（glide 默认 34 / 36）
          {...zoomSizes(zoom)}
          cellActivationBehavior="double-click"
          smoothScrollX
          smoothScrollY
          theme={gridTheme as DataEditorProps["theme"]}
          width="100%"
          height="100%"
        />
      </div>

      {/* 缩放百分比角标（手势期间出现，点一下恢复 100%） */}
      {zoomBadge}

      {/* 单元格 / 表头右键菜单（虚拟锚点定位） */}
      <DropdownMenu
        open={menu !== null}
        onOpenChange={(o) => {
          if (!o) setMenu(null);
        }}
      >
        <DropdownMenuTrigger asChild>
          <span
            aria-hidden
            style={{
              position: "fixed",
              left: menu?.x ?? -9999,
              top: menu?.y ?? -9999,
              width: 1,
              height: 1,
              pointerEvents: "none",
            }}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className={cn(TYPO.label, "w-52 border-line shadow-[0_12px_30px_-20px_rgba(60,50,35,0.45)]")}
          side="bottom"
          align="start"
          sideOffset={2}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {menu && renderMenuItems(menu.target)}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
