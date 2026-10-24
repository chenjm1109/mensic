// 文件夹操作（只允许一级：文件夹内不能再建文件夹）
import type { Folder } from "@/core/types";

export function childrenOf(folders: Folder[], parentId: string | null): Folder[] {
  return folders
    .filter((f) => (f.parentId ?? null) === (parentId ?? null))
    .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
}

/** 从根到目标文件夹的路径（面包屑）；一级文件夹下长度为 1 */
export function breadcrumb(folders: Folder[], id: string | null): Folder[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const out: Folder[] = [];
  let cur = id;
  let guard = 0;
  while (cur && guard++ < 1000) {
    const f = byId.get(cur);
    if (!f) break;
    out.unshift(f);
    cur = f.parentId;
  }
  return out;
}

export function nextOrder(folders: Folder[], parentId: string | null): number {
  const sib = childrenOf(folders, parentId);
  return sib.length ? Math.max(...sib.map((f) => f.order)) + 1 : 0;
}
