// 顶部统一面包屑：把「返回按钮」升级为路径导航，并合并项目页的文件夹层级。
import { useMemo } from "react";
import { breadcrumb } from "@/core/folders";
import { useStore } from "@/store";
import { requestFolderExit } from "./folder-nav";

export interface Crumb {
  key: string;
  label: string;
  onClick?: () => void;
}

export function useBreadcrumbs(): Crumb[] {
  const page = useStore((s) => s.page);
  const scope = useStore((s) => s.scope);
  const folders = useStore((s) => s.index.folders);
  const current = useStore((s) => s.current);
  const goHome = useStore((s) => s.goHome);
  const closeProject = useStore((s) => s.closeProject);
  const setScope = useStore((s) => s.setScope);
  const locale = useStore((s) => s.locale); // 语言变了要重算（文案在这里生成）

  return useMemo(() => {
    const crumbs: Crumb[] = [];

    // 根：主页（当前页时不可点）
    crumbs.push({ key: "home", label: t("主页"), onClick: page === "home" ? undefined : goHome });
    if (page === "home") return crumbs;

    if (page === "gallery") {
      crumbs.push({ key: "gallery", label: t("图鉴") });
      return crumbs;
    }

    if (page === "projects") {
      crumbs.push({
        key: "projects",
        label: t("创作"),
        // 交给创作页播退场动效；页面不在（或没接手）才直接切
        onClick: scope ? () => { if (!requestFolderExit()) setScope(null); } : undefined,
      });
      if (scope) {
        for (const f of breadcrumb(folders, scope)) {
          crumbs.push({ key: `f:${f.id}`, label: f.name, onClick: () => setScope(f.id) });
        }
      }
      return crumbs;
    }

    if (page === "editor") {
      crumbs.push({ key: "projects", label: t("创作"), onClick: closeProject });
      if (current) {
        for (const f of breadcrumb(folders, current.folderId)) {
          crumbs.push({
            key: `f:${f.id}`,
            label: f.name,
            onClick: () => {
              setScope(f.id);
              closeProject();
            },
          });
        }
        crumbs.push({ key: "project", label: current.name });
      }
      return crumbs;
    }

    if (page === "settings") {
      crumbs.push({ key: "settings", label: t("设置") });
    }
    return crumbs;
  }, [page, scope, folders, current, goHome, closeProject, setScope, locale]);
}
