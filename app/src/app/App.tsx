import { Suspense, lazy, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { getNoiseTiles } from "@/components/baked";
import { CustomCursor } from "@/components/Cursor";
import { allCategories, assetUrl } from "@/gallery";
import { isIOS } from "@/platform";
import { sfx } from "@/sound";
import { warmupRenderer } from "@/renderers/registry";
import { useStore } from "@/store";
import { PaperBackdrop } from "@/components/PaperBackdrop";
import { Titlebar } from "./Titlebar";
import { Toaster } from "@/components/ui/toast";
import { PageTransition } from "./PageTransition";
import { HeroFlip } from "./HeroFlip";
import { useMobileFocusScroll } from "./focus-scroll";
import { installAndroidBack } from "./android-back";
import { Home } from "@/pages/Home";

/**
 * ⚠️ 除了首页，其余页面**必须懒加载**。
 *
 * 静态 import 会把整棵编辑器的依赖（`DataTable` → glide-data-grid、`plotlyExport` →
 * plotly.js **4.4 MB**）一起拖进入口 chunk —— 曾经入口 chunk 是 5.4 MB，冷启动白屏十几秒
 * 就是这么来的（`scripts/check-bundle-split.mjs` 会守住这条线）。
 */
const Gallery = lazy(() => import("@/pages/Gallery").then((m) => ({ default: m.Gallery })));
const Projects = lazy(() => import("@/pages/Projects").then((m) => ({ default: m.Projects })));
const Editor = lazy(() => import("@/pages/Editor").then((m) => ({ default: m.Editor })));
const Settings = lazy(() => import("@/pages/Settings").then((m) => ({ default: m.Settings })));

/** 页面懒加载时的占位：与首屏骨架同一套观感（不刺眼、不跳动） */
function PageLoading() {
  return (
    <div className="grid h-full place-items-center">
      <span className="page-skeleton-dot" aria-hidden="true" />
    </div>
  );
}

export function App() {
  const page = useStore((s) => s.page);
  // 订阅语言：切换语言时让整棵树重渲染（文案走全局 t）
  useStore((s) => s.locale);
  // 移动端键盘收起 / 弹起后保证输入框不被遮住（桌面端自动跳过）
  useMobileFocusScroll();
  const setSelectMode = useStore((s) => s.setSelectMode);
  const hero = useStore((s) => s.hero);

  /**
   * 批量管理模式只属于「项目」页：离开就自动退出。
   * （放在这里统一兜底，不用逐个页面跳转入口去改；离开时项目页已卸载，
   * 所以也不会看到工具栏闪一下。）
   */
  useEffect(() => {
    if (page !== "projects") setSelectMode(false);
  }, [page, setSelectMode]);

  /**
   * 安卓系统返回（全面屏边缘滑动 / 返回键）：接管系统默认的「直接退出」。
   * 非首页等价左上角返回，弹层优先关弹层，首页连按两次才退出（见 android-back.ts）。
   */
  useEffect(() => installAndroidBack(), []);

  // 预热铅笔噪点瓦片（放到启动后空闲时，避免落在切页动画帧上）
  useEffect(() => {
    const id = window.setTimeout(() => getNoiseTiles(), 400);
    return () => window.clearTimeout(id);
  }, []);

  // 启动后**空闲**再预热渲染后端（桌面=本端 sidecar、Android=Chaquopy、Web=Pyodide）。
  // ⚠️ 不要再挂一个固定 1.2s 定时器：那会正好撞在首屏渲染/首页动画上，和首屏抢 CPU
  //    （首页出来后卡顿、动画掉帧就是它）。只留 requestIdleCallback，超时兜底也放长一点。
  // iOS 内存紧张，不预热，改为进编辑器时再预热（见 Editor.tsx）。
  //
  // ⚠️ 字体扫描**不在这里**：`font_list` 要把整机字体逐个打开（安卓上几百个文件），
  //    会和首图渲染抢同一份 CPython。改到首图渲染完成后的空闲时机（见 Editor.tsx），
  //    以及「字体」分区第一次打开时兜底（见 panels.tsx 的 FontPanel）。
  useEffect(() => {
    if (isIOS()) return;
    let cancelled = false;
    const start = () => {
      if (cancelled) return;
      warmupRenderer();
    };
    const idle = window.requestIdleCallback?.(start, { timeout: 3000 });
    const timer = window.setTimeout(start, 3000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (idle !== undefined) window.cancelIdleCallback?.(idle);
    };
  }, []);

  // 预热首屏缩略图（提前解码，避免首次进入画廊时解码掉帧）——同样等空闲，别抢首屏
  useEffect(() => {
    const warm = () => {
      const urls = (allCategories()[0]?.cases ?? [])
        .slice(0, 12)
        .map((c) => assetUrl(c.image))
        .filter((u): u is string => Boolean(u));
      for (const u of urls) {
        const img = new Image();
        img.decoding = "async";
        img.src = u;
        void img.decode?.().catch(() => {});
      }
    };
    const idle = window.requestIdleCallback?.(warm, { timeout: 2500 });
    const timer = window.setTimeout(warm, 2500);
    return () => {
      window.clearTimeout(timer);
      if (idle !== undefined) window.cancelIdleCallback?.(idle);
    };
  }, []);

  // 禁用右键菜单（文本框/可编辑区域除外，保留原生粘贴等操作）
  useEffect(() => {
    const onCtx = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      e.preventDefault();
    };
    document.addEventListener("contextmenu", onCtx);
    return () => document.removeEventListener("contextmenu", onCtx);
  }, []);

  // 页面切换音效
  const prevPage = useRef(page);
  useEffect(() => {
    if (prevPage.current !== page) {
      prevPage.current = page;
      sfx("navigate");
    }
  }, [page]);

  // 页面转场：编辑器采用「推近 / 拉远」——进入时从小放大，离开时列表被推开再收回。
  // prevPage 在下面的音效 effect 里更新，所以此处渲染时它仍是「上一页」。
  // 例外：图片共享元素过场（hero）进行中，页面本身不做位移与缩放 —— 视觉全部交给那张图，
  // 页面只做一次极短的淡出，这样点击后几乎是立刻开始放大，而不是先等页面动画演完。
  const EASE = [0.4, 0, 0.2, 1] as const;
  const heroDrive = !!hero;
  const toEditor = page === "editor";
  const fromEditor = !toEditor && prevPage.current === "editor";
  const deep = toEditor || fromEditor;
  const enterFrom = heroDrive
    ? { opacity: 1, scale: 1, y: 0 }
    : toEditor
      ? { opacity: 0, scale: 0.965, y: 0 }
      : fromEditor
        ? { opacity: 0, scale: 1.02, y: 0 }
        : { opacity: 0, scale: 0.996, y: 8 };
  const exitTo = heroDrive
    ? { opacity: 0, scale: 1, y: 0, transition: { duration: 0.06, ease: EASE } }
    : toEditor
      ? { opacity: 0, scale: 1.015, y: 0, transition: { duration: 0.14, ease: EASE } }
      : { opacity: 0, scale: 0.996, y: -4, transition: { duration: 0.08, ease: EASE } };

  return (
    <div className="relative flex h-screen flex-col overflow-hidden text-foreground">
      <CustomCursor />
      {page === "home" || page === "gallery" || page === "projects" ? (
        <PaperBackdrop />
      ) : (
        // 编辑区 / 设置页：**纯色底**。原来这里是「底色 + 浅色渐变」，
        // 渐变功能已整体移除（连设置项一起），所以只剩一个和底色同值的纯色层。
        <div className="fixed inset-0 z-0 bg-surface" />
      )}
      <div className="relative z-10 flex h-full min-h-0 flex-col">
        <Titlebar />
        {/* 轻提示：全应用一处挂载，任何地方 notify(...) 就能弹 */}
        <Toaster />
        {/* overflow-hidden：页面自身的推近 / 拉远（scale）只在内容区里画，
            放大时不会越过边界盖住上面的标题栏。 */}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={page}
              initial={enterFrom}
              animate={{
                opacity: 1,
                y: 0,
                scale: 1,
                transition: { duration: deep ? 0.26 : 0.16, ease: EASE },
              }}
              exit={exitTo}
              className="flex min-h-0 min-w-0 flex-1 flex-col"
            >
              <Suspense fallback={<PageLoading />}>
                {page === "home" && <Home />}
                {page === "gallery" && <Gallery />}
                {page === "projects" && <Projects />}
                {page === "editor" && <Editor />}
                {page === "settings" && <Settings />}
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <PageTransition />
      <HeroFlip />
    </div>
  );
}
