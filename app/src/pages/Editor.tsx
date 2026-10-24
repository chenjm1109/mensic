import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Image as ImageIcon, PanelRightClose, PanelRightOpen, Table as TableIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useGoUp } from "@/app/nav";
import { BackButton, FLOATING_INSET } from "@/components/ui/back-button";
import { ToolbarButton, ToolbarDivider, ToolbarGroup, ToolbarIconButton, toolBarClass } from "@/components/ui/toolbar-button";
import type { BuildResult, CaseProject } from "@/core/types";
import { assetUrl, caseCanvas, getCase } from "@/gallery";
import { capabilitiesOf, makeTemplateRef, templateDrift } from "@/gallery/template-ref";
import { captureFromElement, captureFromImage, captureFromImageUrl } from "@/features/projects/cover";
import { ensureFonts } from "@/features/editor/fonts";
import { Preview } from "@/features/editor/Preview";
import { Accordion, AxesPanel, DataPanel, ElementsPanel, ExportPanel, FontPanel, LegendPanel, PageSizePanel } from "@/features/editor/panels";
import { renderCaseProject, renderCaseProjectSvg, caseScriptProject, packageCaseProject, mappedData } from "@/features/editor/render";
import { plotlyPng, plotlySvg } from "@/features/chart/plotlyExport";
import { buildPlotlyCase } from "@/features/chart/plotlyCases";
import { elementGroups, elementParamKeys } from "@/features/editor/elements";
import { saveFileAs } from "@/platform";
import { storage } from "@/platform/storage";
import { warmupRenderer } from "@/renderers/registry";
import { sfx } from "@/sound";
import { notify } from "@/components/ui/toast";
import { useCurrentProject, useStore } from "@/store";
import { cn } from "@/lib/utils";
import { TYPO } from "@/core/typography";

/** 数据表格（glide-data-grid，约 440KB）按需加载：图像预览这条主路径用不到它 */
const DataTable = lazy(() => import("@/features/data/DataTable").then((m) => ({ default: m.DataTable })));


/** 右侧参数栏宽度：编辑区那几个悬浮组件（工具条居中、顶部留白）都以它为基准 */
const PANEL_W = 340;

/**
 * 回收 object URL。
 *
 * ⚠️ **不能一卸载就立刻 revoke**：从编辑区返回时，预览那张图会被共享元素过场（HeroFlip）
 * 拿去当「收回到卡片上」的过场图，而它的生命周期比编辑器长（约 0.6s）。
 * 立刻 revoke 会让那张图加载失败（图直接不见）。所以先看一眼过场是不是正用着它，
 * 是的话等过场结束之后再收。
 */
function releaseObjectUrl(url: string | null) {
  if (!url) return;
  if (useStore.getState().hero?.src === url) {
    window.setTimeout(() => URL.revokeObjectURL(url), 1600);
    return;
  }
  URL.revokeObjectURL(url);
}

/**
 * 先让浏览器把新 PNG 解码好，再换到 `<img>` 上。
 * 直接换 src 会有一帧空白（解码是异步的），安卓 WebView 上这一帧很明显。
 */
function decodeImage(url: string): Promise<void> {
  const img = new Image();
  img.src = url;
  if (typeof img.decode !== "function") return Promise.resolve();
  return img.decode().catch(() => {});
}

const SAME_INPUT_KEYS = [
  "id",
  "caseId",
  "data",
  "params",
  "elements",
  "presentation",
  "canvas",
  "theme",
  "tokensOverride",
  "mapping",
  "templateRef",
] as const;

/**
 * 出图只跟这些字段有关：名字 / 时间戳 / 封面版本之类的变化不该再画一遍。
 * 全部按引用比较 —— 编辑动作一定会换掉对应子对象（store 里的 patch 都是新对象），
 * 所以这里不会漏掉真正的视觉变更。
 */
function sameRenderInput(a: CaseProject | null, b: CaseProject): boolean {
  if (!a) return false;
  for (const k of SAME_INPUT_KEYS) if (a[k] !== b[k]) return false;
  return true;
}


export function Editor() {
  const project = useCurrentProject();
  const renameProject = useStore((s) => s.renameProject);
  const setData = useStore((s) => s.setData);
  const setParam = useStore((s) => s.setParam);
  const setElementStyle = useStore((s) => s.setElementStyle);
  const setCanvas = useStore((s) => s.setCanvas);
  const setPresentation = useStore((s) => s.setPresentation);
  const setMapping = useStore((s) => s.setMapping);
  const setSource = useStore((s) => s.setSource);
  const patchTokensOverride = useStore((s) => s.patchTokensOverride);
  const alignTemplate = useStore((s) => s.alignTemplate);
  const tab = useStore((s) => s.editorTab);
  const setEditorTab = useStore((s) => s.setEditorTab);
  const panelOpen = useStore((s) => s.editorPanelOpen);
  const setEditorPanelOpen = useStore((s) => s.setEditorPanelOpen);
  const saveCover = useStore((s) => s.saveCover);
  const hero = useStore((s) => s.hero);
  const startHero = useStore((s) => s.startHero);
  const goUp = useGoUp();

  /**
   * 「从项目卡片的图放大进来」的过场：
   * - 过场期间把自己的预览藏起来（等过场图落位后再亮出来，两者位置一致所以看不出切换）；
   * - 右侧配置栏**与放大同时**开始拉出来：首帧先收到 0（不带动画），下一帧立刻开启动画并展开，
   *   于是抽屉展开与图片放大是同一段时间里一起发生的，最后同时到位；
   * - 预览会跟着容器变窄实时自适应缩放，所以图片看上去是被抽屉「推开」到最终位置的。
   */
  const heroGrowing = !!hero && hero.to === "editor" && hero.phase === "grow";
  const heroEntry = !!hero && hero.to === "editor";
  const [drawerArmed, setDrawerArmed] = useState(!heroEntry);
  useLayoutEffect(() => {
    if (!heroEntry) return;
    setEditorPanelOpen(false);
    const id = requestAnimationFrame(() => {
      setDrawerArmed(true);
      setEditorPanelOpen(true);
    });
    return () => cancelAnimationFrame(id);
  }, [heroEntry, setEditorPanelOpen]);

  const chartRef = useRef<HTMLDivElement>(null);
  /** 预览里那张已经解码好的图：封面直接拿它画，省掉一次全尺寸 PNG 解码 */
  const previewImgRef = useRef<HTMLImageElement>(null);
  const pngUrlRef = useRef<string | null>(null);
  const [pngUrl, setPngUrl] = useState<string | null>(null);
  const [baseSpec, setBaseSpec] = useState<BuildResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 项目封面（缩略图）object URL：首次渲染完成前垫在预览里做「模糊呼吸」 */
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  /** 抽屉正在展开 / 收起（这段过渡里关掉毛玻璃，见 styles.css 的 .chrome-solid） */
  const [drawerSolid, setDrawerSolid] = useState(false);

  /**
   * matplotlib 渲染队列：**最新优先**。
   *
   * 以前每次参数变更都会真的排一次渲染（Python 端串行），连续调 10 次就要等 10 次。
   * 现在同一时刻最多「1 个在跑 + 1 个待跑」：跑完发现又有新状态，就丢掉过期结果、直接渲染最新。
   */
  const renderState = useRef<{ running: boolean; pending: CaseProject | null; shown: CaseProject | null }>({
    running: false,
    pending: null,
    shown: null,
  });
  const mountedRef = useRef(true);
  /** 字体列表只补扫一次（首图出来之后的空闲时机） */
  const fontsScheduled = useRef(false);


  const caseInfo = project ? getCase(project.caseId) : undefined;
  const engine = caseInfo?.engine ?? "matplotlib";
  /** 模板能力清单：面板据此决定显示哪些配置项（饼图没有直角坐标轴等） */
  const caps = capabilitiesOf(caseInfo ?? { projection: "rect", capabilities: undefined as never });
  /** 模板对齐情况：模板演进过就提醒 */
  const capsDrift = templateDrift(project?.templateRef, caseInfo);
  /** 图形元素的配置块：按数据 / 覆盖值记忆化（否则每次拖滑块都要重扫整张表） */
  const groupsForProject = useMemo(
    () => (project && caseInfo ? elementGroups(caseInfo, project) : []),
    [caseInfo, project?.data, project?.elements, project?.mapping],
  );

  /**
   * Plotly 3D：静态 spec 只当主题模板，数据 / 参数 / 元素覆盖变化时在前端重建。
   * （以前是构建期生成的固定 spec，参数栏改了也不会重绘。）
   */
  const plotlyFigure = useMemo(() => {
    if (!project || !caseInfo || caseInfo.engine !== "plotly" || !baseSpec) return null;
    try {
      return buildPlotlyCase(caseInfo, project, mappedData(caseInfo, project), baseSpec);
    } catch (e) {
      console.warn("[mensic] Plotly 重建失败：", e);
      return baseSpec;
    }
  }, [project, caseInfo, baseSpec]);

  // 预热渲染后端（通常已在 App 启动后空闲时预热；这里作为「直接进入编辑器」的兜底）
  useEffect(() => {
    warmupRenderer();
  }, []);

  /** 抽屉开合的那 340ms：关掉毛玻璃（否则每帧都要重算整块背景模糊） */
  useEffect(() => {
    if (!drawerArmed) return;
    setDrawerSolid(true);
    const id = window.setTimeout(() => setDrawerSolid(false), 380);
    return () => window.clearTimeout(id);
  }, [panelOpen, drawerArmed]);

  // 项目封面：进入编辑器时先垫上（还没有新图的那几百毫秒里，预览不至于一片空白）
  useEffect(() => {
    if (!project) return;
    let url: string | null = null;
    let cancelled = false;
    void (async () => {
      try {
        const blob = await storage().loadCover(project.id);
        if (cancelled || !blob) return;
        url = URL.createObjectURL(blob);
        setCoverUrl(url);
      } catch {
        /* 没有封面不影响主流程 */
      }
    })();
    return () => {
      cancelled = true;
      releaseObjectUrl(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  // 渲染结果 → 项目封面（实时缩略图，防抖 900ms）
  useEffect(() => {
    if (!project || busy || error) return;
    if (!pngUrl && !plotlyFigure) return;
    const id = project.id;
    const timer = window.setTimeout(async () => {
      try {
        let blob: Blob | null = null;
        if (pngUrl) {
          // 预览里那张图已经解码过了 → 直接画它，别再为了缩略图把整张 PNG 解一遍
          const img = previewImgRef.current;
          blob =
            img && img.src === pngUrl ? await captureFromImage(img) : await captureFromImageUrl(pngUrl);
        } else if (plotlyFigure && chartRef.current) {
          blob = await captureFromElement(chartRef.current);
        }
        if (blob) await saveCover(id, blob);
      } catch {
        /* 封面失败不影响主流程 */
      }
    }, 900);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pngUrl, plotlyFigure, project?.id, busy, error]);

  /**
   * 渲染队列的执行体（防抖 120ms 由下面的 effect 负责起调）。
   *
   * 循环里每次都取**最新的** pending：一次渲染结束时若又有新状态，本轮结果直接丢弃
   * （不换图，避免闪一下过期画面），马上用最新状态再画一次。
   */
  const pump = useCallback(async () => {
    const st = renderState.current;
    if (st.running) return;
    st.running = true;
    try {
      while (st.pending) {
        const target = st.pending;
        st.pending = null;
        setBusy(true);
        try {
          const { png, ms } = await renderCaseProject(target);
          if (import.meta.env.DEV) console.debug(`[mensic] render ${Math.round(ms)}ms`, target.id);
          // 过期结果：图已经变了，丢掉这次，循环会接着画最新那张
          if (st.pending) continue;
          const url = URL.createObjectURL(new Blob([png as unknown as BlobPart], { type: "image/png" }));
          await decodeImage(url);
          if (!mountedRef.current) {
            URL.revokeObjectURL(url);
            return;
          }
          if (st.pending) {
            URL.revokeObjectURL(url);
            continue;
          }
          releaseObjectUrl(pngUrlRef.current);
          pngUrlRef.current = url;
          st.shown = target;
          setPngUrl(url);
          setError(null);
          sfx("renderDone", 0.6);
          // 首图出来之后再扫本机字体：字体列表只在「字体」分区用得到，
          // 不值得在启动时和首图抢同一份 CPython。
          if (!fontsScheduled.current) {
            fontsScheduled.current = true;
            const idle = window.requestIdleCallback?.(() => void ensureFonts(), { timeout: 4000 });
            if (idle === undefined) window.setTimeout(() => void ensureFonts(), 1500);
          }
        } catch (e) {
          // 中间态的错误不弹（马上就会有新的一次渲染）；只报最终状态的那次
          if (!st.pending) {
            setError(e instanceof Error ? e.message : String(e));
            sfx("error", 0.7);
          }
        }
      }
    } finally {
      st.running = false;
      if (mountedRef.current) setBusy(false);
    }
  }, []);

  // matplotlib 渲染（防抖 120ms；依赖 project 引用，编辑即触发）
  useEffect(() => {
    if (!project || !caseInfo || caseInfo.engine !== "matplotlib") return;
    const st = renderState.current;
    // 只改了与出图无关的字段（名字 / 时间戳 / 封面版本…）→ 不用重画
    // ⚠️ 只跟 `shown` 比：不能因为「pending 已经是它」就早退 —— StrictMode 下 effect 会
    //    挂载→清理→再挂载，清理把这次的定时器取消了，早退就再没人起调（表现为永远渲染中）。
    if (sameRenderInput(st.shown, project)) return;
    st.pending = project;
    setBusy(true);
    setError(null);
    const timer = window.setTimeout(() => void pump(), 120);
    return () => window.clearTimeout(timer);
  }, [project, caseInfo, pump]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      releaseObjectUrl(pngUrlRef.current);
    };
  }, []);

  // Plotly（3D）规格加载：只取主题模板，数据 / 参数变化由 `buildPlotlyCase` 重建
  useEffect(() => {
    if (!caseInfo || caseInfo.engine !== "plotly") return;
    let cancelled = false;
    setBaseSpec(null);
    const url = assetUrl(caseInfo.specUrl);
    if (!url) return;
    fetch(url)
      .then((r) => r.json())
      .then((fig) => {
        // 图内不绘标题：spec 里带的 layout.title 一律清掉（与 gen-thumbnails 的处理一致）
        const f = fig as BuildResult & { layout?: { title?: unknown } };
        if (f.layout) delete f.layout.title;
        if (!cancelled) setBaseSpec(f as BuildResult);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [caseInfo]);

  if (!project || !caseInfo) {
    return (
      <div className={cn(TYPO.body, "flex flex-1 items-center justify-center text-muted-foreground")}>
        {t("请先从「画廊」或「项目」打开一个案例")}
      </div>
    );
  }

  const canvas = project.canvas;

  const getSvg = async () => {
    // 3D 图由 Plotly 在界面里画，Python 渲染器不认（会直接报「该案例由 Plotly 渲染」），
    // 所以让它自己离屏导出 —— 用户可能正停在「数据表格」标签页，预览那时已经卸载了。
    if (engine === "plotly") {
      if (!plotlyFigure) throw new Error(t("图还没画好，稍等一下再导出"));
      return plotlySvg(plotlyFigure, canvas);
    }
    return (await renderCaseProjectSvg(project)).svg;
  };
  /** Plotly（3D）没有走渲染器的 PNG，用同一份 figure 离屏导出 */
  const getPng = plotlyFigure ? () => plotlyPng(plotlyFigure, canvas) : undefined;

  const getScript = async () => (await caseScriptProject(project)).script;

  const exportPackage = async () => {
    try {
      const { zip } = await packageCaseProject(project);
      return await saveFileAs(
        `${project.name}.zip`,
        new Blob([zip as unknown as BlobPart], { type: "application/zip" }),
        [{ name: "ZIP", extensions: ["zip"] }],
      );
    } catch (e) {
      // ⚠️ 不能用 `setError`：那个状态是**预览渲染错误**，写进去会把画布打成错误态、还停住渲染。
      // 导出失败只影响这一次导出 —— 用轻提示说清楚即可（含真实原因）。
      const msg = e instanceof Error ? e.message : String(e);
      notify(t("导出失败：{v1}", { v1: msg.slice(0, 120) }), { tone: "info" });
      sfx("error", 0.7);
      return false;
    }
  };

  /**
   * 返回创作页：把预览**收回到那张项目卡片上** —— 与「点卡片放大进来」正好相反的一段
   * （画廊详情 → 创建项目 → 编辑器这条路同样适用）。
   *
   * 起点是预览画布的实时矩形（`[data-preview-stage]`），落点是列表里这张卡的图
   * （`data-project-card`）。落点**没有可估算的值**（瀑布流的位置算不准），所以传
   * `waitForTarget`：过场先原地按住、等卡片真的挂载出来再从 0% 开始收（见 HeroFlip）。
   * 数据表格页没有预览画布、或预览还没出图时，直接跳过过场，走原来的页面转场。
   */
  const backWithHero = () => {
    if (!goUp) return;
    const r = document.querySelector("[data-preview-stage]")?.getBoundingClientRect();
    const src = pngUrl ?? coverUrl;
    if (project && src && r && r.width > 1 && r.height > 1) {
      const from = { x: r.left, y: r.top, w: r.width, h: r.height };
      startHero({
        from,
        src,
        target: `[data-project-card="${project.id}"]`,
        to: "projects",
        radius: 0, // 预览画布与卡片图都是直角
        // 万一卡片一直没出现（列表被筛掉/滚走了）：就停在原地淡出，不要飞到屏幕中间
        fallback: from,
        // 列表的瀑布流位置估算不准，所以先原地等卡片挂载出来再从 0% 开始收（见 HeroFlip 的 MAX_WAIT）
        waitForTarget: true,
        bgClass: "bg-white",
      });
    }
    goUp.go();
  };

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1">
      {/* 返回上一级：坐标与各页面的 PageTopBar 完全一致（左 FLOATING_INSET / 上 16），
          也就是与右上那组 Tab 的右边距对称（那组是在 340 宽的参数栏里居中的）。 */}
      {goUp && (
        <div className="absolute top-4 z-30" style={{ left: FLOATING_INSET }}>
          <BackButton onClick={backWithHero} title={t("返回{target}", { target: t(goUp.label) })} />
        </div>
      )}
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {/* 图像预览 ⇄ 数据表格：淡入淡出 + 轻微上下位移，避免硬切 */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1] } }}
            exit={{ opacity: 0, y: -8, transition: { duration: 0.12, ease: [0.4, 0, 0.2, 1] } }}
            className="flex min-h-0 min-w-0 flex-1 flex-col"
            style={{ visibility: heroGrowing && tab === "chart" ? "hidden" : "visible" }}
          >
            {tab === "chart" ? (
              <Preview
                canvas={canvas}
                pngUrl={engine === "matplotlib" ? pngUrl : null}
                figure={plotlyFigure}
                backfill={coverUrl}
                busy={busy}
                error={error}
                chartRef={chartRef}
                imgRef={previewImgRef}
              />
            ) : (
              <Suspense fallback={<div className="min-h-0 flex-1" />}>
                <DataTable data={project.data} onChange={setData} />
              </Suspense>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <aside
        className={cn("chrome min-w-0 shrink-0 overflow-hidden border-l border-line", drawerSolid && "chrome-solid")}
        style={{
          width: panelOpen ? PANEL_W : 0,
          transition: drawerArmed ? "width 340ms cubic-bezier(0.4, 0, 0.2, 1)" : "none",
        }}
      >
        <div className="flex h-full flex-col pt-[74px]" style={{ width: PANEL_W }}>
          {/* 上面这 74px（16 上边距 + 46 工具条高 + 12 间隙）留在滚动容器**外面**：
              滚动时内容不会跑到悬浮工具条底下。 */}
          {/* [scrollbar-gutter:stable]：滚动条出现时**不再挤压内容宽度**（始终预留一条 9px 的槽），
              否则参数栏一出现滚动条，所有贴右边缘的控件就会整体左移一下。 */}
          <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
            {/* 手风琴：同一时刻只展开一个分区。顺序按「做一张图」的流程排：
                数据 → 页面 → 坐标轴 → 图例 → 图形元素 → 字体 → 导出
                （原本还有一块「数据映射」：它和导入向导里的字段匹配重复，
                 真要改映射走「数据 → 重选数据」即可，所以撤掉了。） */}
            <Accordion initial={t("数据")}>
              <DataPanel
                name={project.name}
                onRename={(name) => renameProject(project.id, name)}
                data={project.data}
                schema={caseInfo.schema}
                mapping={project.mapping ?? {}}
                source={project.source}
                drift={capsDrift}
                onAlignTemplate={
                  caseInfo
                    ? () => {
                        alignTemplate(makeTemplateRef(caseInfo));
                        sfx("notify");
                      }
                    : undefined
                }
                onApply={(d, m, src) => {
                  setData(d);
                  for (const [role, col] of Object.entries(m)) setMapping(role, col);
                  setSource(src);
                }}
              />
              <PageSizePanel
                canvas={project.canvas}
                onChange={setCanvas}
                override={project.tokensOverride}
                onPatch={patchTokensOverride}
                defaultSize={caseCanvas(caseInfo)}
                theme={project.theme ?? caseInfo.theme}
              />
              <AxesPanel
                key={project.id}
                presentation={project.presentation}
                base={caseInfo.presentation}
                onChange={setPresentation}
                capabilities={caps}
                override={project.tokensOverride}
                onPatch={patchTokensOverride}
                theme={project.theme ?? caseInfo.theme}
              />
              <LegendPanel
                presentation={project.presentation}
                base={caseInfo.presentation}
                onChange={setPresentation}
                capabilities={caps}
              />
              <ElementsPanel
                groups={groupsForProject}
                params={caseInfo.params.filter((p) => !elementParamKeys(caseInfo).includes(p.key))}
                values={project.params}
                onParam={setParam}
                onStyle={setElementStyle}
                paletteOverride={project.tokensOverride}
              />
              <FontPanel override={project.tokensOverride} onPatch={patchTokensOverride} />
              <ExportPanel
                project={project}
                caseInfo={caseInfo}
                pngUrl={pngUrl}
                onGetSvg={getSvg}
                onGetPng={getPng}
                onGetScript={getScript}
                onExportPackage={exportPackage}
              />
            </Accordion>
          </div>
        </div>
      </aside>

      {/* 右上工具条：与右侧参数栏**按同一个宽度居中**对齐（参数栏固定 340 宽）。
          它是悬浮在页面上的，所以这里用一个「和参数栏等宽、贴右边」的容器把工具条居中，
          而不是靠右侧 16px 对齐 —— 那样看起来会偏右。收起参数栏时位置不动。 */}
      <div
        className="pointer-events-none absolute top-4 z-30 flex justify-center"
        style={{ right: 0, width: PANEL_W }}
      >
        <ToolbarGroup className={cn(toolBarClass(), "pointer-events-auto")}>
          <ToolbarButton
            icon={<ImageIcon className="size-4" />}
            label={t("图像预览")}
            active={tab === "chart"}
            onClick={() => setEditorTab("chart")}
          />
          <ToolbarButton
            icon={<TableIcon className="size-4" />}
            label={t("数据表格")}
            active={tab === "data"}
            onClick={() => setEditorTab("data")}
          />
          <ToolbarDivider />
          <ToolbarIconButton
            active={panelOpen}
            glide={false}
            title={panelOpen ? t("收起配置栏") : t("展开配置栏")}
            onClick={() => {
              setDrawerArmed(true); // 手动开合也走同一段过渡
              setEditorPanelOpen(!panelOpen);
            }}
            icon={panelOpen ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
          />
        </ToolbarGroup>
      </div>
    </div>
  );
}
