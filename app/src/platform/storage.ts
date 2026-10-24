// 项目存储抽象：桌面（Tauri 文件系统 / AppData）与 Web（IndexedDB）同一接口。
// - 列表只读写「索引」；打开/保存才读写单个项目文件；封面单独存二进制。
// - Tauri 路径用 BaseDirectory.AppData（三端自动映射），不写死任何平台路径。
import type { CaseProject, ProjectIndex, ProjectMeta, StoredTemplate } from "@/core/types";
import { normalizeProject, toMeta, tidyDataSet, PROJECT_SCHEMA_VERSION } from "@/core/types";
import { isTauri } from "./index";

/**
 * 加载项目时的一次性数据迁移：
 * v2 及更早的项目，数据里带很长的小数（当年自动生成时没约束位数），
 * 这里规范一次；保存后就带上当前版本号，不会重复处理。
 */
function loadProjectNorm(raw: unknown): CaseProject {
  const project = normalizeProject(raw as CaseProject);
  const ver = (raw as { schemaVersion?: unknown } | null)?.schemaVersion;
  if (typeof ver !== "number" || ver < PROJECT_SCHEMA_VERSION) {
    project.data = tidyDataSet(project.data);
  }
  return project;
}

const INDEX_VERSION = 1;
/**
 * 更早版本（还没有 IndexedDB、项目直接存 localStorage 的时代）的存档键。
 * ⚠️ **历史键名，别跟着品牌改名**：改成 `mensic.*` 就再也读不到那些老数据了。
 */
const LEGACY_KEY = "vizart.caseprojects.v1";

export const EMPTY_INDEX: ProjectIndex = {
  version: INDEX_VERSION,
  folders: [],
  projects: [],
  ui: { sort: "updated" },
};

export interface Storage {
  readonly kind: "tauri" | "idb";
  loadIndex(): Promise<ProjectIndex>;
  saveIndex(index: ProjectIndex): Promise<void>;
  loadProject(id: string): Promise<CaseProject | null>;
  saveProject(project: CaseProject): Promise<void>;
  removeProject(id: string): Promise<void>;
  loadCover(id: string): Promise<Blob | null>;
  saveCover(id: string, blob: Blob): Promise<void>;
  removeCover(id: string): Promise<void>;
  usage(): Promise<{ bytes: number; quota: number | null }>;
  /* ---- 用户模板库（别人给的模板导入进来后存在这里） ---- */
  listTemplates(): Promise<StoredTemplate[]>;
  saveTemplate(tpl: StoredTemplate): Promise<void>;
  removeTemplate(id: string): Promise<void>;
}

/* ------------------------------------------------------------------ */
/* IndexedDB（Web，以及 Tauri 不可用时的回退）                          */
/* ------------------------------------------------------------------ */
const IDB_NAME = "mensic";
const IDB_VERSION = 2; // v>1：单 store「kv」，容纳索引 / 项目 / 封面

/** 改名前的库名（只读、只为一次性迁移） */
const LEGACY_IDB_NAME = "vizart";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * 旧品牌（库名 `vizart`）→ 新库 `mensic` 的**一次性整库搬运**（网页端才有意义：
 * 桌面端项目在 AppData 文件里，由 Rust 侧迁移）。
 *
 * 什么时候搬：新库还是空的（没有 index）且旧库真的存在。
 * 用单个 `kv` store 的 getAll/getAllKeys 复制——两边 schema 都是 v2 单 store，键名都不用改。
 */
let idbMigrationDone = false;
async function migrateLegacyIdb(db: IDBDatabase): Promise<void> {
  if (idbMigrationDone) return;
  idbMigrationDone = true;
  try {
    const hasIndex = await new Promise<boolean>((resolve) => {
      const req = db.transaction("kv", "readonly").objectStore("kv").get("index");
      req.onsuccess = () => resolve(req.result !== undefined);
      req.onerror = () => resolve(false);
    });
    if (hasIndex) return;
    // 不能直接 open 旧库：不存在时它会**新建**一个空库。先用 databases() 确认存在。
    const list = await indexedDB.databases?.();
    if (!list || !list.some((d) => d.name === LEGACY_IDB_NAME)) return;

    const old = await new Promise<IDBDatabase | null>((resolve) => {
      const req = indexedDB.open(LEGACY_IDB_NAME);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
    if (!old || !old.objectStoreNames.contains("kv")) {
      old?.close();
      return;
    }
    const data = await new Promise<{ keys: IDBValidKey[]; values: unknown[] }>((resolve) => {
      const tx = old.transaction("kv", "readonly");
      const store = tx.objectStore("kv");
      const ks = store.getAllKeys();
      const vs = store.getAll();
      tx.oncomplete = () => resolve({ keys: ks.result ?? [], values: vs.result ?? [] });
      tx.onerror = () => resolve({ keys: [], values: [] });
    });
    old.close();
    if (data.keys.length === 0) return;
    await new Promise<void>((resolve) => {
      const tx = db.transaction("kv", "readwrite");
      const store = tx.objectStore("kv");
      data.keys.forEach((k, i) => store.put(data.values[i], k));
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    /* 迁移是尽力而为：失败就当没有旧数据，别挡住启动 */
  }
}

function idbReq<T>(db: IDBDatabase, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction("kv", mode);
    const req = fn(t.objectStore("kv"));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbStorage(): Storage {
  let dbPromise: Promise<IDBDatabase> | null = null;
  // 第一次拿到连接时顺手做旧库迁移（幂等、只跑一次，且保证在任何读之前）
  const db = async () => {
    const d = await (dbPromise ??= openDb());
    await migrateLegacyIdb(d);
    return d;
  };
  const PK = (id: string) => `p:${id}`;
  const CK = (id: string) => `c:${id}`;
  const TK = (id: string) => `t:${id}`;
  const TK_LIST = "t:index";

  const norm = (raw: unknown): ProjectIndex => {
    const idx = (raw ?? {}) as Partial<ProjectIndex>;
    return {
      version: INDEX_VERSION,
      // 文件夹只允许一级：历史数据里嵌套的文件夹在加载时一律拍平到根级
      folders: Array.isArray(idx.folders) ? idx.folders.map((f) => ({ ...f, parentId: null })) : [],
      projects: Array.isArray(idx.projects) ? idx.projects : [],
      ui: { sort: idx.ui?.sort ?? "updated" },
    };
  };

  return {
    kind: "idb",
    async loadIndex() {
      return norm(await idbReq(await db(), "readonly", (s) => s.get("index")));
    },
    async saveIndex(index) {
      await idbReq(await db(), "readwrite", (s) => s.put(index, "index"));
    },
    async loadProject(id) {
      const raw = await idbReq<CaseProject | undefined>(await db(), "readonly", (s) => s.get(PK(id)));
      return raw ? loadProjectNorm(raw) : null;
    },
    async saveProject(project) {
      await idbReq(await db(), "readwrite", (s) => s.put(project, PK(project.id)));
    },
    async removeProject(id) {
      await idbReq(await db(), "readwrite", (s) => s.delete(PK(id)));
    },
    async loadCover(id) {
      const blob = await idbReq<unknown>(await db(), "readonly", (s) => s.get(CK(id)));
      return blob instanceof Blob ? blob : null;
    },
    async saveCover(id, blob) {
      await idbReq(await db(), "readwrite", (s) => s.put(blob, CK(id)));
    },
    async removeCover(id) {
      await idbReq(await db(), "readwrite", (s) => s.delete(CK(id)));
    },
    async usage() {
      try {
        const est = await navigator.storage?.estimate?.();
        return { bytes: est?.usage ?? 0, quota: est?.quota ?? null };
      } catch {
        return { bytes: 0, quota: null };
      }
    },
    async listTemplates() {
      const ids = (await idbReq<string[]>(await db(), "readonly", (s) => s.get(TK_LIST))) ?? [];
      const out: StoredTemplate[] = [];
      for (const id of ids) {
        const tpl = await idbReq<StoredTemplate | undefined>(await db(), "readonly", (s) => s.get(TK(id)));
        if (tpl) out.push(tpl);
      }
      return out;
    },
    async saveTemplate(tpl) {
      const ids = (await idbReq<string[]>(await db(), "readonly", (s) => s.get(TK_LIST))) ?? [];
      await idbReq(await db(), "readwrite", (s) => s.put(tpl, TK(tpl.id)));
      if (!ids.includes(tpl.id)) {
        await idbReq(await db(), "readwrite", (s) => s.put([...ids, tpl.id], TK_LIST));
      }
    },
    async removeTemplate(id) {
      const ids = (await idbReq<string[]>(await db(), "readonly", (s) => s.get(TK_LIST))) ?? [];
      await idbReq(await db(), "readwrite", (s) => s.delete(TK(id)));
      await idbReq(await db(), "readwrite", (s) => s.put(ids.filter((x) => x !== id), TK_LIST));
    },
  };
}

/* ------------------------------------------------------------------ */
/* Tauri 文件系统（AppData）                                           */
/* ------------------------------------------------------------------ */
function tauriStorage(): Storage {
  const ROOT = "mensic";
  const IDX = `${ROOT}/projects/index.json`;
  const PROJ_DIR = `${ROOT}/projects`;
  const COVER_DIR = `${ROOT}/covers`;
  const TPL_DIR = `${ROOT}/templates`;
  let fs: typeof import("@tauri-apps/plugin-fs") | null = null;
  let ready = false;

  const opt = () => ({ baseDir: fs!.BaseDirectory.AppData });
  const pj = (id: string) => `${PROJ_DIR}/${id}.json`;
  const cv = (id: string) => `${COVER_DIR}/${id}.png`;
  const tp = (id: string) => `${TPL_DIR}/${id}.json`;

  const norm = (raw: unknown): ProjectIndex => {
    const idx = (raw ?? {}) as Partial<ProjectIndex>;
    return {
      version: INDEX_VERSION,
      // 文件夹只允许一级：历史数据里嵌套的文件夹在加载时一律拍平到根级
      folders: Array.isArray(idx.folders) ? idx.folders.map((f) => ({ ...f, parentId: null })) : [],
      projects: Array.isArray(idx.projects) ? idx.projects : [],
      ui: { sort: idx.ui?.sort ?? "updated" },
    };
  };

  return {
    kind: "tauri",
    async loadIndex() {
      if (!fs) {
        fs = await import("@tauri-apps/plugin-fs");
        await fs.mkdir(PROJ_DIR, { ...opt(), recursive: true });
        await fs.mkdir(COVER_DIR, { ...opt(), recursive: true });
        await fs.mkdir(TPL_DIR, { ...opt(), recursive: true });
        ready = true;
      }
      if (!(await fs.exists(IDX, opt()))) return { ...EMPTY_INDEX };
      try {
        return norm(JSON.parse(await fs.readTextFile(IDX, opt())));
      } catch {
        return { ...EMPTY_INDEX };
      }
    },
    async saveIndex(index) {
      await fs!.writeTextFile(IDX, JSON.stringify(index), opt());
    },
    async loadProject(id) {
      if (!(await fs!.exists(pj(id), opt()))) return null;
      try {
        return loadProjectNorm(JSON.parse(await fs!.readTextFile(pj(id), opt())));
      } catch {
        return null;
      }
    },
    async saveProject(project) {
      await fs!.writeTextFile(pj(project.id), JSON.stringify(project), opt());
    },
    async removeProject(id) {
      try {
        await fs!.remove(pj(id), opt());
      } catch {
        /* 不存在则忽略 */
      }
    },
    async loadCover(id) {
      try {
        if (!(await fs!.exists(cv(id), opt()))) return null;
        const bytes = await fs!.readFile(cv(id), opt());
        return new Blob([bytes as unknown as BlobPart], { type: "image/png" });
      } catch {
        return null;
      }
    },
    async saveCover(id, blob) {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      await fs!.writeFile(cv(id), bytes, opt());
    },
    async removeCover(id) {
      try {
        await fs!.remove(cv(id), opt());
      } catch {
        /* ignore */
      }
    },
    async usage() {
      void ready;
      return { bytes: 0, quota: null };
    },
    async listTemplates() {
      try {
        const names = (await fs!.readDir(TPL_DIR, opt())) as unknown as { name: string }[];
        const out: StoredTemplate[] = [];
        for (const n of names) {
          if (!n.name.endsWith(".json")) continue;
          try {
            out.push(JSON.parse(await fs!.readTextFile(`${TPL_DIR}/${n.name}`, opt())) as StoredTemplate);
          } catch {
            /* 单个坏文件不影响其它模板 */
          }
        }
        return out;
      } catch {
        return [];
      }
    },
    async saveTemplate(tpl) {
      await fs!.writeTextFile(tp(tpl.id), JSON.stringify(tpl), opt());
      if (tpl.thumb) {
        const bytes = new Uint8Array(await tpl.thumb.arrayBuffer());
        await fs!.writeFile(tp(tpl.id).replace(/\.json$/, ".png"), bytes, opt());
      }
    },
    async removeTemplate(id) {
      for (const p of [tp(id), tp(id).replace(/\.json$/, ".png")]) {
        try {
          await fs!.remove(p, opt());
        } catch {
          /* ignore */
        }
      }
    },
  };
}

/* ------------------------------------------------------------------ */

let active: Storage | null = null;

/** 初始化存储：Tauri 优先，失败回退 IndexedDB */
export async function initStorage(): Promise<Storage> {
  if (active) return active;
  if (isTauri()) {
    try {
      const s = tauriStorage();
      await s.loadIndex(); // 触发目录创建与可用性校验
      active = s;
      return s;
    } catch (e) {
      console.warn("[mensic] Tauri 存储不可用，回退到 IndexedDB：", e);
    }
  }
  active = idbStorage();
  await active.loadIndex();
  return active;
}

export function storage(): Storage {
  if (!active) throw new Error("storage 未初始化，请先调用 initStorage()");
  return active;
}

/** 一次性迁移：localStorage(v1) → 新存储。校验成功后才删除旧键。 */
export async function migrateLegacy(s: Storage): Promise<number> {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(LEGACY_KEY);
  } catch {
    /* ignore */
  }
  if (!raw) return 0;

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return 0;
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    try {
      localStorage.removeItem(LEGACY_KEY);
    } catch {
      /* ignore */
    }
    return 0;
  }

  const index = await s.loadIndex();
  if (index.projects.length > 0) {
    // 新存储已有数据：保留旧的，避免覆盖（用户可手动处理）
    return 0;
  }

  const metas: ProjectMeta[] = [];
  for (const p of parsed as (Partial<CaseProject> & { id?: string })[]) {
    if (!p?.id) continue;
    const proj = normalizeProject(p as CaseProject);
    proj.schemaVersion = PROJECT_SCHEMA_VERSION;
    await s.saveProject(proj);
    metas.push(toMeta(proj));
  }
  await s.saveIndex({ ...index, projects: metas });
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* ignore */
  }
  return metas.length;
}

export { toMeta };
