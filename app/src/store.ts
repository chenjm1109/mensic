import { create } from "zustand";
import type {
  Canvas,
  CaseProject,
  DataSet,
  ElementStyle,
  Folder,
  Presentation,
  ProjectIndex,
  ProjectMeta,
  ProjectSort,
  ProjectSource,
  TemplateRef,
  TokensOverride,
} from "./core/types";
import { normalizeProject, toMeta, PROJECT_SCHEMA_VERSION, mergeElementStyle, mergeTokensOverride } from "./core/types";
import { nextOrder } from "./core/folders";
import { applyBrand, DEFAULT_BRAND } from "./core/brand";
import { DEFAULT_LOCALE, isLocale, setLocale as setI18nLocale, tAppName, type Locale } from "./core/i18n";
import { EMPTY_INDEX, initStorage, migrateLegacy, storage } from "./platform/storage";
import { loadLibrary } from "./gallery/library";

export type Page = "home" | "gallery" | "projects" | "editor" | "settings";

export interface PageTransition {
  to: Page;
  /** 首页哪一根柱子被点开（= 目标页 id）：过场层与那根柱子共用同一个 layoutId */
  motif: string;
}

/** 屏幕上的一块矩形（用于「从被点击的图连续放大到目标位置」的共享元素动画） */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 共享元素过场（Hero）：点卡片上的图后，先在原地放一张同图，等目标页的目标元素
 * 就位后，再把它逐帧放大/平移到目标位置 —— 视觉上就是「这张图变成了目标页的那张图」。
 *
 * 与 Motion 的 layoutId 相比，这里不依赖两侧同时挂载/卸载的测量，因此换行、滚动
 * 过的列表、带缩放的容器都不会跑偏。
 */
export interface HeroFlip {
  /** 本次过场的序号（同一张图被反复点击也能区分） */
  id: number;
  from: Rect;
  src: string;
  /** 目标元素选择器（在目标页里查找，取其矩形作为终点） */
  target: string;
  to: Page;
  /** 起始圆角（px），到位时收平 */
  radius: number;
  /** 目标元素还没出现时的临时落点（通常是目标页最终位置的估算值，避免「先停一下再走」） */
  fallback?: Rect;
  /**
   * 到位时应该达到的模糊半径：编辑器画布在渲染完成前本来就是模糊占位，
   * 让过场图在放大过程中逐渐变糊，落位时正好接上那个状态，就不会出现「先清晰、再突然变模糊」。
   */
  blurTo?: number;
  /** 兜底色（目标元素底色的近似，默认纸色；编辑器画布是纯白） */
  bgClass?: string;
  /**
   * 目标还没出现时是否**先原地等**（而不是立刻朝 `fallback` 走）。
   *
   * 回程（编辑器 → 创作页）用它：列表的瀑布流位置没法估算，只能等卡片挂载出来；
   * 而页面切换要等上一页退场（约 60ms），这几帧若不等就会「先停一下、目标一出现猛跳一段」。
   * 进编辑器那类有精确估算落点（estimatePreviewStage）的过场不用它 —— 它们第一帧就能朝最终位置走。
   */
  waitForTarget?: boolean;
  phase: "grow" | "landed";
}

const SETTINGS_KEY = "mensic.settings.v1";

interface Settings {
  soundEnabled: boolean;
  soundVolume: number;
  /** 主题色（强调色）；默认 DEFAULT_BRAND，用户可改 */
  accent: string;
  /** 亮 / 暗模式 */
  mode: ThemeMode;
  /** 界面语言 */
  locale: Locale;
}

function loadSettings(): Settings {
  const base: Settings = { soundEnabled: true, soundVolume: 60, accent: DEFAULT_BRAND, mode: "light", locale: DEFAULT_LOCALE };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<Settings>;
      if (typeof s.soundEnabled === "boolean") base.soundEnabled = s.soundEnabled;
      if (typeof s.soundVolume === "number") base.soundVolume = s.soundVolume;
      if (typeof s.accent === "string" && /^#[0-9a-fA-F]{6}$/.test(s.accent)) base.accent = s.accent;
      if (s.mode === "dark" || s.mode === "light") base.mode = s.mode;
      if (isLocale(s.locale)) base.locale = s.locale;
    }
  } catch {
    /* ignore */
  }
  return base;
}

function persistSettings(s: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

/** 主题模式（亮/暗）；与主题色一起构成「外观设置」 */
export type ThemeMode = "light" | "dark";

/**
 * 把当前「外观设置」写盘（新增设置项时只改这一个地方，不必逐个 action 补字段）。
 */
function persistAppearance(
  get: () => { soundEnabled: boolean; soundVolume: number; accent: string; mode: ThemeMode; locale: Locale },
  patch: Partial<Settings> = {},
): void {
  const s = get();
  persistSettings({
    soundEnabled: s.soundEnabled,
    soundVolume: s.soundVolume,
    accent: s.accent,
    mode: s.mode,
    locale: s.locale,
    ...patch,
  });
}

/**
 * 同时应用主题色、亮暗模式与语言（语言还会更新窗口标题与 <html lang>）。
 * 所有外观类状态都从这里走，避免各处遗漏。
 */
export function applyAppearance(accent: string, mode: ThemeMode, locale: Locale): void {
  applyTheme(accent, mode);
  setI18nLocale(locale);
  if (typeof document !== "undefined") document.title = tAppName(locale);
}

/** 把主题模式 + 主题色一起应用到 <html>（含 shadcn 的 --primary / --ring） */
export function applyTheme(accent: string, mode: ThemeMode): void {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  el.classList.toggle("dark", mode === "dark");
  el.style.colorScheme = mode;
  applyBrand(accent, mode === "dark");
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

const now = () => Date.now();

/* ---------------- 持久化（防抖） ---------------- */
let indexTimer: ReturnType<typeof setTimeout> | null = null;
let indexPending: ProjectIndex | null = null;
let projTimer: ReturnType<typeof setTimeout> | null = null;
let projPending: CaseProject | null = null;
let undoTimer: ReturnType<typeof setTimeout> | null = null;

function writeIndex(index: ProjectIndex): void {
  void storage().saveIndex(index).catch((e) => console.warn("[mensic] 索引保存失败：", e));
}
function scheduleIndex(index: ProjectIndex): void {
  indexPending = index;
  if (indexTimer !== null) return;
  indexTimer = setTimeout(() => {
    indexTimer = null;
    const p = indexPending;
    indexPending = null;
    if (p) writeIndex(p);
  }, 400);
}
function scheduleProject(project: CaseProject): void {
  projPending = project;
  // ⚠️ 这里**重置**计时器（尾部防抖）：连续拖滑块时只会在停下来之后写一次盘。
  // 以前是「计时器不重置」→ 长按连续拖动会每 400ms 写一遍整个项目 JSON（安卓上很重的 IO）。
  if (projTimer !== null) clearTimeout(projTimer);
  projTimer = setTimeout(() => {
    projTimer = null;
    const p = projPending;
    projPending = null;
    if (p) void storage().saveProject(p).catch((e) => console.warn("[mensic] 项目保存失败：", e));
  }, 700);
}
function flushAll(): void {
  if (indexTimer !== null) {
    clearTimeout(indexTimer);
    indexTimer = null;
  }
  if (indexPending) {
    writeIndex(indexPending);
    indexPending = null;
  }
  if (projTimer !== null) {
    clearTimeout(projTimer);
    projTimer = null;
  }
  if (projPending) {
    void storage().saveProject(projPending).catch(() => {});
    projPending = null;
  }
}
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", flushAll);
}

/* ---------------- 纯函数：索引更新 ---------------- */
function upsertMeta(index: ProjectIndex, meta: ProjectMeta): ProjectIndex {
  const exists = index.projects.some((p) => p.id === meta.id);
  const projects = exists ? index.projects.map((p) => (p.id === meta.id ? meta : p)) : [meta, ...index.projects];
  return { ...index, projects };
}
function patchMeta(index: ProjectIndex, id: string, patch: Partial<ProjectMeta>): ProjectIndex {
  return { ...index, projects: index.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)) };
}
function removeMeta(index: ProjectIndex, id: string): ProjectIndex {
  return { ...index, projects: index.projects.filter((p) => p.id !== id) };
}

export function newProjectId(): string {
  return uid();
}

interface AppState {
  page: Page;
  soundEnabled: boolean;
  soundVolume: number;
  /** 主题色（强调色） */
  accent: string;
  /** 亮 / 暗模式 */
  mode: ThemeMode;
  /** 界面语言 */
  locale: Locale;
  editorTab: "chart" | "data";
  editorPanelOpen: boolean;
  pageTransition: PageTransition | null;
  hero: HeroFlip | null;
  galleryCaseId: string | null;
  /** 打开设置前的页面（用于设置页的返回） */
  settingsReturnTo: Page | null;
  /** 进入图鉴前所在的页面：图鉴返回按钮据此回主页或创作页 */
  galleryReturnTo: "home" | "projects";

  // 项目库
  ready: boolean;
  index: ProjectIndex;
  current: CaseProject | null;
  scope: string | null; // 当前文件夹（null = 全部项目）
  selection: string[];
  selectMode: boolean; // 批量管理模式（选中 0 项时也保持开启）
  justDeleted: { items: { id: string; name: string }[] } | null; // 撤销 Toast（支持批量）

  init: () => Promise<void>;

  setPage: (page: Page) => void;
  goHome: () => void;
  openSettings: () => void;
  closeSettings: () => void;
  startPageTransition: (to: Page, motif: string) => void;
  clearPageTransition: () => void;
  /** 开始一段「图片连续放大」的共享元素过场 */
  startHero: (hero: Omit<HeroFlip, "phase" | "id">) => void;
  /** 目标位置已到达（目标页据此把真实元素亮出来） */
  landHero: () => void;
  clearHero: () => void;
  openGalleryCase: (id: string) => void;
  closeGalleryCase: () => void;
  setSoundEnabled: (value: boolean) => void;
  setSoundVolume: (value: number) => void;
  setAccent: (hex: string) => void;
  resetAccent: () => void;
  setMode: (mode: ThemeMode) => void;
  /** 切换界面语言 */
  setLocale: (locale: Locale) => void;
  setEditorTab: (tab: "chart" | "data") => void;
  setEditorPanelOpen: (open: boolean) => void;

  // 视图
  setScope: (folderId: string | null) => void;
  setSort: (sort: ProjectSort) => void;
  toggleSelect: (id: string) => void;
  setSelection: (ids: string[]) => void;
  setSelectMode: (on: boolean) => void;

  // 文件夹（只允许一级：不能建子文件夹）
  createFolder: (name: string) => void;
  renameFolder: (id: string, name: string) => void;
  deleteFolder: (id: string) => void;

  // 项目
  addProject: (project: CaseProject) => void;
  openProject: (id: string) => Promise<void>;
  closeProject: () => void;
  renameProject: (id: string, name: string) => void;
  duplicateProject: (id: string) => Promise<void>;
  deleteProject: (id: string) => void;
  deleteProjects: (ids: string[]) => void;
  restoreDeleted: () => void;
  dismissDeleted: () => void;
  moveProjects: (ids: string[], folderId: string | null) => void;
  /** 导入项目（会把模板一并装进用户模板库）。返回新项目 id 列表。 */
  importProjects: (projects: CaseProject[], folderId: string | null) => Promise<string[]>;
  saveCover: (id: string, blob: Blob) => Promise<void>;

  // 编辑当前项目
  setData: (data: DataSet) => void;
  /** 把当前项目「对齐到当前模板版本」（更新 templateRef，见 gallery/template-ref.ts） */
  alignTemplate: (ref: TemplateRef) => void;
  setParam: (key: string, value: unknown) => void;
  /** 图形元素外观：写一处「元素 + 分组」的覆盖（颜色 / 大小 / 透明度） */
  setElementStyle: (elementKey: string, groupKey: string, patch: ElementStyle) => void;
  setCanvas: (patch: Partial<Canvas>) => void;
  setPresentation: (patch: Partial<Presentation>) => void;
  setTheme: (theme: string) => void;
  setMapping: (role: string, column: string) => void;
  /** 覆盖 / 清除工程存档的数据源（配合「重选数据」） */
  setSource: (source: ProjectSource | undefined) => void;
  /** 合并写入图表令牌覆盖（「主题配色」与「文字与字体」都走它） */
  patchTokensOverride: (patch: TokensOverride) => void;
  /** 清空全部令牌覆盖，回到主题预设 */
  resetTokensOverride: () => void;
}

function patchCurrent(state: AppState, fn: (p: CaseProject) => CaseProject): Partial<AppState> {
  const cur = state.current;
  if (!cur) return {};
  const next = { ...fn(cur), updatedAt: now() };
  scheduleProject(next);
  const index = patchMeta(state.index, next.id, { ...toMeta(next), bytes: byteSize(next) });
  scheduleIndex(index);
  return { current: next, index };
}

/** 数据表体积缓存（按 data 对象身份；编辑动作总会换掉 data 对象） */
const dataBytesCache = new WeakMap<DataSet, number>();

function byteSize(p: CaseProject): number {
  // 项目体积 99% 是数据表：只在数据对象变了之后重新量一次（拖动滑块时不再每帧
  // 对整张表做 JSON.stringify —— 上千行数据时那一下就是几十毫秒的掉帧）。
  const cached = dataBytesCache.get(p.data);
  if (cached !== undefined) return cached;
  let n = 0;
  try {
    n = JSON.stringify(p.data).length;
  } catch {
    n = 0;
  }
  dataBytesCache.set(p.data, n);
  return n;
}

export const useStore = create<AppState>((set, get) => {
  const settings = loadSettings();
  /** 共享元素过场的序号（每次开始自增，用于区分「同一张图再次点击」） */
  let heroSeq = 0;

  const setIndex = (index: ProjectIndex) => {
    scheduleIndex(index);
    set({ index });
  };

  return {
    page: "home",
    soundEnabled: settings.soundEnabled,
    soundVolume: settings.soundVolume,
    accent: settings.accent,
    mode: settings.mode,
    locale: settings.locale,
    editorTab: "chart",
    editorPanelOpen: true,
    pageTransition: null,
    hero: null,
    galleryCaseId: null,
    settingsReturnTo: null,
    galleryReturnTo: "home",

    ready: false,
    index: EMPTY_INDEX,
    current: null,
    scope: null,
    selection: [],
    selectMode: false,
    justDeleted: null,

    init: async () => {
      applyAppearance(get().accent, get().mode, get().locale); // 首屏即应用主题色 + 亮暗模式 + 语言
      try {
        const s = await initStorage();
        await migrateLegacy(s);
        const index = await s.loadIndex();
        // 用户模板库要在首次渲染前读进来：图鉴列表、渲染取源码都依赖它
        await loadLibrary();
        set({ ready: true, index });
      } catch (e) {
        console.warn("[mensic] 存储初始化失败：", e);
        set({ ready: true });
      }
    },

    setPage: (page) =>
      set((s) => ({
        page,
        galleryCaseId: page === "gallery" ? s.galleryCaseId : null,
        // 进入图鉴时记住来路：只有创作页会回创作，其它入口一律回主页。
        // 放在 setPage 里，首页过场延迟切页时也能拿到正确的上一页。
        galleryReturnTo:
          page === "gallery" && s.page !== "gallery"
            ? s.page === "projects"
              ? "projects"
              : "home"
            : s.galleryReturnTo,
        // 设置页同样记住来路（首页纸片过场走的也是 setPage）；离开设置时清掉，
        // 免得旧来路让下一次「返回 / 再点设置」跑错页面。
        settingsReturnTo:
          page === "settings"
            ? s.page === "settings"
              ? s.settingsReturnTo
              : s.page
            : null,
      })),
    goHome: () => set({ page: "home", galleryCaseId: null, settingsReturnTo: null }),
    openSettings: () =>
      set((s) => ({
        settingsReturnTo: s.page === "settings" ? s.settingsReturnTo : s.page,
        page: "settings",
      })),
    closeSettings: () =>
      set((s) => ({
        page: s.settingsReturnTo && s.settingsReturnTo !== "settings" ? s.settingsReturnTo : "home",
        settingsReturnTo: null,
      })),
    startPageTransition: (to, motif) => set((s) => (s.pageTransition ? {} : { pageTransition: { to, motif } })),
    clearPageTransition: () => set({ pageTransition: null }),
    startHero: (hero) => set({ hero: { ...hero, id: ++heroSeq, phase: "grow" } }),
    landHero: () => set((s) => (s.hero ? { hero: { ...s.hero, phase: "landed" } } : {})),
    clearHero: () => set({ hero: null }),
    openGalleryCase: (id) => set({ galleryCaseId: id }),
    closeGalleryCase: () => set({ galleryCaseId: null }),
    setEditorTab: (editorTab) => set({ editorTab }),
    setEditorPanelOpen: (editorPanelOpen) => set({ editorPanelOpen }),

    setSoundEnabled: (soundEnabled) => {
      persistAppearance(get, { soundEnabled });
      set({ soundEnabled });
    },
    setSoundVolume: (value) => {
      const soundVolume = Math.min(100, Math.max(0, Math.round(value)));
      persistAppearance(get, { soundVolume });
      set({ soundVolume });
    },
    setAccent: (hex) => {
      if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
      applyTheme(hex, get().mode);
      persistAppearance(get, { accent: hex });
      set({ accent: hex });
    },
    resetAccent: () => {
      applyTheme(DEFAULT_BRAND, get().mode);
      persistAppearance(get, { accent: DEFAULT_BRAND });
      set({ accent: DEFAULT_BRAND });
    },
    setMode: (mode) => {
      applyTheme(get().accent, mode);
      persistAppearance(get, { mode });
      set({ mode });
    },
    setLocale: (locale) => {
      if (!isLocale(locale)) return;
      applyAppearance(get().accent, get().mode, locale);
      persistAppearance(get, { locale });
      set({ locale });
    },

    // 进 / 出文件夹**不要清空勾选**：批量管理是「跨文件夹」的（用户可能同时选外面和里面的项目）
    setScope: (folderId) => set({ scope: folderId }),
    setSort: (sort) => setIndex({ ...get().index, ui: { ...get().index.ui, sort } }),
    toggleSelect: (id) =>
      set((s) => ({
        selection: s.selection.includes(id) ? s.selection.filter((x) => x !== id) : [...s.selection, id],
      })),
    setSelection: (ids) => set({ selection: [...new Set(ids)] }),
    setSelectMode: (on) => set((s) => ({ selectMode: on, selection: on ? s.selection : [] })),

    createFolder: (name) => {
      const index = get().index;
      const folder: Folder = {
        id: uid(),
        name: name.trim() || t("新建文件夹"),
        parentId: null, // 只允许一级文件夹
        order: nextOrder(index.folders, null),
        createdAt: now(),
      };
      setIndex({ ...index, folders: [...index.folders, folder] });
    },
    renameFolder: (id, name) => {
      const index = get().index;
      setIndex({ ...index, folders: index.folders.map((f) => (f.id === id ? { ...f, name: name.trim() || f.name } : f)) });
    },
    deleteFolder: (id) => {
      const index = get().index;
      const folder = index.folders.find((f) => f.id === id);
      if (!folder) return;
      // 只允许一级：删除后其中的项目回到「全部项目」
      const folders = index.folders.filter((f) => f.id !== id);
      const projects = index.projects.map((p) => (p.folderId === id ? { ...p, folderId: null } : p));
      setIndex({ ...index, folders, projects });
      set((s) => ({ scope: s.scope === id ? null : s.scope }));
    },

    addProject: (project) => {
      const scope = get().scope;
      const p = normalizeProject({ ...project, folderId: project.folderId ?? scope });
      void storage().saveProject(p).catch((e) => console.warn("[mensic] 新项目保存失败：", e));
      const index = upsertMeta(get().index, { ...toMeta(p), bytes: byteSize(p) });
      setIndex(index);
      set({ current: p, page: "editor", editorTab: "chart" });
    },

    openProject: async (id) => {
      const meta = get().index.projects.find((x) => x.id === id);
      const project = await storage().loadProject(id);
      if (!project) {
        // 文件缺失：从索引移除，提示
        console.warn("[mensic] 项目文件缺失：", id);
        set({ index: removeMeta(get().index, id) });
        return;
      }
      const merged: CaseProject = meta
        ? {
            ...project,
            name: meta.name,
            folderId: meta.folderId,
            favorite: meta.favorite,
            order: meta.order,
            coverVersion: meta.coverVersion,
          }
        : project;
      const nextIndex = patchMeta(get().index, id, { lastOpenedAt: now() });
      scheduleIndex(nextIndex);
      set({ index: nextIndex, current: merged, page: "editor", editorTab: "chart" });
    },

    closeProject: () => set({ current: null, page: "projects" }),

    renameProject: (id, name) => {
      const index = patchMeta(get().index, id, { name: name.trim() || t("未命名项目"), updatedAt: now() });
      setIndex(index);
      set((s) => (s.current?.id === id ? { current: { ...s.current, name: name.trim() } } : {}));
    },

    duplicateProject: async (id) => {
      const src = await storage().loadProject(id);
      if (!src) return;
      const srcMeta = get().index.projects.find((p) => p.id === id);
      const baseName = (srcMeta?.name ?? src.name).replace(/ 副本( \d+)?$/, "");
      const siblings = new Set(get().index.projects.map((p) => p.name));
      let name = t("{v1} 副本", { v1: baseName });
      let i = 2;
      while (siblings.has(name)) name = t("{v1} 副本 {v2}", { v1: baseName, v2: i++ });
      const ts = now();
      const copy: CaseProject = {
        ...structuredClone(src),
        id: uid(),
        name,
        folderId: srcMeta?.folderId ?? src.folderId ?? null,
        favorite: false,
        createdAt: ts,
        updatedAt: ts,
        lastOpenedAt: ts,
        coverVersion: 0,
      };
      await storage().saveProject(copy);
      setIndex(upsertMeta(get().index, { ...toMeta(copy), bytes: byteSize(copy) }));
    },

    deleteProject: (id) => get().deleteProjects([id]),

    deleteProjects: (ids) => {
      const wanted = new Set(ids);
      const items = get()
        .index.projects.filter((p) => wanted.has(p.id))
        .map((p) => ({ id: p.id, name: p.name }));
      if (items.length === 0) return;
      // 先终结上一笔待删，避免多笔并发（否则撤销只能恢复最后一批）
      get().dismissDeleted();
      let index = get().index;
      for (const it of items) index = removeMeta(index, it.id);
      setIndex(index);
      set((s) => ({
        justDeleted: { items },
        selection: s.selection.filter((x) => !wanted.has(x)),
        selectMode: false,
      }));
      if (undoTimer !== null) clearTimeout(undoTimer);
      undoTimer = setTimeout(() => {
        undoTimer = null;
        get().dismissDeleted();
      }, 5000);
    },

    restoreDeleted: () => {
      const d = get().justDeleted;
      if (!d) return;
      if (undoTimer !== null) {
        clearTimeout(undoTimer);
        undoTimer = null;
      }
      // 文件未删，重建索引项
      void Promise.all(d.items.map((it) => storage().loadProject(it.id)))
        .then((loaded) => {
          let index = get().index;
          for (const p of loaded) {
            if (p) index = upsertMeta(index, { ...toMeta(p), bytes: byteSize(p) });
          }
          setIndex(index);
          set({ justDeleted: null });
        })
        .catch(() => set({ justDeleted: null }));
    },

    dismissDeleted: () => {
      if (undoTimer !== null) {
        clearTimeout(undoTimer);
        undoTimer = null;
      }
      const d = get().justDeleted;
      if (!d) return;
      set({ justDeleted: null });
      for (const it of d.items) {
        void storage().removeProject(it.id).catch(() => {});
        void storage().removeCover(it.id).catch(() => {});
      }
    },

    moveProjects: (ids, folderId) => {
      let index = get().index;
      for (const id of ids) index = patchMeta(index, id, { folderId });
      setIndex(index);
      set({ selection: [], selectMode: false });
    },

    importProjects: async (projects, folderId) => {
      let index = get().index;
      const names = new Set(index.projects.map((p) => p.name));
      const ids: string[] = [];
      for (const raw of projects) {
        const p = normalizeProject({ ...raw, id: uid(), folderId, createdAt: now(), updatedAt: now() });
        let name = p.name || t("导入项目");
        let i = 2;
        while (names.has(name)) name = `${p.name} (${i++})`;
        p.name = name;
        names.add(name);
        await storage().saveProject(p);
        index = upsertMeta(index, { ...toMeta(p), bytes: byteSize(p) });
        ids.push(p.id);
      }
      setIndex(index);
      return ids;
    },

    saveCover: async (id, blob) => {
      await storage().saveCover(id, blob);
      const meta = get().index.projects.find((p) => p.id === id);
      setIndex(patchMeta(get().index, id, { hasCover: true, coverVersion: (meta?.coverVersion ?? 0) + 1 }));
    },

    setData: (data) => set((s) => patchCurrent(s, (p) => ({ ...p, data }))),
    alignTemplate: (ref) => set((s) => patchCurrent(s, (p) => ({ ...p, templateRef: ref }))),
    setParam: (key, value) => set((s) => patchCurrent(s, (p) => ({ ...p, params: { ...p.params, [key]: value } }))),
    /** 图形元素外观（颜色 / 大小 / 透明度）：按「元素 + 分组」写一层覆盖 */
    setElementStyle: (elementKey, groupKey, patch) =>
      set((s) =>
        patchCurrent(s, (p) => ({
          ...p,
          elements: mergeElementStyle(p.elements, elementKey, groupKey, patch),
        })),
      ),
    setCanvas: (patch) => set((s) => patchCurrent(s, (p) => ({ ...p, canvas: { ...p.canvas, ...patch } }))),
    setPresentation: (patch) =>
      set((s) => patchCurrent(s, (p) => ({ ...p, presentation: { ...p.presentation, ...patch } }))),
    setTheme: (theme) => set((s) => patchCurrent(s, (p) => ({ ...p, theme }))),
    setMapping: (role, column) =>
      set((s) => patchCurrent(s, (p) => ({ ...p, mapping: { ...(p.mapping ?? {}), [role]: column } }))),
    setSource: (source) => set((s) => patchCurrent(s, (p) => ({ ...p, source }))),
    patchTokensOverride: (patch) =>
      set((s) => patchCurrent(s, (p) => ({ ...p, tokensOverride: mergeTokensOverride(p.tokensOverride, patch) }))),
    resetTokensOverride: () => set((s) => patchCurrent(s, (p) => ({ ...p, tokensOverride: undefined }))),
  };
});

export function useCurrentProject(): CaseProject | null {
  return useStore((s) => s.current);
}

export { PROJECT_SCHEMA_VERSION };
