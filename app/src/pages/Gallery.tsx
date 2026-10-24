import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type MutableRefObject } from "react";
import { ArrowRight, Search } from "lucide-react";
import { motion } from "motion/react";
import { buildCaseProject } from "@/gallery/createFromCase";
import { allCases, allCategories, assetUrl, caseCanvas, getCase, type GalleryCase } from "@/gallery";
import { categoryIcon } from "@/gallery/icons";
import { getUsage } from "@/gallery/usage";
import { decideOffset, fogAmount, layoutRow } from "@/features/gallery/rowLayout";
import { estimatePreviewStage } from "@/features/editor/stage-rect";
import { SP } from "@/core/spacing";
import { SketchPill, SketchUnderline } from "@/components/sketch";
import { PageTopBar } from "@/components/ui/page-top-bar";
import { PaperLayers } from "@/components/ui/paper";
import { SearchSwap } from "@/components/ui/search-swap";
import { ToolbarButton, ToolbarIconButton } from "@/components/ui/toolbar-button";
import { useSize } from "@/components/baked";
import { cn } from "@/lib/utils";
import { sfx } from "@/sound";
import { useStore } from "@/store";
import { TYPO, TYPO_SHORT } from "@/core/typography";

/** 分类切换：整组卡片横向滑入（方向随切换方向）。
 *  ⚠️ 卡片**不再逐张错开淡入**：那会让「页面还没加载完」的观感拖到过场纸层掀开之后。 */
const GRID_SLIDE = { type: "spring", stiffness: 300, damping: 30 } as const;

/**
 * 画廊**详情页**在「视口很矮」（手机横屏 ≈390px 高）时收紧文字节奏。
 *
 * 这一页纵向内容最长（标题 / 描述 / 标签 / 创建按钮 ≈282px），不收就会把上面的轮播图挤成 0 高度。
 * ⚠️ 只用在这一页；媒体查询串必须是**字面量**（Tailwind 只能扫到字面量类名）。
 */
const DETAIL_SHORT =
  "[@media(max-height:560px)]:mt-2 [@media(max-height:560px)]:gap-2.5 [@media(max-height:560px)]:pb-4";

/** 分类标签行（列表页与详情页共用） */
/** 画廊分类标签：与工具栏同一套规格；列表页在组内最右侧复用一块搜索区 */
function CategoryTabs({
  activeId,
  onPick,
  search,
}: {
  activeId: string | null;
  onPick: (id: string) => void;
  search?: { value: string; onChange: (v: string) => void; placeholder: string; active: boolean };
}) {
  const row = (openSearch?: () => void) => (
    <>
      <div className="no-scrollbar min-w-0 overflow-x-auto">
        <div className="mx-auto flex w-max items-center gap-1">
          {allCategories().map((g) => {
            const active = g.id === activeId;
            const Icon = categoryIcon(g.id);
            return (
              <ToolbarButton
                key={g.id}
                data-tab={g.id}
                icon={<Icon className="size-4 shrink-0" />}
                label={t(g.title)}
                active={active}
                onClick={() => onPick(g.id)}
              />
            );
          })}
        </div>
      </div>
      {openSearch && (
        <ToolbarIconButton
          icon={<Search className="size-4" />}
          title={search?.active ? t("搜索：{v1}", { v1: search.value }) : t("搜索图表示例")}
          active={search?.active}
          glide={false}
          onClick={openSearch}
        />
      )}
    </>
  );

  if (!search) {
    return <div className="flex w-full min-w-0 justify-center">{row()}</div>;
  }

  return (
    <div className="flex w-full min-w-0 justify-center">
      <SearchSwap
        className="max-w-full"
        value={search.value}
        onChange={search.onChange}
        placeholder={search.placeholder}
      >
        {(openSearch) => row(openSearch)}
      </SearchSwap>
    </div>
  );
}

/** 同步测量元素尺寸（useLayoutEffect，首帧即得，避免轮播错位） */
function useBox<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () =>
      setBox((b) => {
        const w = el.clientWidth;
        const h = el.clientHeight;
        return Math.abs(b.w - w) < 0.5 && Math.abs(b.h - h) < 0.5 ? b : { w, h };
      });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, box] as const;
}

/**
 * 案例图片的「真实宽高比」缓存。
 *
 * 每个卡片盒子都要按图片真实比例来排（卡片边缘 = 图片边缘），所以只要有一张还没解码完，
 * 它就会按「画布比例」先摆着 —— 而三维图的画布是 8:5、缩略图却是 7:5，于是那张图四周
 * 会多出一圈空白，看过去就是「这一侧间距特别大、两侧不对称」。
 * 因此这里统一预取（画廊列表一渲染就把本类目取完），并在就绪时通知布局重排。
 */
const aspectCache = new Map<string, number>();
const aspectPending = new Set<string>();
const aspectListeners = new Set<() => void>();
let aspectVersion = 0;
let bumpScheduled = false;

/**
 * 图片宽高比就绪 → 通知布局重排。
 * 一批图几乎同时到达，所以**合并到下一帧只通知一次**：
 * 否则 10 张卡各自触发一次「整页重渲染 + 重排」，就是图鉴打开时那一串小卡顿。
 */
function bumpAspect() {
  if (bumpScheduled) return;
  bumpScheduled = true;
  requestAnimationFrame(() => {
    bumpScheduled = false;
    aspectVersion++;
    for (const l of aspectListeners) l();
  });
}

function useAspectVersion(): number {
  return useSyncExternalStore(
    (cb) => {
      aspectListeners.add(cb);
      return () => aspectListeners.delete(cb);
    },
    () => aspectVersion,
    () => aspectVersion,
  );
}

/** 预取一批案例的图片宽高比（已缓存的直接跳过） */
function prefetchAspects(cases: GalleryCase[]) {
  for (const c of cases) {
    const url = assetUrl(c.image);
    if (!url || aspectCache.has(url) || aspectPending.has(url)) continue;
    aspectPending.add(url);
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      aspectPending.delete(url);
      if (img.naturalWidth && img.naturalHeight) aspectCache.set(url, img.naturalWidth / img.naturalHeight);
      bumpAspect();
    };
    img.onerror = () => {
      aspectPending.delete(url);
      bumpAspect();
    };
    img.src = url;
  }
}

/** 案例图片的宽高比：有真实尺寸用真实的，还没有就先用画布比例顶着 */
function aspectOfCase(c: GalleryCase): number {
  const url = assetUrl(c.image);
  return (url ? aspectCache.get(url) : undefined) ?? caseAspect(c);
}

/**
 * 一排图片的「距离 → 形态」：离中心越远越小，越靠容器边缘白雾越浓。
 * 位置 / 缩放 / 白雾的算法都在 features/gallery/rowLayout.ts
 * （纯函数，验收脚本：scripts/check-row-layout.ts）。
 */

function caseAspect(c: GalleryCase): number {
  const canvas = caseCanvas(c);
  return canvas.width / canvas.height;
}

/** 单行不换行；内容未溢出时居中，溢出时可用鼠标左键按住左右拖动查看。
 * 采用原生横向滚动容器（隐藏滚动条），因此触控板 / Shift+滚轮 也可横向浏览。
 */
function DragScroll({
  children,
  className,
  innerClassName,
}: {
  children: React.ReactNode;
  className?: string;
  innerClassName?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef({ active: false, x: 0, left: 0, moved: false });

  const onPointerDown = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el || e.button !== 0) return;
    // 触屏交给浏览器原生的横向滚动：它有惯性，也不会和页面纵向滚动打架。
    // 鼠标没有原生「按住拖动」，才走下面这套 pointer 实现。
    if (e.pointerType !== "mouse") return;
    if (el.scrollWidth <= el.clientWidth) return; // 无溢出，无需拖动
    drag.current = { active: true, x: e.clientX, left: el.scrollLeft, moved: false };
    const move = (ev: PointerEvent) => {
      if (!drag.current.active) return;
      const dx = ev.clientX - drag.current.x;
      if (Math.abs(dx) > 4) drag.current.moved = true;
      el.scrollLeft = drag.current.left - dx;
    };
    const up = () => {
      drag.current.active = false;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("blur", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("blur", up);
  };

  // 拖动后抑制一次 click，避免误触标签/卡片
  const onClickCapture = (e: React.MouseEvent) => {
    if (drag.current.moved) {
      drag.current.moved = false;
      e.stopPropagation();
      e.preventDefault();
    }
  };

  return (
    <div
      ref={ref}
      data-dragscroll=""
      data-cursor="grab"
      onPointerDown={onPointerDown}
      onClickCapture={onClickCapture}
      className={cn("no-scrollbar overflow-x-auto overflow-y-hidden py-1", className)}
    >
      <div className={cn("mx-auto flex w-max items-center", innerClassName)}>{children}</div>
    </div>
  );
}

/** 画廊卡片：白底圆角卡 + 图表 + 标题 */
function CaseCard({
  c,
  onOpen,
}: {
  c: GalleryCase;
  /** 把「被点击那张图的实际屏幕矩形」交出去，用于从它连续放大到详情页主图 */
  onOpen: (from?: { x: number; y: number; w: number; h: number }) => void;
}) {
  const imgRef = useRef<HTMLDivElement>(null);
  const open = () => {
    const r = imgRef.current?.getBoundingClientRect();
    onOpen(r && r.width > 16 ? { x: r.left, y: r.top, w: r.width, h: r.height } : undefined);
  };
  return (
    // ⚠️ 这里必须是 `div role="button"` 而不是 `<button>`：卡片里还要放别的可交互元素，
    //    套在按钮里是非法 HTML。（创作页的卡片也是同一套写法。）
    <div
      role="button"
      tabIndex={0}
      // 这里刻意**不挂 layoutId**：列表 ↔ 详情两程都走 HeroFlip 过场。
      // （layoutId 那套要求两侧同一帧挂载/卸载再测量，遇到滚动过的列表就会跑偏 ——
      //  见 app/HeroFlip.tsx 开头的说明；回程曾因此「像从远处飞过来」。）
      //
      // ⚠️ 卡片**不做入场动效**：全屏过场纸层掀开时，页面必须已经「全部就位」——
      // 逐张淡入会被看成「还在加载」，而且和过场动效叠在一起就是两段动作打架。
      // 按压反馈用 CSS `:active`（150ms、全站统一缓动），不再为每张卡挂一个 Motion 实例。
      onClick={open}
      onKeyDown={(e) => {
        // 只有焦点在卡片本身时才响应（右上角菜单有自己的键盘行为）
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      className="group relative flex w-[calc(25%-18px)] cursor-pointer flex-col p-5 text-left transition-transform duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] active:scale-[0.99]"
    >
      {/* 纸张（每张卡自己一款毛边：种子 = 案例 id）+ 内容压在纸上（纯白底） */}
      <PaperLayers tone="white" seed={c.id} />
      {/* 图像直接印在纸上：**不加边线、不加圆角**（图鉴列表页专用；详情页与编辑页仍保留框线）。
          也不给底色 —— 暗色下纸张是 surface-2，给 bg-surface 会浮出一个比纸更暗的方块。 */}
      <div className="relative aspect-[3/2] w-full overflow-hidden">
        {/* data-case-card：**退回时共享元素的落点**。用 `absolute inset-2` 让这个盒子正好等于
            图实际画出来的那块（原来 p-2 的内边距在 img 上，量的到是外框、会差 8px）。 */}
        <div ref={imgRef} data-case-card={c.id} className="absolute inset-2">
          {c.image && (
            <img
              src={assetUrl(c.image) ?? ""}
              alt={c.title}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-contain transition-transform duration-500 ease-out group-hover:scale-[1.02]"
            />
          )}
        </div>
      </div>

      {/* 标题居中（原来是左对齐 + 右侧一个箭头，箭头已去掉） */}
      <div className="relative mt-4 px-1 pb-0.5">
        <span className={cn(TYPO.subtitle, "block w-full truncate text-center font-bold tracking-tight text-ink")}>{c.title}</span>
      </div>
    </div>
  );
}

/** 案例详情：轮播（中图 + 左右预览 + 箭头）+ 标题/描述 + 使用案例标签 + 创建项目 */
function CaseDetail({
  c,
  cases,
  onNav,
  heroRectRef,
}: {
  c: GalleryCase;
  cases: GalleryCase[];
  /** 翻页：±1 是上一张/下一张；拖动甩动时可能一次跨多张 */
  onNav: (dir: number) => void;
  /** 把主图的实时屏幕矩形写进去：退回时共享元素过场要从这里出发 */
  heroRectRef: MutableRefObject<{ x: number; y: number; w: number; h: number } | null>;
}) {
  const addProject = useStore((s) => s.addProject);
  const saveCover = useStore((s) => s.saveCover);
  const hero = useStore((s) => s.hero);
  const startHero = useStore((s) => s.startHero);
  const [busy, setBusy] = useState(false);
  const [titleRef, titleSize] = useSize<HTMLHeadingElement>();
  const [carouselRef, box] = useBox<HTMLDivElement>();
  /** 这段共享元素过场正由「本案例」发起：主图先藏起来，等过场图落位再亮出 */
  const heroCovering =
    !!hero && hero.to === "gallery" && hero.phase === "grow" && hero.target === `[data-case-hero="${c.id}"]`;

  // 每次渲染后记下主图的矩形（列表退回时详情已经卸载，只能靠这里留的「最后一帧」
  useLayoutEffect(() => {
    const el = document.querySelector(`[data-case-hero="${c.id}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    heroRectRef.current = { x: r.left, y: r.top, w: r.width, h: r.height };
  });

  const n = cases.length;
  const idxRaw = cases.findIndex((x) => x.id === c.id);
  const idx = idxRaw < 0 ? 0 : idxRaw;

  // 宽高比就绪后重排（三维图的缩略图比例与画布比例不同，必须等真实尺寸）
  const aspectVersion = useAspectVersion();
  useEffect(() => {
    prefetchAspects(cases.slice(Math.max(0, idx - 7), idx + 8));
  }, [idx, cases]);

  /**
   * 拖动的状态全在本地：`anchorIdx`（几何锚点）+ `offset`（已经拖了几张，连续）。
   *
   * 关键点是「提交」时两者一起改：锚点 +n、位移归零。画面只跟 `anchorIdx + offset` 有关，
   * 这个和在任何中间渲染里都不变，所以无论是「先改锚点」还是「先改位移」都不会闪一下。
   * （之前位移放一个 state、索引放 store，两者分两次渲染，于是会出现「图片先飞出去再飞回来」。）
   */
  const [anchorIdx, setAnchorIdx] = useState(idx);
  const [offset, setOffset] = useState(0);
  /** 拖动（含惯性滑行）期间：位置逐帧精确跟随，不做弹簧 */
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({ active: false, moved: false, startX: 0, offset: 0, startOffset: 0, lastX: 0, lastT: 0, v: 0 });
  /** 拖动期间合并到下一帧的 rAF；触摸 / 鼠标共用 */
  const dragFrame = useRef(0);
  /** 供 effect 读取「当前锚点」而不受闭包快照影响 */
  const anchorRef = useRef(idx);
  anchorRef.current = anchorIdx;

  // 外部切页（Tab / 滚轮）：idx 变了就滑过去，而不是瞬间重排（见下面的 effect）
  const lastIdxRef = useRef(idx);
  /** 上一次 idx 变化是否由我们自己提交引起：是的话只同步，不能再滑一次 */
  const ownNavRef = useRef(false);

  // 外部翻页（箭头 / 滚轮 / 换分类）：滑过去（像左右滑动翻到那一页），而不是硬切。
  // 注意：我们自己提交（拖动 / 点小图）引起的 idx 变化不能在这里再滑一次 ——
  // store 的更新可能先于 React 的批量渲染落地，那时 anchorIdx 还是旧值，会误判成「外部翻页」而多滑一张。
  useEffect(() => {
    const prev = lastIdxRef.current;
    lastIdxRef.current = idx;
    if (prev === idx) return;
    if (ownNavRef.current) {
      ownNavRef.current = false;
      setAnchorIdx(idx);
      setOffset(0);
      dragRef.current.offset = 0;
      return;
    }
    const steps = idx - anchorRef.current;
    if (steps === 0) {
      setOffset(0);
      return;
    }
    slideToOffset(steps, { nav: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  /**
   * 一排图片的排布（拖动时逐帧重算）。
   *
   * 几何全部交给 features/gallery/rowLayout.ts 的纯函数：它的输入只有连续档位
   * `idxFloat = anchorIdx + offset`（外加容器尺寸与各图真实比例），
   * 因此 ① 左右两侧由同一套算法推出、天然对称；② 提交时两者之和不变，画面逐张完全一致。
   */
  const row = useMemo(
    () =>
      layoutRow({
        n,
        W: box.w,
        H: box.h - 8,
        idxFloat: anchorIdx + offset,
        aspectOf: (i) => aspectOfCase(cases[i]),
      }),
    [box.w, box.h, anchorIdx, offset, aspectVersion, n, cases],
  );

  /** 一排图片的几何信息（拖动换算读它，用 ref 避免闭包里读到旧值） */
  const rowRef = useRef(row);
  rowRef.current = row;

  /** 已经拖了几张（连续值四舍五入 = 当前预览到第几张）；两端不循环，走到头就停 */
  const clampOffset = (v: number) => Math.max(-anchorIdx, Math.min(n - 1 - anchorIdx, v));

  /** 位移（px）→ 档数（一档的参考间距由排布给出） */
  const toOffset = (px: number) => clampOffset(-px / (rowRef.current?.pitch || 600));

  /** 逐帧动画的句柄与「身份」：新动画一开始就让旧动画的帧失效，互不干扰 */
  const slideRaf = useRef(0);
  const slideToken = useRef(0);

  /** 取消未完成的滑行动画 */
  const stopSettle = () => {
    slideToken.current++;
    if (slideRaf.current) {
      cancelAnimationFrame(slideRaf.current);
      slideRaf.current = 0;
    }
  };

  /**
   * 滑到第 steps 档（正 = 往后翻）：
   * 先把位移逐帧滑到位，再「锚点 + 位移」一起提交 —— 拖动松手、点侧边小图、以及
   * 外部切页（Tab / 滚轮）走的是同一条路径，所以观感都是「滑过去」。
   *
   * `nav: false` 用于外部切页：store 里的 caseId 已经指向目标了，这里只负责把画面滑过去，
   * 不再重复提交一次（否则会多翻一页）。
   */
  const slideToOffset = (steps: number, opts?: { nav?: boolean }) => {
    const nav = opts?.nav ?? true;
    const target = clampOffset(steps);
    stopSettle();
    const token = slideToken.current; // 本次动画的身份
    const r = dragRef.current;
    const from = r.offset;
    const dist = target - from;
    if (Math.abs(dist) < 0.001) {
      // 已经正好停在这一档：位移没什么可动的，但该提交的还是要提交
      // （否则「拖满一整档」这种情形会出现画面已经过去、页面却没换的错位）
      if (target !== 0) {
        setAnchorIdx((a) => a + target);
        setOffset(0);
        r.offset = 0;
        if (nav) {
          ownNavRef.current = true; // 这次 idx 变化是我们提交的，effect 里只同步不再滑
          navRef.current(target);
        }
      }
      setDragging(false);
      return;
    }
    // 距离越远滑得越久（下限~290ms 给「松手归位」用，上限 560ms 避免大跨度一闪而过）
    const dur = Math.min(560, 200 + Math.abs(dist) * 90);
    const t0 = performance.now();
    setDragging(true);

    const tick = (now: number) => {
      if (slideToken.current !== token) return; // 已被新的手势 / 动画取代
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = from + dist * eased;
      r.offset = v;
      setOffset(v);
      if (p < 1) {
        slideRaf.current = requestAnimationFrame(tick);
        return;
      }
      slideRaf.current = 0;
      // 锚点与位移一起改：画面（只跟两者之和有关）在这一帧完全不变
      setAnchorIdx((a) => a + target);
      setOffset(0);
      r.offset = 0;
      setDragging(false);
      if (nav && target !== 0) {
        ownNavRef.current = true; // 同上：自己提交的 idx 变化不再触发一次滑动
        navRef.current(target);
      }
    };
    slideRaf.current = requestAnimationFrame(tick);
  };

  /**
   * 拖动过程中「已经预览到第几张」：一跨过一档，内容区（标题 / 说明 / 使用案例 / 按钮）
   * 就实时切到那一张 —— 像手机上的滚轮选择器，不必等松手。
   */
  const shown = cases[anchorIdx + clampOffset(Math.round(offset))] ?? c;
  const usage = getUsage(shown.id);
  const Icon = categoryIcon(shown.category);

  const create = async () => {
    setBusy(true);
    try {
      const project = await buildCaseProject(shown);
      /**
       * 过场：从**详情页的主图**连续放大到编辑器预览 —— 与「创作页点卡片进编辑器」同一套动作。
       *
       * 起点取轮播正中那张主图的实时矩形（详情一卸载就量不到了，所以只能在这里量；
       * `heroRectRef` 是它每帧留下的「最后一帧」，作为取不到时的兜底）。
       * `estimatePreviewStage` 是编辑器挂载前对落点的估算，保证第一帧就朝最终位置长。
       */
      const heroEl = document.querySelector(`[data-case-hero="${shown.id}"]`);
      const hr = heroEl?.getBoundingClientRect();
      const from =
        hr && hr.width > 1 && hr.height > 1
          ? { x: hr.left, y: hr.top, w: hr.width, h: hr.height }
          : heroRectRef.current;
      const heroSrc = assetUrl(shown.image);
      if (from && heroSrc && from.w > 1) {
        startHero({
          from,
          src: heroSrc,
          target: "[data-preview-stage]",
          to: "editor",
          radius: 18,
          fallback: estimatePreviewStage(shown.id),
          blurTo: 9, // 编辑器预览在渲染完成前是模糊占位，落位时正好接上
          bgClass: "bg-white",
        });
      }
      addProject(project);
      /**
       * 立刻把**案例缩略图**存成初始封面。
       *
       * 为什么必要：编辑器加载态垫的底图是「项目封面」，而新建项目的封面要等首次渲染完
       * （防抖 900ms 后）才生成 —— 所以从画廊详情进编辑器时，那几百毫秒里底图是空的，
       * 没有呼吸模糊可看（从创作页进则没问题，因为项目早就有封面了）。
       * 顺带的好处：创作页的卡片马上就有图，不必先显示「暂无预览」。
       */
      const src = assetUrl(shown.image);
      if (src) {
        try {
          const res = await fetch(src);
          if (res.ok) await saveCover(project.id, await res.blob());
        } catch {
          /* 拿不到就当没有封面，不影响主流程 */
        }
      }
      sfx("success");
    } catch {
      sfx("error", 0.7);
    } finally {
      setBusy(false);
    }
  };

  const examples = usage.examples.map((s) => s.replace(/。$/, ""));

  // —— 图片区域交互：滚轮翻页 / 左右拖动翻页（跟手，跨过一档就预览到那一张）——
  const navRef = useRef(onNav);
  navRef.current = onNav;

  // 滚轮翻页（非 passive，才能 preventDefault 阻止页面滚动）
  useEffect(() => {
    const el = carouselRef.current;
    if (!el) return;
    let lock = 0;
    const onWheel = (e: WheelEvent) => {
      const ax = Math.abs(e.deltaX);
      const ay = Math.abs(e.deltaY);
      if (Math.max(ax, ay) < 6) return;
      e.preventDefault();
      const now = performance.now();
      if (now < lock) return; // 节流，避免一次滚动手势连翻多页
      lock = now + 420;
      const d = ay >= ax ? e.deltaY : e.deltaX;
      navRef.current(d > 0 ? 1 : -1);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [carouselRef]);

  // 卸载时收掉未完成的惯性动画
  useEffect(() => stopSettle, []);

  /* ---- 拖动核心：鼠标 pointer 和安卓触摸共用同一套状态 ---- */

  const dragStart = (clientX: number) => {
    stopSettle();
    const d = dragRef.current;
    d.active = true;
    d.moved = false;
    d.startX = clientX;
    d.startOffset = offset;
    d.offset = offset;
    d.lastX = clientX;
    d.lastT = performance.now();
    d.v = 0;
  };

  const dragMove = (clientX: number) => {
    const r = dragRef.current;
    if (!r.active) return;
    const raw = clientX - r.startX;
    if (Math.abs(raw) > 6) r.moved = true;
    const now = performance.now();
    const dt = Math.max(1, now - r.lastT);
    // 速度（px/ms）：先限幅再指数平滑，避免某一帧的事件抖动被当成「快甩」
    const inst = Math.max(-6, Math.min(6, (clientX - r.lastX) / dt));
    r.v = r.v === 0 ? inst : r.v * 0.65 + inst * 0.35;
    r.lastX = clientX;
    r.lastT = now;
    r.offset = toOffset(raw);
    setDragging(true);
    // 合并到下一帧：一次手势里只让 React 重渲染到「每帧一次」，不再跟着事件频率跑
    if (dragFrame.current) return;
    dragFrame.current = requestAnimationFrame(() => {
      dragFrame.current = 0;
      if (dragRef.current.active) setOffset(dragRef.current.offset);
    });
  };

  const dragCancel = () => {
    const r = dragRef.current;
    if (!r.active) return;
    r.active = false;
    if (dragFrame.current) {
      cancelAnimationFrame(dragFrame.current);
      dragFrame.current = 0;
    }
    r.offset = r.startOffset;
    setOffset(r.startOffset);
    setDragging(false);
  };

  const dragEnd = () => {
    if (dragFrame.current) {
      cancelAnimationFrame(dragFrame.current);
      dragFrame.current = 0;
    }
    const r = dragRef.current;
    if (!r.active) return;
    r.active = false;
    // 最后一次可能还压在 rAF 里没提交
    setOffset(r.offset);
    const pitch = rowRef.current?.pitch ?? 600;
    // 停在哪一档：速度只在半档以内做补偿（详见 decideOffset 的约束说明）
    const steps = decideOffset({
      offset: r.offset,
      velocitySlotsPerMs: -r.v / pitch,
      moved: r.moved,
      min: -anchorIdx,
      max: n - 1 - anchorIdx,
    });
    slideToOffset(steps);
  };

  // 触摸事件走原生监听：React 的 touchmove 在 WebView 里可能被当成 passive，
  // preventDefault 不生效；pointercancel 也会在安卓上抢走横向拖动。
  // 这里用非 passive 的 touchmove 明确接管横向手势，纵向则放行给页面滚动。
  const touchDragRef = useRef({ start: dragStart, move: dragMove, cancel: dragCancel, end: dragEnd });
  touchDragRef.current = { start: dragStart, move: dragMove, cancel: dragCancel, end: dragEnd };

  useEffect(() => {
    const el = carouselRef.current;
    if (!el) return;
    let active = false;
    let axis: "x" | "y" | null = null;
    let startX = 0;
    let startY = 0;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      active = true;
      axis = null;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!active) return;
      if (e.touches.length !== 1) {
        active = false;
        touchDragRef.current.cancel();
        return;
      }
      const x = e.touches[0].clientX;
      const y = e.touches[0].clientY;
      const dx = x - startX;
      const dy = y - startY;
      if (axis === null) {
        if (Math.hypot(dx, dy) < 6) return;
        // 先判断主轴：横向才接管，纵向让页面滚（不 preventDefault）
        axis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
        if (axis === "y") {
          active = false;
          return;
        }
        // 确认是横向拖动后才开始接管，避免普通点击 / 纵向滚动打断正在进行的翻页动画
        touchDragRef.current.start(startX);
      }
      if (axis === "x") {
        e.preventDefault();
        touchDragRef.current.move(x);
      }
    };

    const onTouchEnd = () => {
      if (!active) return;
      const wasHorizontal = axis === "x";
      active = false;
      if (wasHorizontal) touchDragRef.current.end();
    };

    const onTouchCancel = () => {
      if (!active) return;
      const wasHorizontal = axis === "x";
      active = false;
      if (wasHorizontal) touchDragRef.current.cancel();
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchCancel);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [carouselRef]);

  const onDragDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    // 触摸由上面的原生 touch 监听负责；这里只处理鼠标 / 手写笔
    if (e.pointerType === "touch") return;
    dragStart(e.clientX);

    const move = (ev: PointerEvent) => dragMove(ev.clientX);

    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("blur", up);
      dragEnd();
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    // 指针被系统取消 / 窗口失焦时也要收尾，否则会卡在「拖到一半」的状态
    window.addEventListener("pointercancel", up);
    window.addEventListener("blur", up);
  };

  // 拖动后抑制一次 click，避免误触上一张/下一张按钮或卡片
  const onDragClick = (e: React.MouseEvent) => {
    if (dragRef.current.moved) {
      dragRef.current.moved = false;
      e.stopPropagation();
      e.preventDefault();
    }
  };

  return (
    // ⚠️ `overflow-x-hidden` 不能省：轮播两侧的小图是**绝对定位在容器外**的（`left: -64`），
    //    只写 `overflow-y-auto` 时另一轴会从 `visible` 计算成 `auto` —— 那几十像素溢出
    //    就变成一条常驻的横向滚动条。横向本来就该由窗口裁掉，这里显式关死。
    <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]">
      {/* 轮播：撑满可用高度（内容行均为单行，高度稳定）。
          不使用 overflow-hidden，否则会裁掉卡片上下阴影；水平溢出由窗口自然裁剪。
          触屏上必须自己接管横向拖动，否则浏览器会把「左/右滑」当成页面平移并 pointercancel，
          手指滑半天轮播不动。`touch-pan-y` 只放行纵向页面滚动，横向手势留给 pointer 逻辑。 */}
      {/* ⚠️ 轮播块 `min-h-[160px]`：它是 flex-1，下面的文字块是 shrink-0 —— 手机横屏（≈390px 高）时
          文字块（282px）会把这里压成 **0 高度**，图完全看不见、连共享元素过场的落点都没有。
          给一个下限保证「图一定看得见」，放不下的部分由外层滚动。 */}
      <div
        ref={carouselRef}
        data-carousel
        data-cursor="grab"
        onPointerDown={onDragDown}
        onClickCapture={onDragClick}
        className="relative mx-auto mt-2 min-h-[160px] w-full flex-1 touch-pan-y [@media(max-height:560px)]:min-h-[140px]"
        style={{ touchAction: "pan-y" }}
      >
        {row && (
          <>
            {/* 白雾（屏幕空间）：主图范围之内完全清晰，从这里到容器边缘线性变白，
                到边缘刚好完全看不清 —— 与两侧能放下几张图无关（五张、一张、半张都一样）。 */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background: `linear-gradient(to right, var(--surface) 0%, transparent ${(
                  (row.clearHalf / box.w) *
                  100
                ).toFixed(2)}%, transparent ${(100 - (row.clearHalf / box.w) * 100).toFixed(2)}%, var(--surface) 100%)`,
                opacity: 0.97,
                zIndex: 250,
              }}
            />
            {row.items.map((it) => {
              const cc = cases[it.i];
              // 「视觉上在中间的那张」= 过场/隐藏要认的那张（拖动过程中也是它）
              const at = it.i === row.activeIndex;
              // 白雾模糊只分 4 档：拖动时大多数帧的 filter 值不变，
              // 浏览器就不用每帧重新栅格化这几张缩略图（安卓上这一下很贵）
              const fog = Math.round(fogAmount(it.center, box.w, row.clearHalf / 1.04) * 3) / 3;
              // 越靠中间越在上层，拖动时「进来的那张」盖住其它
              const z = Math.round(200 - Math.abs(it.dist) * 20);
              const near = Math.abs(it.dist) < 0.5;
              return (
                <motion.div
                  key={cc.id}
                  data-case-hero={at ? cc.id : undefined}
                  className={cn("absolute", !at && "cursor-pointer")}
                  style={{
                    top: row.top,
                    left: 0,
                    width: it.base,
                    height: row.baseH,
                    transformOrigin: "center center",
                    visibility: at && heroCovering ? "hidden" : "visible",
                    zIndex: z,
                  }}
                  initial={false}
                  animate={{ x: it.x, scale: it.s }}
                  transition={dragging ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 32 }}
                  // 点侧边小图：像滑动一样把它推成主图（走的是和「松手归位」同一条动画）
                  data-cursor={at ? undefined : "pointer"}
                  onClick={at ? undefined : () => slideToOffset(it.i - row.activeIndex)}
                >
                  <motion.div
                    className={cn(
                      "relative h-full w-full overflow-hidden rounded-[18px] border border-line bg-surface",
                      near
                        ? "shadow-[0_24px_54px_-30px_rgba(90,75,50,0.5)]"
                        : "shadow-[0_14px_30px_-26px_rgba(90,75,50,0.45)]",
                    )}
                  >
                    {/* 图片跟着卡片一起缩放（不单独挂 layoutId —— 两程都由 HeroFlip 过场负责） */}
                    <div className="h-full w-full">
                      {cc.image && (
                        <img
                          src={assetUrl(cc.image) ?? ""}
                          alt={cc.title}
                          decoding="async"
                          className="h-full w-full object-contain"
                          style={{ filter: fog > 0.04 ? `blur(${(fog * 3.6).toFixed(2)}px)` : undefined }}
                        />
                      )}
                    </div>
                  </motion.div>
                </motion.div>
              );
            })}
          </>
        )}
      </div>

      {/* 标题 / 描述 / 使用案例 / 创建按钮：统一 20px 纵向节奏 + 页面留白（底部与顶部同值）。
          拖动时这里跟着「预览到的那一张」实时更新。 */}
      <div className={cn("mt-6 flex shrink-0 flex-col items-center", SP.stack, SP.gutterX, SP.gutterBottom, DETAIL_SHORT)}>
        <motion.div
          key={`t-${shown.id}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col items-center gap-[18px]"
        >
          {/* 手绘下划线是绝对定位、会悬垂 18px；用 pb 预留这段高度，外层 gap 才能视觉等距 */}
          <div className="relative inline-flex items-center gap-4 pb-[18px] [@media(max-height:560px)]:pb-3">
            <Icon className="size-8 shrink-0 text-ink-2 [@media(max-height:560px)]:size-6" strokeWidth={1.7} />
            <div className="relative">
              <h1 ref={titleRef} className={cn(TYPO.title, TYPO_SHORT.title, "font-bold leading-none tracking-tight text-ink")}>
                {shown.title}
              </h1>
              <SketchUnderline
                color="var(--brand-line)"
                width={Math.max(60, Math.round(titleSize.w))}
                thickness={6}
                className="absolute left-0 top-full mt-2"
              />
            </div>
          </div>
          {shown.summary && (
            <DragScroll className="w-full max-w-[920px]">
              <p className={cn(TYPO.bodyLg, TYPO_SHORT.bodyLg, "whitespace-nowrap leading-relaxed text-ink-3")}>{shown.summary}</p>
            </DragScroll>
          )}
        </motion.div>

        {/* 使用案例：单行标签（不换行，可按住鼠标左右拖动浏览） */}
        {examples.length > 0 && (
          <DragScroll key={`u-${shown.id}`} className="w-full" innerClassName="gap-3">
            {examples.map((s, i) => (
              <motion.span
                key={i}
                initial={{ opacity: 0, y: 7 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.06, ease: [0.4, 0, 0.2, 1] }}
                className={cn(TYPO.bodyLg, TYPO_SHORT.bodyLg, "inline-flex shrink-0 items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-ink-2 shadow-[0_6px_16px_-14px_rgba(90,75,50,0.5)] [@media(max-height:560px)]:px-3 [@media(max-height:560px)]:py-1")}
              >
                <span className="size-2 shrink-0 rounded-full bg-[#8fb0e8]" />
                {t(s)}
              </motion.span>
            ))}
          </DragScroll>
        )}

        {/* 创建项目（居中，紧跟标签） */}
        <div className="flex shrink-0 justify-center">
          <button
            data-action="create"
            onClick={create}
            disabled={busy}
            className={cn(TYPO.subtitle, TYPO_SHORT.subtitle, "group relative inline-flex h-[52px] items-center justify-center gap-2.5 px-10 font-semibold tracking-wide text-white transition-transform duration-200 active:scale-[0.985] disabled:opacity-60 [@media(max-height:560px)]:h-10 [@media(max-height:560px)]:px-8")}
          >
            <SketchPill
              className="absolute inset-0 [filter:drop-shadow(0_10px_18px_rgba(226,60,126,0.32))]"
            />
            <span className="relative">{busy ? t("创建中…") : t("创建项目")}</span>
            <ArrowRight
              className="relative size-[18px] transition-transform duration-300 group-hover:translate-x-0.5"
              strokeWidth={2.6}
            />
          </button>
        </div>
      </div>
    </div>
  );
}

export function Gallery() {
  const [category, setCategory] = useState<string>(allCategories()[0]?.id ?? "scatter");
  const [query, setQuery] = useState("");
  const caseId = useStore((s) => s.galleryCaseId);
  const openCase = useStore((s) => s.openGalleryCase);
  const closeGalleryCase = useStore((s) => s.closeGalleryCase);
  const startHero = useStore((s) => s.startHero);

  /** 点卡片：以被点的那张图为起点开始共享元素过场，详情页主图由它放大而来 */
  const openCaseWithHero = (c: GalleryCase, from?: { x: number; y: number; w: number; h: number }) => {
    const src = assetUrl(c.image);
    if (from && src && from.w > 1) {
      startHero({ from, src, target: `[data-case-hero="${c.id}"]`, to: "gallery", radius: 18 });
    }
    openCase(c.id);
  };

  const q = query.trim().toLowerCase();

  const cases = useMemo(() => {
    return q
      ? allCases().filter((c) => c.title.toLowerCase().includes(q) || c.tags.some((x) => x.toLowerCase().includes(q)))
      : allCategories().find((g) => g.id === category)?.cases ?? [];
  }, [q, category]);

  const selected = caseId ? getCase(caseId) : undefined;

  /**
   * 详情 → 列表的**回程**：也走同一段共享元素过场（HeroFlip），
   * 从详情主图的矩形收回到列表卡片的图块上 —— 这样进/出两程是同一套动作，观感对称。
   *
   * 不用 Motion 的 layoutId：那套要求两侧同一帧挂载/卸载再测量，列表滚动过、卡片有入场
   * 延迟时就会「先冻住再猛冲」甚至像从远处飞来（回程实测就是这个问题）。
   * 详情卸载后拿不到 DOM，所以矩形由 CaseDetail 每帧写进 `heroRectRef`。
   */
  const heroRectRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const prevCaseIdRef = useRef<string | null>(null);
  /** 本页是不是「刚挂载」（第一次渲染）：是的话网格不播入场动效 ——
   *  全屏过场纸层掀开时页面必须已经全部就位，不能再有一段「浮出来」。 */
  const firstGridRef = useRef(true);
  useEffect(() => {
    firstGridRef.current = false;
  }, []);

  useLayoutEffect(() => {
    const prev = prevCaseIdRef.current;
    prevCaseIdRef.current = caseId ?? null;
    if (!prev || caseId) return; // 只认「详情 → 列表」这一下
    const src = assetUrl(getCase(prev)?.image ?? null);
    const from = heroRectRef.current;
    if (src && from && from.w > 1) {
      startHero({ from, src, target: `[data-case-card="${prev}"]`, to: "gallery", radius: 18 });
    }
  }, [caseId, startHero]);

  /** 切换方向的记忆：分类往后翻 → 从右侧滑入，往前翻 → 从左侧滑入 */
  const gridRef = useRef(0);
  const prevCatOrder = useRef<number | null>(null);
  {
    const cur = allCategories().find((g) => g.id === category)?.order ?? 0;
    if (prevCatOrder.current !== null && cur !== prevCatOrder.current) {
      gridRef.current = cur > prevCatOrder.current ? 1 : -1;
    }
    prevCatOrder.current = cur;
  }

  // 列表一渲染就预取本类目的图片宽高比：进详情时每张卡都按真实比例排，不会因「还没加载」多出空白边距
  useEffect(() => {
    prefetchAspects(cases.slice(0, 30));
  }, [cases]);

  // 全局循环：跨所有分类（拖动时一次可以翻好几张，所以这里接受任意整数）
  const n = allCases().length;
  const idx = selected ? Math.max(0, allCases().findIndex((x) => x.id === selected.id)) : 0;
  const nav = (d: number) => {
    if (n === 0) return;
    openCase(allCases()[(((idx + d) % n) + n) % n].id);
  };

  /** 搜索：一旦开始输入就退回列表（搜索结果始终以列表呈现） */
  const onSearch = (v: string) => {
    setQuery(v);
    if (v.trim() && selected) closeGalleryCase();
  };

  /** 点分类：在详情里就地跳到该分类的第一个案例；在列表里只切分类 */  const pickCategory = (id: string) => {
    const inDetail = !!selected && !q;
    const prev = selected;
    setQuery("");
    setCategory(id);
    if (!inDetail || !prev || id === prev.category) return;
    const first = (allCategories().find((g) => g.id === id)?.cases ?? [])[0];
    if (first) openCase(first.id);
    else closeGalleryCase();
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 顶部：Tab 与搜索复用同一块区域。
          列表与详情共用**同一个实例**，切换时这块区域的大小与位置完全不变。 */}
      <PageTopBar>
        <CategoryTabs
          activeId={q ? null : selected?.category ?? category}
          onPick={pickCategory}
          search={{ value: query, onChange: onSearch, placeholder: t("搜索图表示例…"), active: !!q }}
        />
      </PageTopBar>

      {selected && !q ? (
        <CaseDetail c={selected} cases={allCases()} onNav={nav} heroRectRef={heroRectRef} />
      ) : (
        // ⚠️ 横向必须 `hidden`：切分类时整块网格会左右滑入（`initial={{ x: ±56 }}`），
        //    用 `overflow-auto` 的话那几十像素在动画那几帧里就是一条一闪而过的横向滚动条。
        <motion.div layoutScroll className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]">
          <div className={cn("mx-auto w-full max-w-[1280px]", SP.gutterX, SP.gutterBottom, "pt-6")}>
            {cases.length === 0 ? (
              <div className={cn(TYPO.body, "rounded-2xl border border-dashed border-line py-24 text-center text-ink-3")}>
                {q ? t("未找到与「{v1}」相关的示例", { v1: query }) : t("该分类暂无示例")}
              </div>
            ) : (
              <motion.div
                key={`cat:${category}`}
                // 首次挂载（从主页进来）不播动效：过场纸层掀开时页面必须已经全部就位。
                // 只有「在页内切分类」才整体滑一下（一整块位移，不是逐张浮出来）。
                initial={firstGridRef.current ? false : { opacity: 0, x: gridRef.current * 56 }}
                animate={{ opacity: 1, x: 0 }}
                transition={GRID_SLIDE}
                className="flex flex-wrap justify-center gap-6"
              >
                {cases.map((c) => (
                  <CaseCard key={c.id} c={c} onOpen={(from) => openCaseWithHero(c, from)} />
                ))}
              </motion.div>
            )}          </div>
        </motion.div>
      )}
    </div>
  );
}

