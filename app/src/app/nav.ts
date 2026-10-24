// 页面内的「回上一级」：与标题栏面包屑同源，供各页面在内容区放置返回按钮。
// 标题栏在 Web / Android / iOS 下为空白，没有面包屑，因此每个页面都需要自己的返回入口。
import type { Folder } from "@/core/types";
import { useStore, type Page } from "@/store";
import { requestFolderExit } from "./folder-nav";

export interface GoUp {
  /** 将回到的那一级名称，用于按钮的 title/无障碍标签 */
  label: string;
  go: () => void;
}

/**
 * 计算「当前页的上一级」所需的输入（都是值，不是订阅）。
 * 返回手势等非组件场景可以直接从 `useStore.getState()` 取，复用同一份判断 ——
 * **不要再写第二套页面回退规则**。
 */
export interface GoUpInput {
  page: Page;
  galleryCaseId: string | null;
  scope: string | null;
  folders: Folder[];
  /** 当前项目所在的文件夹（编辑器返回时回到这里） */
  folderId: string | null;
  settingsReturnTo: Page | null;
  galleryReturnTo: "home" | "projects";
  actions: {
    goHome: () => void;
    closeProject: () => void;
    closeGalleryCase: () => void;
    closeSettings: () => void;
    setPage: (page: Page) => void;
    setScope: (folderId: string | null) => void;
  };
}

// 页面名要在「调用时」翻译（模块加载时求值会锁死在初始语言）
function pageLabel(page: Page): string {
  return t(
    {
      home: "主页",
      gallery: "画廊",
      projects: "项目",
      editor: "编辑器",
      settings: "设置",
    }[page],
  );
}

/** 当前页的上一级；已在根页面（主页）时返回 null */
export function goUpOf(input: GoUpInput): GoUp | null {
  const { page, galleryCaseId, scope, folders, folderId, settingsReturnTo, galleryReturnTo, actions } = input;
  if (page === "home") return null;

  if (page === "gallery") {
    // 案例详情 → 回到画廊列表；列表 → 回到进入图鉴之前的页面（创作 / 主页）
    if (galleryCaseId) return { label: t("图鉴"), go: actions.closeGalleryCase };
    if (galleryReturnTo === "projects") return { label: t("创作"), go: () => actions.setPage("projects") };
    return { label: t("主页"), go: actions.goHome };
  }

  if (page === "projects") {
    // 在文件夹里 → 回上一级文件夹；根目录 → 回主页
    if (scope) {
      const parentId = folders.find((f) => f.id === scope)?.parentId ?? null;
      const label = parentId ? folders.find((f) => f.id === parentId)?.name ?? t("创作") : t("创作");
      return {
        label,
        go: () => {
          if (!requestFolderExit()) actions.setScope(parentId);
        },
      };
    }
    return { label: t("主页"), go: actions.goHome };
  }

  if (page === "editor") {
    // 编辑器 → 该项目所在的文件夹（若有）；同时关闭项目
    const label = folderId ? folders.find((f) => f.id === folderId)?.name ?? t("创作") : t("创作");
    return {
      label,
      go: () => {
        actions.setScope(folderId);
        actions.closeProject();
      },
    };
  }

  return { label: pageLabel(settingsReturnTo ?? "home"), go: actions.closeSettings };
}

/** 当前页的上一级（组件里用；订阅与返回相关的字段） */
export function useGoUp(): GoUp | null {
  const page = useStore((s) => s.page);
  const galleryCaseId = useStore((s) => s.galleryCaseId);
  const scope = useStore((s) => s.scope);
  const folders = useStore((s) => s.index.folders);
  // 只订阅「项目所在的文件夹」而不是整个 current：编辑器里每次改参数都会换掉 current，
  // 订阅整个对象会让所有用 useGoUp 的地方跟着重渲染。
  const folderId = useStore((s) => s.current?.folderId ?? null);
  const settingsReturnTo = useStore((s) => s.settingsReturnTo);
  const galleryReturnTo = useStore((s) => s.galleryReturnTo);
  const goHome = useStore((s) => s.goHome);
  const closeProject = useStore((s) => s.closeProject);
  const closeGalleryCase = useStore((s) => s.closeGalleryCase);
  const closeSettings = useStore((s) => s.closeSettings);
  const setPage = useStore((s) => s.setPage);
  const setScope = useStore((s) => s.setScope);
  return goUpOf({
    page,
    galleryCaseId,
    scope,
    folders,
    folderId,
    settingsReturnTo,
    galleryReturnTo,
    actions: { goHome, closeProject, closeGalleryCase, closeSettings, setPage, setScope },
  });
}
