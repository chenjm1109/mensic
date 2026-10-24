import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ChevronRight, Copy, Minus, Square, X } from "lucide-react";
import { Settings } from "@/components/animate-ui/icons/settings";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { isTauri, hasDesktopChrome } from "@/platform";
import { useStore } from "@/store";
import { cn } from "@/lib/utils";
import markUrl from "@/assets/mensic-mark.svg";
import { useBreadcrumbs } from "./breadcrumbs";
import { TYPO } from "@/core/typography";

function WindowButton({
  children,
  close,
  title,
  onClick,
}: {
  children: React.ReactNode;
  close?: boolean;
  title: string;
  onClick?: () => void;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={cn(
        "grid h-9 w-11 place-items-center text-muted-foreground transition-colors",
        close
          ? "hover:bg-destructive hover:text-destructive-foreground"
          : "hover:bg-accent hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function Titlebar() {
  const [maximized, setMaximized] = useState(false);
  /** 点关闭先确认，确认后才真的关窗口 */
  const [confirmClose, setConfirmClose] = useState(false);
  const tauri = isTauri();
  const desktop = hasDesktopChrome();
  const page = useStore((s) => s.page);
  const openSettings = useStore((s) => s.openSettings);
  const closeSettings = useStore((s) => s.closeSettings);
  const settingsOpen = page === "settings";
  const crumbs = useBreadcrumbs();
  const headerRef = useRef<HTMLElement>(null);

  /**
   * 把标题栏高度挂成 CSS 变量 `--titlebar-h`：弹层掩膜（DialogOverlay）用它来**跳过标题栏**，
   * 这样弹窗打开时窗口按钮与拖动仍然可用。实测高度而不是写死 36px，改高度不会失配。
   */
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (!desktop) {
      root.style.removeProperty("--titlebar-h");
      return;
    }
    const set = () => root.style.setProperty("--titlebar-h", `${headerRef.current?.offsetHeight ?? 36}px`);
    set();
    window.addEventListener("resize", set);
    return () => {
      window.removeEventListener("resize", set);
      root.style.removeProperty("--titlebar-h");
    };
  }, [desktop]);

  useEffect(() => {
    if (!tauri) return;
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    win.isMaximized().then(setMaximized).catch(() => {});
    win
      .onResized(() => {
        win.isMaximized().then(setMaximized).catch(() => {});
      })
      .then((u) => {
        unlisten = u;
      })
      .catch(() => {});
    return () => unlisten?.();
  }, [tauri]);

  // Web / Android / iOS：没有原生窗口，面包屑与窗口按钮都无意义 → 整条标题栏不渲染。
  // 页面级的返回按钮由各页面内容区的 PageTopBar 承担（见 @/components/ui/page-top-bar）。
  if (!desktop) return null;

  const win = tauri ? getCurrentWindow() : null;
  const call = (fn?: () => unknown) => () => {
    try {
      const r = fn?.();
      if (r instanceof Promise) r.catch(() => {});
    } catch {
      /* 忽略：非 Tauri 环境或权限不足 */
    }
  };

  return (
    <header
      ref={headerRef}
      data-tauri-drag-region
      // pointer-events-auto：radix 打开模态弹层时会给 <body> 设 `pointer-events: none`
      // （点击外部即关闭就是靠它实现的）。标题栏必须显式恢复，否则弹窗一开就点不动、拖不动。
      className="chrome-bar pointer-events-auto relative flex h-9 shrink-0 select-none items-center justify-between border-b border-line"
    >
      {/* 左侧：应用标识 + 面包屑路径 */}
      <div data-tauri-drag-region className="flex h-full min-w-0 flex-1 items-center">
        {/* 品牌标识：纯装饰，`pointer-events-none` 让这一小块仍然可以拖动窗口 */}
        <img
          src={markUrl}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="pointer-events-none ml-2.5 size-4 shrink-0 select-none"
        />
        <div className="no-scrollbar flex h-full min-w-0 flex-1 items-center gap-0.5 overflow-x-auto pl-0 pr-3">
        {crumbs.map((c, i) => (
          <Fragment key={c.key}>
            {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/45" />}
            {c.onClick ? (
              <button
                onClick={c.onClick}
                className={cn(TYPO.label, "shrink-0 truncate rounded-md px-1.5 py-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground")}
              >
                {c.label}
              </button>
            ) : (
              <span className={cn(TYPO.label, "shrink-0 truncate px-1.5 py-1 font-medium text-foreground")}>{c.label}</span>
            )}
          </Fragment>
        ))}
        <div className="h-full flex-1" data-tauri-drag-region />
        </div>
      </div>

      <div className="flex items-center">
        <button
          title={t("设置")}
          aria-pressed={settingsOpen}
          // 与页面内的返回按钮同一套来路：设置已打开时再点一次就关掉，回到进入设置前的页面。
          onClick={() => (settingsOpen ? closeSettings() : openSettings())}
          className={cn(
            "grid h-9 w-11 place-items-center transition-colors",
            settingsOpen
              ? "bg-brand-soft text-brand-strong"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          <Settings size={14} animateOnHover />
        </button>
        <WindowButton title={t("最小化")} onClick={call(() => win?.minimize())}>
          <Minus className="size-3.5" />
        </WindowButton>
        <WindowButton
          title={maximized ? t("还原") : t("最大化")}
          onClick={call(() => win?.toggleMaximize())}
        >
          {maximized ? <Copy className="size-3" /> : <Square className="size-3" />}
        </WindowButton>
        <WindowButton close title={t("关闭")} onClick={() => setConfirmClose(true)}>
          <X className="size-3.5" />
        </WindowButton>
      </div>

      {/* 关窗确认：弹层掩膜不盖标题栏，确认前窗口仍可拖动 / 最小化 */}
      <Dialog open={confirmClose} onOpenChange={setConfirmClose}>
        <DialogContent className="w-[min(400px,92vw)] sm:max-w-none">
          <DialogHeader>
            <DialogTitle>{t("退出应用")}</DialogTitle>
            <DialogDescription>{t("确定要退出吗？")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" data-sfx="none" onClick={() => setConfirmClose(false)}>
              {t("取消")}
            </Button>
            <Button onClick={call(() => win?.close())}>{t("退出")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}
