import type { StoredTemplate } from "@/core/types";
import { storage } from "@/platform/storage";
import type { GalleryCase } from "./index";

/**
 * 用户模板库：别人给的模板导入进来后存在这里（与内置图鉴并列）。
 *
 * 规则（与「模板是唯一真相源」一致）：
 *  - 启动时读一次进内存（`getCase` 之类的同步函数要能直接查到）；
 *  - 增删都先落盘再更新内存，保证「界面看到的 = 存着的」；
 *  - 磁盘上有、内存里没有 → 视为没装（`loadLibrary` 之前一律查不到）。
 */
let cache: GalleryCase[] = [];
const raw = new Map<string, StoredTemplate>();
const thumbUrls = new Map<string, string>();
let loaded = false;

export function libraryCases(): GalleryCase[] {
  return cache;
}

export function isLibraryLoaded(): boolean {
  return loaded;
}

export function storedTemplate(id: string): StoredTemplate | undefined {
  return raw.get(id);
}

/** 模板名（用户可读）—— 内置模板的标题就是模板名 */
export function libraryTemplateName(id: string): string | undefined {
  return raw.get(id)?.def.title as string | undefined;
}

function toCase(tpl: StoredTemplate): GalleryCase {
  const d = tpl.def as unknown as Partial<GalleryCase>;
  return {
    id: tpl.id,
    title: d.title ?? tpl.id,
    category: d.category ?? "imported",
    categoryTitle: d.categoryTitle ?? t("导入的模板"),
    categoryOrder: d.categoryOrder ?? 900,
    tags: d.tags ?? [],
    summary: d.summary ?? "",
    order: d.order ?? 999,
    // 缩略图：存的是 Blob → 转成 objectURL（绝对地址，assetUrl 会原样放行）
    image: thumbUrls.get(tpl.id) ?? d.image ?? null,
    dataUrl: null,
    specUrl: null,
    engine: d.engine ?? "matplotlib",
    theme: d.theme ?? "rose",
    projection: d.projection ?? "rect",
    canvas: d.canvas ?? { size: [8, 5], dpi: 150 },
    params: d.params ?? [],
    elements: d.elements ?? [],
    presentation: d.presentation ?? {},
    schema: d.schema ?? [],
    requires: d.requires ?? [],
    version: tpl.version,
    assetsHash: tpl.hash,
    capabilities: d.capabilities ?? {
      projection: d.projection ?? "rect",
      axes: { x: true, y: true, limits: true, ticks: true },
      legend: true,
    },
  };
}

/** 读一次用户模板库（App 初始化时调用；重复调用幂等） */
export async function loadLibrary(): Promise<void> {
  if (loaded) return;
  try {
    const list = await storage().listTemplates();
    for (const t of list) {
      raw.set(t.id, t);
      if (t.thumb) {
        try {
          thumbUrls.set(t.id, URL.createObjectURL(t.thumb));
        } catch {
          /* 缩略图失败不影响模板可用 */
        }
      }
    }
    cache = list.map(toCase);
  } catch {
    cache = [];
  }
  loaded = true;
}

/** 安装（或覆盖）一个模板：先落盘，再更新内存与缩略图 */
export async function installTemplate(t: StoredTemplate): Promise<void> {
  await storage().saveTemplate(t);
  raw.set(t.id, t);
  if (t.thumb) {
    const old = thumbUrls.get(t.id);
    if (old) URL.revokeObjectURL(old);
    try {
      thumbUrls.set(t.id, URL.createObjectURL(t.thumb));
    } catch {
      /* ignore */
    }
  }
  cache = [...cache.filter((c) => c.id !== t.id), toCase(t)];
}

export async function uninstallTemplate(id: string): Promise<void> {
  await storage().removeTemplate(id);
  raw.delete(id);
  const url = thumbUrls.get(id);
  if (url) URL.revokeObjectURL(url);
  thumbUrls.delete(id);
  cache = cache.filter((c) => c.id !== id);
}
