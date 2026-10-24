import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  ChevronRight,
  Copy,
  ExternalLink,
  FolderPlus,
  Folder as FolderIcon,
  FolderInput,
  Info,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { motion, AnimatePresence, type Variants } from "motion/react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Cell, CellGroup } from "@/components/ui/cell";
import { Input } from "@/components/ui/input";
import { RoughStroke } from "@/components/rough";
import { PageTopBar } from "@/components/ui/page-top-bar";
import { PaperLayers } from "@/components/ui/paper";
import { estimatePreviewStage } from "@/features/editor/stage-rect";
import { whenRenderSettled } from "@/lib/render-settled";
import { SearchSwap } from "@/components/ui/search-swap";
import { OUTLINED_CHIP, ToolbarButton, ToolbarDivider, ToolbarIconButton } from "@/components/ui/toolbar-button";
import { breadcrumb, childrenOf } from "@/core/folders";
import { registerFolderExit } from "@/app/folder-nav";
import { SP } from "@/core/spacing";
import type { Folder, ProjectMeta } from "@/core/types";
import { assetUrl, getCase } from "@/gallery";
import { categoryIcon } from "@/gallery/icons";
import { cn } from "@/lib/utils";
import { storage } from "@/platform/storage";
import { sfx } from "@/sound";
import { useStore } from "@/store";
import { TYPO } from "@/core/typography";

/** 顶栏 / 工具栏的小形变（与全站一致的缓动） */
const EASE_UI = [0.4, 0, 0.2, 1] as const;

const listVariants: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.03 } } };
const cardItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 26 } },
};

/** 批量管理：按住拖动超过这个距离才算「划选」，否则仍按一次普通点击处理 */
const DRAG_SELECT_THRESHOLD = 8;

type DragSelectState = {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  /** 起始点下的卡片（从空白处开始拖动时为空） */
  startId: string | null;
  /** 本次拖动最终要选中的集合（开始时是当前已选项） */
  ids: Set<string>;
  active: boolean;
};

function formatTime(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 批量重命名：模板支持 {n}（序号，按位数补零）与 {name}（原名） */
/**
 * 项目排序：**只有一种顺序**（最近更新在前）—— 原来那套「收藏优先 + 手动选排序方式」
 * 已按需求整个去掉（排序功能不要了）。
 */
function sortMetas(list: ProjectMeta[]): ProjectMeta[] {
  return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * 封面 blob 的短期缓存：从列表进编辑器再回来时，不必为每张卡重新读一遍文件。
 * 键带 `coverVersion` —— 编辑器每生成一张新封面都会 +1，旧缓存自然失效。
 */
const coverBlobCache = new Map<string, Blob | null>();
const COVER_CACHE_MAX = 80;
function rememberCover(key: string, blob: Blob | null) {
  if (coverBlobCache.size >= COVER_CACHE_MAX) {
    const oldest = coverBlobCache.keys().next().value;
    if (oldest !== undefined) coverBlobCache.delete(oldest);
  }
  coverBlobCache.set(key, blob);
}

/** 读取项目封面（object URL），随 coverVersion 失效 */
function useCover(meta: ProjectMeta): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let obj: string | null = null;
    if (!meta.hasCover) {
      setUrl(null);
      return;
    }
    const key = `${meta.id}@${meta.coverVersion}`;
    const cached = coverBlobCache.get(key);
    const load = cached !== undefined ? Promise.resolve(cached) : storage().loadCover(meta.id);
    load
      .then((blob) => {
        if (cached === undefined) rememberCover(key, blob);
        if (!alive) return;
        if (blob) {
          obj = URL.createObjectURL(blob);
          setUrl(obj);
        } else setUrl(null);
      })
      .catch(() => {
        if (alive) setUrl(null);
      });
    return () => {
      alive = false;
      if (obj) URL.revokeObjectURL(obj);
    };
  }, [meta.id, meta.hasCover, meta.coverVersion]);
  return url;
}

function Checkbox({ checked, onClick, className }: { checked: boolean; onClick: (e: ReactMouseEvent) => void; className?: string }) {
  return (
    <button
      type="button"
      data-select={checked ? "1" : "0"}
      onClick={onClick}
      className={cn(
        TYPO.label,
        "grid size-6 place-items-center rounded-full border leading-none transition-colors",
        checked
          ? "border-[var(--brand)] bg-[var(--brand)] text-white shadow-sm"
          : "border-line bg-surface/90 text-transparent hover:border-[var(--brand)]",
        className,
      )}
    >
      ✓
    </button>
  );
}

/* ---------------- 项目卡片（瀑布流） ---------------- */
function ProjectCard({
  meta,
  selected,
  selectMode,
  onOpen,
  onSelect,
  onLongPress,
  menu,
}: {
  meta: ProjectMeta;
  selected: boolean;
  selectMode: boolean;
  onOpen: () => void;
  onSelect: () => void;
  /** 长按卡片：进入批量管理模式（并把这张一起选上），带上当前指针，便于不松手继续划选 */
  onLongPress: (start: { pointerId: number; x: number; y: number }) => void;
  menu: ReactNode;
}) {
  const cover = useCover(meta);
  const caseInfo = getCase(meta.caseId);
  const img = cover ?? assetUrl(caseInfo?.image ?? null);
  const CategoryIcon = categoryIcon(caseInfo?.category);
  const startHero = useStore((s) => s.startHero);
  const hero = useStore((s) => s.hero);
  const imgRef = useRef<HTMLImageElement>(null);
  /** 过场期间把原卡片藏起来（占位仍在），避免图和卡片同时出现两份 */
  const [flying, setFlying] = useState(false);
  useEffect(() => {
    if (!hero) setFlying(false);
  }, [hero]);

  /**
   * 长按卡片 → 进入批量管理模式（鼠标 / 触屏通用）。
   *
   * - 按住 500ms 触发；中途挪动超过 8px（滚动、拖拽）就取消；
   * - 触发后**不松手继续滑动**：指针交给网格的划选逻辑，滑过的卡片继续选中；
   * - 触发后**必须吃掉紧随其后的那一下 click** —— 长按松手时浏览器还会补一个 click，
   *   不拦掉就会「刚进批量模式又顺手把项目打开了」；
   * - 右上角菜单里的按下不算（那个按钮有自己的语义）。
   */
  const pressTimer = useRef(0);
  const pressAt = useRef<{ x: number; y: number } | null>(null);
  /** 长按触发时要捕获的指针：不松手继续滑动，move / up 才会继续冒泡到网格的划选逻辑 */
  const pressPointer = useRef(0);
  const pressTarget = useRef<HTMLElement | null>(null);
  const longPressed = useRef(false);

  const cancelPress = () => {
    if (pressTimer.current) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = 0;
    }
    pressAt.current = null;
    pressTarget.current = null;
  };
  useEffect(() => cancelPress, []);

  const onPressDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    // 先清掉上一轮长按的尾巴（划选结束时可能没有 click 来负责复位）。
    // 放在 selectMode 判断之前：批量模式下再点这张卡时也要清。
    longPressed.current = false;
    if (selectMode || e.button !== 0) return;
    if ((e.target as HTMLElement).closest("[data-card-menu]")) return;
    pressPointer.current = e.pointerId;
    pressTarget.current = e.currentTarget;
    pressAt.current = { x: e.clientX, y: e.clientY };
    pressTimer.current = window.setTimeout(() => {
      pressTimer.current = 0;
      const at = pressAt.current;
      if (!at) return;
      // 长按已经确认：之后的移动不再用于取消长按，而是转交给网格做划选。
      pressAt.current = null;
      longPressed.current = true;
      try {
        pressTarget.current?.setPointerCapture(pressPointer.current);
      } catch {
        /* 指针已经释放：忽略 */
      }
      onLongPress({ pointerId: pressPointer.current, x: at.x, y: at.y });
    }, 500);
  };

  const onPressMove = (e: ReactPointerEvent) => {
    const at = pressAt.current;
    if (!at) return;
    if (Math.abs(e.clientX - at.x) > 8 || Math.abs(e.clientY - at.y) > 8) cancelPress();
  };

  /** 点卡片：以这张图为起点开始共享元素过场，让编辑器里的预览由它放大而来 */
  const openWithHero = () => {
    // 长按已经进了批量模式：这一下 click 是长按的尾巴，不要再打开项目
    if (longPressed.current) {
      longPressed.current = false;
      return;
    }
    const r = imgRef.current?.getBoundingClientRect();
    if (!selectMode && img && r && r.width > 1 && r.height > 1) {
      setFlying(true);
      startHero({
        from: { x: r.left, y: r.top, w: r.width, h: r.height },
        src: img,
        target: "[data-preview-stage]",
        to: "editor",
        radius: 14,
        fallback: estimatePreviewStage(meta.caseId),
        blurTo: 9, // 预览在渲染完成前是模糊占位（5–13px 来回呼吸），这里收在中间值上
        bgClass: "bg-white",
      });
    }
    onOpen();
  };
  return (
    <motion.div
      variants={cardItem}
      // ⚠️ 按压反馈**不要用 Motion 的 `whileTap`**（曾经是）：它每帧改卡片根的 `transform`，
      // 而卡片根不是合成层 → **每帧重绘整张卡** → 连带重新光栅化纸张的 drop-shadow
      // （实测 ~6ms/帧），于是点一下之后要卡零点几秒。改用 CSS `:active`（与图鉴卡片同一套）：
      // transform 过渡走合成器，不触发重绘。
      // 进场动画不受影响：`cardItem.show` 自带 transition。
      className="group/card relative mb-6 break-inside-avoid"
      data-project-id={meta.id}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={openWithHero}
        onPointerDown={onPressDown}
        onPointerMove={onPressMove}
        onPointerUp={cancelPress}
        onPointerCancel={cancelPress}
        onPointerLeave={cancelPress}
        onKeyDown={(e) => {
          // 只有焦点在卡片本身时才响应（右侧菜单按钮有自己的键盘行为）
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openWithHero();
          }
        }}
        className={cn(
          "cursor-pointer transition-transform duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] active:scale-[0.99]",
          // 批量模式下按住拖动是「划选」：触屏必须禁用卡片上的原生滚动，
          // 否则手指一移动浏览器就接管成滚动并取消 pointer 事件。
          selectMode && "touch-none select-none",
        )}
        style={{ visibility: flying ? "hidden" : "visible" }}
      >
        {/* 纸张（每张卡自己一款毛边：种子 = 项目 id；选中掩膜也跟着这条毛边走）：
            整张卡（图 + 名称）都印在这张纸上，纯白底 */}
        <PaperLayers tone="white" seed={meta.id} selected={selected} />
        <div className="relative p-2.5">
          {/* 图像直接印在纸上：**不加边线、不加圆角**（创作列表页专用；详情页与编辑页仍保留框线）。
              也不给底色 —— 暗色下纸张是 surface-2，给 bg-surface 会浮出一个比纸更暗的方块。 */}
          <div className="relative overflow-hidden">
            {img ? (
              <img
                ref={imgRef}
                data-project-card={meta.id}
                src={img}
                alt=""
                loading="lazy"
                decoding="async"
                draggable={false}
                className="w-full transition-transform duration-500 ease-out group-hover/card:scale-[1.02]"
              />
            ) : (
              <div className={cn(TYPO.label, "grid aspect-[3/2] w-full place-items-center text-ink-4")}>{t("暂无预览")}</div>
            )}

            {/* 类型 icon：**卡片左上角**，悬浮在图上（与右上角的 ⋯ 对称）。
                批量模式下让位给左上角的选择框，避免两者叠在一起。
                外观只描边、不投影（`OUTLINED_CHIP`），边线与工具栏外框同款。 */}
            {!selectMode && (
              <span
                title={caseInfo?.title ?? t("未知案例")}
                className={cn("absolute left-2 top-2 grid size-7 place-items-center rounded-full text-[var(--brand-strong)]", OUTLINED_CHIP)}
              >
                <CategoryIcon className="size-4" strokeWidth={1.8} />
              </span>
            )}

            {/* ⋯ 菜单：**卡片右上角**，与左上角的类型 icon 对称（同样给一层底，压在图上才看得清）。
                `data-card-menu`：长按进批量模式时要跳过这块（菜单有自己的长按语义）。 */}
            <div data-card-menu className="absolute right-2 top-2" onClick={(e) => e.stopPropagation()}>
              {menu}
            </div>

            {(selectMode || selected) && (
              <Checkbox
                checked={selected}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect();
                }}
                className="absolute left-2 top-2"
              />
            )}
          </div>

          {/* 标题与模板名称：底部**居中**。上一行是用户自定义项目名，下一行是模板名。 */}
          <div className="mt-2.5 px-0.5 text-center">
            <div className={cn(TYPO.subtitle, "truncate font-bold tracking-tight text-ink")}>{meta.name}</div>
            <div className={cn(TYPO.label, "mt-1.5 truncate text-ink-3")}>{caseInfo?.title ?? t("未知模板")}</div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ---------------- 文件夹卡片 ---------------- */

/** 内容区坐标系里的矩形：x / y 相对内容区左上角（不是视口坐标） */
type Box = { x: number; y: number; w: number; h: number };

/** 一次文件夹过场：方向 + 起始矩形 + 内容区矩形（`FolderMorph` 按它播动画） */
type MorphState = {
  id: string;
  /** 文件夹名（进入时画在纸中央） */
  name: string;
  dir: "in" | "out";
  from: Box;
  area: Box;
};

/** 进入：纸从卡片展开到内容区；退出：纸先盖住内容区，再收回到卡片上 */
const MORPH_IN_COVER_MS = 240;
const MORPH_IN_HOLD_CAP_MS = 420;
const MORPH_OUT_COVER_MS = 170;
const MORPH_EASE = [0.16, 1, 0.3, 1] as const;

/**
 * 文件夹进出的过场：**只在内容区里播**的一张纸（不是全屏白幕）。
 *
 * 为什么不再盖满整屏（踩过）：
 * - 原来的纸是 `fixed inset-0 z-40`，把顶栏一起盖住 —— 回退按钮「先消失、后出现」，
 *   整片白纸在亮色下就是一次白屏闪烁，用户明确不要；
 * - 现在纸被裁在内容区（滚动区外面那层 `relative` 容器）里，顶栏始终露着，
 *   面包屑 / 工具栏各自做形变动效（见 `Projects` 里的 `leading` 与工具栏）。
 *
 * 顺序仍是**先动效、后内容**：
 * - 进入：纸从卡片展开 → 盖满内容区的那一刻才切目录 → 等新目录画完（`whenRenderSettled`）
 *   → 淡出露出内容。等待期间纸中央显示「文件夹名」，不是一块空白；
 * - 退出：纸在内容区上淡入 → 盖满后切回上一级 → 量上一级里那张卡片的落点 → 收回到卡片上。
 */
function FolderMorph({
  id,
  name,
  dir,
  from,
  area,
  onSwap,
  onDone,
}: {
  id: string;
  /** 文件夹名（进入时画在纸中央，让「等新目录画完」那段不空） */
  name: string;
  dir: "in" | "out";
  /** 进入 = 被点的卡片矩形；退出 = 整个内容区（都由调用点算成内容区坐标） */
  from: Box;
  /** 内容区的视口矩形：退出时用它把目标卡片的视口坐标换算成内容区坐标 */
  area: Box;
  /** 纸盖满内容区的那一刻：此时才切目录（用户看不到切换） */
  onSwap: () => void;
  onDone: () => void;
}) {
  /** 0 = 覆盖中；1 = 已盖满（等目标页画完 / 量落点）；2 = 让开（淡出 / 收回） */
  const [phase, setPhase] = useState<0 | 1 | 2>(0);
  const [target, setTarget] = useState<Box | null>(null);
  const cb = useRef({ onSwap, onDone });
  useEffect(() => {
    cb.current = { onSwap, onDone };
  });

  // 第一步：盖满之后才切目录。
  // 进入用定时器对齐展开动画；退出用 CSS 淡入（走合成器，主线程卡也不掉链子，见 styles.css）。
  useEffect(() => {
    const ms = dir === "in" ? MORPH_IN_COVER_MS : MORPH_OUT_COVER_MS;
    const t = window.setTimeout(() => {
      cb.current.onSwap();
      setPhase(1);
    }, ms);
    return () => window.clearTimeout(t);
  }, [dir]);

  /**
   * 第二步：
   * - 进入：新目录（几十张纸卡 + 图片上屏 + 滤镜光栅化）挂载要掉帧 300~700ms，等画完再露，
   *   否则看到的是「内容一帧一帧长出来」；
   * - 退出：上一级已经挂在纸下面，下一帧量出目标卡片的落点就立刻开始收回。
   */
  useEffect(() => {
    if (phase !== 1) return;
    if (dir === "in") {
      return whenRenderSettled(() => setPhase(2), { quietMs: 80, capMs: MORPH_IN_HOLD_CAP_MS });
    }
    let raf = 0;
    let tries = 0;
    const find = () => {
      const el = document.querySelector<HTMLElement>(`[data-folder-id="${id}"]`);
      const r = el?.getBoundingClientRect();
      if (el && r && r.width > 4 && r.height > 4) {
        // 纸正盖满内容区，滚动看不见 —— 先把卡片滚进视野，落点才不会飞到屏外
        el.scrollIntoView({ block: "center" });
        const r2 = el.getBoundingClientRect();
        setTarget({ x: r2.left - area.x, y: r2.top - area.y, w: r2.width, h: r2.height });
        setPhase(2);
        return;
      }
      if (tries++ < 60) raf = requestAnimationFrame(find);
      else setPhase(2); // 卡片没找到（例如刚被删掉）：直接让纸淡出
    };
    raf = requestAnimationFrame(find);
    return () => cancelAnimationFrame(raf);
  }, [phase, dir, id, area]);

  // 第三步播完撤纸：进入 = 淡出（160ms）；退出 = 收回（280ms）
  useEffect(() => {
    if (phase !== 2) return;
    const t = window.setTimeout(() => cb.current.onDone(), dir === "in" ? 190 : 320);
    return () => window.clearTimeout(t);
  }, [phase, dir]);

  // 兜底：任何意外（窗口被遮挡导致 rAF 停摆等）都别把纸留在屏幕上
  useEffect(() => {
    const t = window.setTimeout(() => cb.current.onDone(), dir === "in" ? 1600 : 1400);
    return () => window.clearTimeout(t);
  }, [dir]);

  // 纸层宽高固定为内容区大小、靠 transform 缩放（合成器友好）；原点是左上角
  const at = (b: Box) => ({ x: b.x, y: b.y, scaleX: b.w / area.w, scaleY: b.h / area.h });
  const FULL = { x: 0, y: 0, scaleX: 1, scaleY: 1 };
  /** 目标卡片 / 起始卡片的形态（圆角随纸一起缩放，落回卡片时正好是卡片的小圆角） */
  const cardLike = (b: Box) => ({ ...at(b), borderRadius: 14 });
  const targetBox = dir === "in" ? from : target;

  return (
    <>
      <motion.div
        data-folder-morph={dir}
        aria-hidden
        className={cn(
          "pointer-events-none absolute left-0 top-0 z-30 bg-surface shadow-[0_8px_28px_-8px_rgba(70,58,40,0.30)] dark:bg-surface-2",
          // 退出第一步的淡入必须走 CSS（合成器），见 styles.css 的 .folder-sheet-in
          dir === "out" && phase === 0 && "folder-sheet-in",
        )}
        style={{ width: area.w, height: area.h, originX: 0, originY: 0, willChange: "transform, opacity" }}
        initial={dir === "in" && targetBox ? { ...cardLike(targetBox), opacity: 1 } : { ...FULL, borderRadius: 0 }}
        animate={
          phase === 2
            ? dir === "in"
              ? { ...FULL, borderRadius: 0, opacity: 0 }
              : target
                ? { ...cardLike(target), opacity: 1 }
                : { ...FULL, borderRadius: 0, opacity: 0 }
            : { ...FULL, borderRadius: 0 }
        }
        transition={
          dir === "in"
            ? phase === 2
              ? { duration: 0.16, ease: "easeOut" }
              : { duration: MORPH_IN_COVER_MS / 1000, ease: MORPH_EASE }
            : target
              ? { duration: 0.28, ease: MORPH_EASE }
              : { duration: 0.16, ease: "easeOut" }
        }
      />
      {/* 进入：纸盖满后中央显示文件夹名（等新目录画完的那 100~400ms 不是一块空白） */}
      {dir === "in" && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-30 grid place-items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: phase === 1 ? 1 : 0 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
        >
          <span className={cn(TYPO.bodyLg, "flex items-center gap-2 text-ink-3")}>
            <FolderIcon className="size-4" />
            {name}
          </span>
        </motion.div>
      )}
    </>
  );
}

function FolderTile({ folder, count, onOpen, menu }: { folder: Folder; count: number; onOpen: (el: HTMLElement | null) => void; menu: ReactNode }) {
  return (
    <motion.div
      data-folder-id={folder.id}
      className="group/folder relative w-[230px] shrink-0 transition-[scale] duration-300 ease-out active:scale-[0.99]"
    >
      {/* 纸张（与首页卡片同一套画法 + 自己一款毛边：种子 = 文件夹 id，底为纯白） */}
      <PaperLayers tone="white" seed={folder.id} />
      {/* 整张卡片（含内边距）都是点击热区：内边距做在这个按钮里，只有右侧菜单排除在外 */}
      <div
        role="button"
        tabIndex={0}
        data-cursor="pointer"
        onClick={(e) => onOpen(e.currentTarget)}
        onKeyDown={(e) => {
          // 只有焦点在卡片本身时才响应；焦点在右侧菜单按钮上时交给它自己处理
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen(e.currentTarget);
          }
        }}
        className="relative flex cursor-pointer items-center gap-3 px-4 py-4"
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand-strong)] transition-transform duration-300 ease-out group-hover/folder:scale-110">
          <FolderIcon className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn(TYPO.bodyLg, "block truncate font-semibold text-ink")}>{folder.name}</span>
          <span className={cn(TYPO.label, "block text-ink-3")}>{count} 个项目</span>
        </span>
        <span className="shrink-0" onClick={(e) => e.stopPropagation()}>
          {menu}
        </span>
      </div>
    </motion.div>
  );
}

export function Projects() {
  const ready = useStore((s) => s.ready);
  const index = useStore((s) => s.index);
  const scope = useStore((s) => s.scope);
  const selection = useStore((s) => s.selection);
  const selectMode = useStore((s) => s.selectMode);
  const justDeleted = useStore((s) => s.justDeleted);
  const setPage = useStore((s) => s.setPage);
  const setScope = useStore((s) => s.setScope);
  const toggleSelect = useStore((s) => s.toggleSelect);
  const setSelection = useStore((s) => s.setSelection);
  const setSelectMode = useStore((s) => s.setSelectMode);
  const createFolder = useStore((s) => s.createFolder);
  const renameFolder = useStore((s) => s.renameFolder);
  const deleteFolder = useStore((s) => s.deleteFolder);
  const openProject = useStore((s) => s.openProject);
  const renameProject = useStore((s) => s.renameProject);
  const duplicateProject = useStore((s) => s.duplicateProject);
  const deleteProject = useStore((s) => s.deleteProject);
  const deleteProjects = useStore((s) => s.deleteProjects);
  const restoreDeleted = useStore((s) => s.restoreDeleted);
  const moveProjects = useStore((s) => s.moveProjects);

  const [query, setQuery] = useState("");
  /** 搜索框展开状态（受控给 SearchSwap）：页面级「返回」要把它一起收起来 */
  const [searchOpen, setSearchOpen] = useState(false);
  const [flash, setFlash] = useState("");

  const [renaming, setRenaming] = useState<ProjectMeta | null>(null);
  const [renameValue, setRenameValue] = useState("");
  /** 项目属性弹窗：只读展示元数据，不触发项目内容加载 */
  const [propsMeta, setPropsMeta] = useState<ProjectMeta | null>(null);
  const [folderDialog, setFolderDialog] = useState<{ mode: "new" | "rename"; id?: string; value: string } | null>(null);
  const [deletingFolder, setDeletingFolder] = useState<Folder | null>(null);
  const [moveIds, setMoveIds] = useState<string[] | null>(null);
  const [moveTarget, setMoveTarget] = useState<string | null>(null);
  const [confirmDeleteBatch, setConfirmDeleteBatch] = useState(false);
  /** 单张卡片「删除」的二次确认目标（项目 id + 名称） */
  const [deletingProject, setDeletingProject] = useState<{ id: string; name: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sortedRef = useRef<ProjectMeta[]>([]);

  /**
   * 顶栏的「视觉目录」：点击的那一刻就切到新状态，让面包屑 / 工具栏先做形变；
   * 内容区的 `scope` 要等过场纸盖满才切（否则会看到目录硬切换）。
   * 其它路径（删文件夹等）由下面的 effect 兜底同步。
   */
  const [viewScope, setViewScope] = useState<string | null>(scope);
  useEffect(() => {
    setViewScope(scope);
  }, [scope]);

  /** 内容区（滚动区外层的定位容器）：过场纸挂在它里面，只盖内容、不盖顶栏 */
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  /**
   * 文件夹进出的过场（只在内容区里播，见 `FolderMorph`）。
   * 一张纸**先动、目录后切**：纸盖满的那一刻才 `setScope`，用户看不到目录切换的那一帧。
   */
  const [morph, setMorph] = useState<MorphState | null>(null);

  /** 点文件夹卡片：量出卡片与内容区的矩形，交给过场纸去展开 */
  const enterFolder = (id: string, el: HTMLElement | null) => {
    if (morph) return; // 过场中忽略连点
    // 顶栏先切：面包屑 / 工具栏立刻开始形变（内容仍等纸盖满再切）
    setViewScope(id);
    const a = contentRef.current?.getBoundingClientRect();
    const r = el?.getBoundingClientRect();
    if (!a || !r || r.width < 4 || r.height < 4) {
      setScope(id);
      return;
    }
    setMorph({
      id,
      name: index.folders.find((f) => f.id === id)?.name ?? "",
      dir: "in",
      from: { x: r.left - a.left, y: r.top - a.top, w: r.width, h: r.height },
      area: { x: a.left, y: a.top, w: a.width, h: a.height },
    });
  };

  /**
   * 退出文件夹：纸先在内容区上淡入（盖住当前目录）→ 再切回上一级 → 收回到那张卡片上。
   * 顶栏不参与过场，回退按钮 / 面包屑 / 工具栏原地做形变。
   */
  const exitFolder = () => {
    if (!scope || morph) return;
    setViewScope(null);
    const a = contentRef.current?.getBoundingClientRect();
    if (!a) {
      setScope(null);
      return;
    }
    setMorph({
      id: scope,
      name: "",
      dir: "out",
      from: { x: 0, y: 0, w: a.width, h: a.height },
      area: { x: a.left, y: a.top, w: a.width, h: a.height },
    });
  };

  /**
   * 页面级「返回」在搜索态下的落点：**回到「创作」一级**。
   *
   * 搜索结果是**跨文件夹**的（`base = q ? index.projects : inScope`），面包屑也已经写着
   * 「搜索结果」—— 所以返回不先落回那个文件夹，而是清掉搜索、直接回一级页。
   * 在文件夹里搜的，借用退出文件夹的过场纸把内容切换藏起来。
   */
  const exitSearch = () => {
    setQuery("");
    setSearchOpen(false);
    if (scope) exitFolder();
  };

  // 标题栏面包屑 / useGoUp 这些「页面外」入口把退出转交给这里（保留下场动效）；
  // 创作页没挂载时它们自己 setScope（例如从编辑器返回文件夹）。
  const exitFolderRef = useRef(exitFolder);
  exitFolderRef.current = exitFolder;
  useEffect(
    () =>
      registerFolderExit(() => {
        if (!scope) return false;
        if (morph) return true; // 过场中：吞掉重复点击
        exitFolderRef.current();
        return true;
      }),
    [scope, morph],
  );

  /** 纸盖满内容区的那一刻才切目录（用户看不到切换） */
  const morphSwap = () => {
    if (!morph) return;
    setViewScope(morph.dir === "in" ? morph.id : null);
    if (morph.dir === "in") {
      setScope(morph.id);
      scrollRef.current?.scrollTo({ top: 0 });
    } else {
      setScope(null);
    }
  };

  const q = query.trim().toLowerCase();

  useEffect(() => {
    if (renaming || folderDialog) {
      const id = window.setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 30);
      return () => window.clearTimeout(id);
    }
  }, [renaming, folderDialog]);

  const toast = (m: string) => {
    setFlash(m);
    window.setTimeout(() => setFlash(""), 1800);
  };

  // 批量管理快捷键：Esc 退出；Ctrl/Cmd+A 全选当前筛选结果
  useEffect(() => {
    if (!selectMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectMode(false);
        return;
      }
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (!typing && (e.key === "a" || e.key === "A") && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setSelection(sortedRef.current.map((p) => p.id));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectMode, setSelectMode, setSelection]);

  const subFolders = childrenOf(index.folders, scope);
  const inScope = index.projects.filter((p) => (p.folderId ?? null) === scope);
  const base = q ? index.projects : inScope;
  const filtered = q
    ? base.filter((p) => {
        const caseTitle = getCase(p.caseId)?.title ?? "";
        return p.name.toLowerCase().includes(q) || caseTitle.toLowerCase().includes(q);
      })
    : base;
  const sorted = sortMetas(filtered);
  sortedRef.current = sorted;
  const countIn = (folderId: string | null) => index.projects.filter((p) => (p.folderId ?? null) === folderId).length;

  // 批量管理：当前列表中的选中项 + 全选状态
  const selectedSet = new Set(selection);
  const selectedInView = sorted.filter((p) => selectedSet.has(p.id));
  const allSelected = sorted.length > 0 && selectedInView.length === sorted.length;

  /** 当前文件夹路径（只允许一级，所以最多一段）；空数组表示在「全部项目」。
      用 `viewScope`：顶栏在点击那一刻就切过去，不等内容区换完。 */
  const folderTrail = viewScope ? breadcrumb(index.folders, viewScope) : [];

  const confirmRename = () => {
    if (renaming) {
      renameProject(renaming.id, renameValue);
      sfx("notify");
    }
    setRenaming(null);
  };

  const confirmFolder = () => {
    if (!folderDialog) return;
    const name = folderDialog.value.trim();
    if (name) {
      if (folderDialog.mode === "new") createFolder(name);
      else if (folderDialog.id) renameFolder(folderDialog.id, name);
      sfx("notify");
    }
    setFolderDialog(null);
  };

  const confirmDeleteFolder = () => {
    if (deletingFolder) {
      deleteFolder(deletingFolder.id);
      sfx("delete");
      toast("文件夹已删除，内容已上移一级");
    }
    setDeletingFolder(null);
  };

  const confirmMove = () => {
    if (moveIds) {
      moveProjects(moveIds, moveTarget);
      sfx("notify");
      toast(t("已移动 {v1} 个项目", { v1: moveIds.length }));
    }
    setMoveIds(null);
  };

  /* ---------------- 批量管理 ---------------- */

  const toggleSelectMode = (on: boolean) => {
    sfx(on ? "toggleOn" : "toggleOff");
    setSelectMode(on);
  };

  const toggleSelectAll = () => {
    sfx("select");
    setSelection(allSelected ? [] : sorted.map((p) => p.id));
  };

  /**
   * 批量管理：在卡片区域按住拖动 → 指针划过的卡片一起选中。
   *
   * - 鼠标左键 / 手指都走 Pointer Events；普通点击超过 `DRAG_SELECT_THRESHOLD` 才进入划选，
   *   所以「点一下」仍然只是切换那一张（不会被误判成划选）。
   * - 长按进入批量模式是**另一条入口**：长按触发时直接把当前指针交给这里并标成 active，
   *   于是不松手继续滑就能接着选（见 `ProjectCard` 的 `onLongPress`）。
   * - 触屏拖动期间必须在卡片上 `touch-action: none`（见 `ProjectCard`），否则浏览器
   *   会先把它当成页面滚动，直接发 `pointercancel`，划选根本收不到 move。
   * - 快速拖动时两个 pointermove 之间可能跨过好几张卡，所以沿线按 12px 采样补齐。
   * - 划选结束后会吃掉紧随其后的 click，避免松手时又切换一遍起始卡片。
   */
  const dragSelect = useRef<DragSelectState | null>(null);
  const suppressCardClick = useRef(false);

  // 长按触发时这一组触摸的 touch-action 在 pointerdown 那刻已经定下（那时还没进批量模式，
  // 卡片仍是可滚动的），事后改成 touch-none 不一定能救回当前手势 —— 所以在划选激活后用
  // 非 passive 的 touchmove 拦掉原生滚动，保证不松手继续拖也能收到 pointermove。
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onTouchMove = (e: TouchEvent) => {
      if (dragSelect.current?.active) e.preventDefault();
    };
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", onTouchMove);
  }, []);

  const cardIdAt = (x: number, y: number): string | null =>
    (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>("[data-project-id]")?.dataset
      .projectId ?? null;

  const paintDragSelect = (x: number, y: number, d: DragSelectState) => {
    let changed = false;
    const add = (id: string | null) => {
      if (!id || d.ids.has(id)) return;
      d.ids.add(id);
      changed = true;
    };
    add(d.startId);

    const dx = x - d.lastX;
    const dy = y - d.lastY;
    const steps = Math.max(1, Math.min(24, Math.ceil(Math.hypot(dx, dy) / 12)));
    for (let i = 1; i <= steps; i++) {
      add(cardIdAt(d.lastX + (dx * i) / steps, d.lastY + (dy * i) / steps));
    }
    d.lastX = x;
    d.lastY = y;
    if (changed) setSelection([...d.ids]);
  };

  const beginDragSelect = (e: ReactPointerEvent<HTMLDivElement>) => {
    // 上一次划选若没产生 click（例如在空白处松手），这里顺手清掉，别吞掉下一次真正的点击
    suppressCardClick.current = false;
    if (!selectMode) {
      dragSelect.current = null;
      return;
    }
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // 卡片的「⋯」菜单、复选框等自带交互，不当作划选起点
    if ((e.target as HTMLElement | null)?.closest("[data-card-menu], button, a, input, textarea")) return;
    dragSelect.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      startId: cardIdAt(e.clientX, e.clientY),
      ids: new Set(selection),
      active: false,
    };
  };

  const moveDragSelect = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragSelect.current;
    if (!d || d.pointerId !== e.pointerId) return;
    // 鼠标只是悬停移过（没有按键）时不能接着上一次没收到 up 的会话继续划选。
    // 用 getState 而不是渲染时的 selectMode：长按触发与下一步 move 之间只隔一个微任务，
    // 不能赌 React 已经用新状态换掉了这个事件处理器。
    if (e.buttons === 0 || !useStore.getState().selectMode) {
      dragSelect.current = null;
      return;
    }
    if (!d.active) {
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_SELECT_THRESHOLD) return;
      d.active = true;
      // 进入划选后这次手势不再算「点卡片」：松手时的 click 在下面被吞掉
      suppressCardClick.current = true;
      // 捕获指针：鼠标 / 手指滑出网格后仍然能收到 move 与 up
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* 指针已经释放：忽略 */
      }
    }
    paintDragSelect(e.clientX, e.clientY, d);
  };

  const endDragSelect = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragSelect.current;
    if (!d || d.pointerId !== e.pointerId) return;
    if (d.active) paintDragSelect(e.clientX, e.clientY, d);
    dragSelect.current = null;
  };

  const suppressDraggedClick = (e: ReactMouseEvent) => {
    if (!suppressCardClick.current) return;
    suppressCardClick.current = false;
    e.preventDefault();
    e.stopPropagation();
  };


  const projectMenu = (meta: ProjectMeta) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* 这个 ⋯ 现在悬浮在**图片右上角**（与左上角的类型 icon 对称），所以给它一层底才看得清；
            与卡片角标同款：只描边、不投影（`OUTLINED_CHIP`）。 */}
        <button className={cn("group/btn relative grid size-7 shrink-0 place-items-center rounded-full text-ink-3 transition-colors hover-sketch", OUTLINED_CHIP)}>
          <MoreHorizontal className="relative size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="border-line shadow-[0_12px_30px_-20px_rgba(60,50,35,0.45)]">
        <DropdownMenuItem onSelect={() => void openProject(meta.id)}>
          <ExternalLink className="size-3.5" /> {t("打开")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            setRenameValue(meta.name);
            setRenaming(meta);
          }}
        >
          <Pencil className="size-3.5" /> {t("重命名")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            void duplicateProject(meta.id);
            sfx("notify");
          }}
        >
          <Copy className="size-3.5" /> {t("复制")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            setMoveTarget(meta.folderId);
            setMoveIds([meta.id]);
          }}
        >
          <FolderInput className="size-3.5" /> {t("移动到…")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setPropsMeta(meta)}>
          <Info className="size-3.5" /> {t("属性")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onSelect={() => {
            // 危险操作：先弹窗二次确认（真正删除在弹窗里执行）
            setDeletingProject({ id: meta.id, name: meta.name });
            sfx("select");
          }}
        >
          <Trash2 className="size-3.5" /> {t("删除")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const folderMenu = (folder: Folder) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="group/btn relative grid size-8 shrink-0 place-items-center rounded-full text-ink-3 transition-colors hover-sketch">
          <MoreHorizontal className="relative size-[17px]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="border-line shadow-[0_12px_30px_-20px_rgba(60,50,35,0.45)]">
        <DropdownMenuItem onSelect={() => setFolderDialog({ mode: "rename", id: folder.id, value: folder.name })}>
          <Pencil className="size-3.5" /> {t("重命名")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeletingFolder(folder)}>
          <Trash2 className="size-3.5" /> {t("删除文件夹")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (!ready) {
    return <div className={cn(TYPO.body, "flex h-full items-center justify-center text-muted-foreground")}>{t("正在载入项目库…")}</div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0">
        <PageTopBar
          onBack={q ? exitSearch : viewScope ? exitFolder : selectMode ? () => toggleSelectMode(false) : undefined}
          /* 提示要跟着实际动作走：搜索态下返回 = 退出搜索，批量模式下返回 = 退出批量管理 */
          backTitle={q ? t("退出搜索") : !viewScope && selectMode ? t("退出批量管理") : undefined}
          /* 标题即面包屑：一级显示「项目」；进入文件夹后显示 项目 › 文件夹名。
             紧贴返回按钮右侧（不占中间那块位置）—— 中间留给工具栏，
             与画廊页的分类 Tab 组落在**同一坐标、同一高度**。 */
          /* 批量模式下**整块标题让位**：工具栏中途变成批量工具条（更宽），胶囊会压住标题
             和它那条手绘下划线，看上去像渲染错乱。反正批量时这块空间归工具条。 */
          leading={selectMode ? undefined : (
            /* 面包屑：**不重挂整块**（以前 `key={scope}` 会整块换掉，进出像硬切）。
               「创作」原位不动，只有「› 文件夹名」滑入 / 滑出、下划线交接 ——
               配合内容区的过场纸，顶栏在整个进出过程里都是同一个东西。 */
            <div
              /* 只在**放得下**的时候显示：中间那块（工具栏）固定居中，
                 左边留给标题的空间 ≈ 0.5vw − 392（工具栏胶囊约 547 宽 + 返回按钮 80，英文标签更宽）。
                 `whitespace-nowrap` 必须有：宽度不够时宁可溢出（会被中间的胶囊盖住），
                 也**绝不能折成两行** —— 竖排的「创/作」既难看又会把顶栏撑高。
                 放不下时（< 800px）**整个标题不显示**：标题字号受 TYPO 约束不能缩。 */
              className={cn(
                "hidden flex-nowrap items-center gap-2 whitespace-nowrap min-[800px]:flex",
                // 上限 = 「中间那块左边还剩多少」（实测：普通模式胶囊 495 宽 → 余量 0.5vw−340；
                // 文件夹模式少一个「创建文件夹」按钮、胶囊 400 宽 → 余量 0.5vw−292。各留 12px 不贴着胶囊）。
                // ⚠️ 按钮文案改成「开始创作 / 创建文件夹」后，胶囊分别加宽 52 / 26px（中文 13px × 多出的 4 / 2 个字），
                // 余量同步减掉：普通模式 −392、文件夹模式 −318。
                // 不分开算的话：文件夹模式下会被算小 48px，当前文件夹名被压成 0 宽。
                viewScope ? "max-w-[calc(50vw_-_318px)]" : "max-w-[calc(50vw_-_392px)]",
              )}
            >
              {q ? (
                /* 搜索是**跨文件夹**的（下面的 filtered 用 index.projects）：
                   这里只报「搜索结果」，不再显示文件夹路径 —— 否则「创作 › 某文件夹」
                   和下面列出的其它文件夹内容对不上。 */
                <span className="relative inline-block">
                  <h1 className={cn(TYPO.heading, "font-bold leading-none tracking-tight text-ink")}>
                    {t("搜索结果")}
                  </h1>
                  <RoughStroke className="absolute -bottom-1 -left-1 -right-1 h-2" />
                </span>
              ) : (
                <>
                  <span className="relative inline-block">
                    {viewScope ? (
                      <button
                        type="button"
                        onClick={exitFolder}
                        title={t("回到全部项目")}
                        className={cn(TYPO.heading, "inline-block shrink-0 font-bold leading-none tracking-tight text-ink transition-colors hover:text-[var(--brand-strong)]")}
                      >
                        {t("创作")}
                      </button>
                    ) : (
                      <h1 className={cn(TYPO.heading, "font-bold leading-none tracking-tight text-ink")}>{t("创作")}</h1>
                    )}
                    {/* 下划线铺满标题宽度；进入文件夹后交给文件夹名（这里淡出，避免线突然跳走） */}
                    <motion.span
                      aria-hidden
                      className="pointer-events-none absolute -bottom-1 -left-1 -right-1 block h-2"
                      initial={false}
                      animate={{ opacity: viewScope ? 0 : 1 }}
                      transition={{ duration: 0.2, ease: EASE_UI }}
                    >
                      <RoughStroke className="h-full w-full" />
                    </motion.span>
                  </span>
                  <AnimatePresence initial={false}>
                    {folderTrail.map((f) => (
                      <motion.span
                        key={f.id}
                        initial={{ opacity: 0, x: 12 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 12 }}
                        transition={{ duration: 0.22, ease: EASE_UI }}
                        className="flex shrink-0 items-center gap-2 whitespace-nowrap"
                      >
                        <ChevronRight className="size-5 shrink-0 text-ink-4" strokeWidth={2.4} />
                        <span className="relative inline-block min-w-0">
                          <h1 className={cn(TYPO.heading, "truncate font-bold leading-none tracking-tight text-ink")}>{f.name}</h1>
                          {/* 同上：下划线始终贴合文件夹标题的宽度 */}
                          <RoughStroke className="absolute -bottom-1 -left-1 -right-1 h-2" />
                        </span>
                      </motion.span>
                    ))}
                  </AnimatePresence>
                </>
              )}
            </div>
          )}
        >
          {/* 工具栏 / 搜索栏复用同一块区域：点最右的放大镜原地变成搜索框 */}
          <div className={cn("flex w-full min-w-0 justify-center")}>
          <SearchSwap
            className="max-w-full"
            value={query}
            onChange={setQuery}
            placeholder={t("搜索项目…")}
            keepOpenWhenFilled
            open={searchOpen}
            onOpenChange={setSearchOpen}
          >
            {(openSearch) => (
              /* 批量管理：**原地**把这条工具栏变成批量工具（不再在下面弹一条新的、把页面顶下去）。
                 两个内容块都带 `layout`，配合 SearchSwap 胶囊的 `layout` + `overflow-hidden`：
                 变形时轮廓连续变化，内容既不拉伸也不溢出。 */
              <AnimatePresence mode="popLayout" initial={false}>
                {selectMode ? (
                  <motion.div
                    key="batch"
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                    className={cn(TYPO.body, "no-scrollbar flex w-fit max-w-full shrink-0 items-center gap-1 overflow-x-auto pl-2")}
                  >
            <Checkbox checked={allSelected} onClick={toggleSelectAll} />
            <span className="min-w-[96px] shrink-0 pl-1 tabular-nums text-ink-2">
              {/* 勾选是**跨文件夹**的：只有当前勾选全都在本视图内时，才显示「/ 本视图总数」；
                  否则只报总数，免得出现「已选 5 / 3 项」这种自相矛盾的比例 */}
              {selection.length > 0 && selection.length <= sorted.length ? (
                <>
                  {t("已选")} <b className="font-semibold text-[var(--brand-strong)]">{selection.length}</b> / {sorted.length} 项
                </>
              ) : (
                <>
                  {t("已选")} <b className="font-semibold text-[var(--brand-strong)]">{selection.length}</b> 项
                </>
              )}
            </span>
            <span className="mx-0.5 h-5 w-px shrink-0 bg-line" />
            {/* 「全选 / 反选 / 清除」三个按钮已去掉：最前面那个小方框本身就是全选开关
                （点一下全选、再点一下取消全选，见 `toggleSelectAll`）；
                反选没有别的入口，取消勾选也不需要单独按钮 —— 退出批量模式就会清空。 */}
            <ToolbarButton
              compact
              icon={<FolderInput className="size-4" />}
              label={t("移动")}
              disabled={selection.length === 0}
              onClick={() => {
                setMoveTarget(scope);
                setMoveIds([...selection]);
              }}
            />
            <ToolbarButton compact danger icon={<Trash2 className="size-4" />} label={t("删除")} disabled={selection.length === 0} onClick={() => setConfirmDeleteBatch(true)} />
            <ToolbarButton compact icon={<X className="size-4" />} label={t("退出")} data-sfx="none" onClick={() => toggleSelectMode(false)} />
                  </motion.div>
                ) : (
                  <motion.div
                    key="normal"
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                    className="flex min-w-0 items-center gap-1"
                  >
            {/* 「开始创作」单独放最左，用分隔线与其余操作区分 */}
            <ToolbarButton
              icon={<Plus className="size-4" />}
              label={t("开始创作")}
              title={t("从案例新建项目")}
              primary
              onClick={() => setPage("gallery")}
            />
            {/* 导入别人给的项目包已按需求移除（不再通过界面导入 .mensic） */}

          {/* 只允许一级文件夹：已在文件夹内就不再提供「创建文件夹」。
              进出文件夹时按钮**收拢 / 展开**（不是瞬间消失），工具栏胶囊跟着连续变宽变窄。 */}
          <AnimatePresence initial={false}>
            {!viewScope && (
              <motion.span
                key="new-folder"
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: "auto", opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: EASE_UI }}
                className="flex shrink-0 self-stretch overflow-hidden"
              >
                <ToolbarButton
                  icon={<FolderPlus className="size-4" />}
                  label={t("创建文件夹")}
                  title={t("创建文件夹")}
                  onClick={() => setFolderDialog({ mode: "new", value: t("新建文件夹") })}
                />
              </motion.span>
            )}
          </AnimatePresence>

          <ToolbarDivider />

                <ToolbarIconButton
                  icon={<Search className="size-4" />}
                  title={q ? t("搜索：{v1}", { v1: query }) : t("搜索项目")}
                  active={!!q}
                  glide={false}
                  onClick={openSearch}
                />
                  </motion.div>
                )}
              </AnimatePresence>
            )}
          </SearchSwap>
          </div>
        </PageTopBar>

      </header>

      {/* 内容区：过场纸挂在这层里（`relative` + `overflow-hidden`），只盖内容、不盖顶栏 ——
          回退按钮 / 面包屑 / 工具栏因此始终在原位，不参与过场。 */}
      <div ref={contentRef} className="relative min-h-0 flex-1 overflow-hidden">
        <div ref={scrollRef} className="h-full overflow-auto [scrollbar-gutter:stable]">
        <div className={cn("mx-auto w-full max-w-[1280px]", SP.gutterX, SP.gutterBottom, "pt-6")}>
        {/* 目录切换：正常路径下过场纸先盖满、再切目录（看不到切换），所以这里的淡入只是兜底
            —— 例如删掉当前文件夹后 store 直接重置了 scope。
            过场进行中（morph 非空）不淡入：新内容在纸下面挂载，直接以最终状态就位，
            免得纸一收回去露出「半透明内容」。 */}
        <motion.div
          key={scope ?? "root"}
          initial={morph ? false : { opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.18, ease: [0.4, 0, 0.2, 1] } }}
        >
        {/* 子文件夹 */}
        {!q && subFolders.length > 0 && (
          <div className="mb-7 flex flex-wrap gap-4">
            {subFolders.map((f) => (
              <FolderTile key={f.id} folder={f} count={countIn(f.id)} onOpen={(el) => enterFolder(f.id, el)} menu={folderMenu(f)} />
            ))}
          </div>
        )}

        {/* 空状态不显示任何提示，直接留白 */}
        {/* 瀑布流分栏（CSS `columns`：纸张投影依赖它，**别改成 flex/grid**，见 paper.tsx 文件头）。
            列数与图鉴页对齐：手机横屏（≈844px）也要 **4 列** —— 原来 `sm:columns-2 lg:columns-3`
            在手机上只有 2 列，一张卡占半屏。这里 640px 起就 4 列，正好等于图鉴 `w-[calc(25%-18px)]`
            的同款密度（4 列 + gap-6 时，卡宽 = (可用宽 − 3×24)/4，两者一致）。
            ⚠️ 别用 `min-[700px]:columns-4` 这类**任意变体**：Tailwind 会把它排在 `sm:`/`lg:` 之前，
            被 `sm:columns-2` 覆盖（实测过，不生效）。用命名断点。 */}
        {sorted.length > 0 && (
          <motion.div
            variants={listVariants}
            /* 过场中：卡片直接以最终状态出现（在纸下面），不要从 opacity 0 / y 12 一张张长出来 ——
               纸收回去的时候理应看到一整面已经排好的卡片。 */
            initial={morph ? false : "hidden"}
            animate="show"
            onPointerDown={beginDragSelect}
            onPointerMove={moveDragSelect}
            onPointerUp={endDragSelect}
            onPointerCancel={endDragSelect}
            onClickCapture={suppressDraggedClick}
            className="columns-1 gap-6 sm:columns-4"
          >
            {sorted.map((p) => (
              <ProjectCard
                key={p.id}
                meta={p}
                selected={selection.includes(p.id)}
                selectMode={selectMode}
                onOpen={() => (selectMode ? toggleSelect(p.id) : void openProject(p.id))}
                onSelect={() => toggleSelect(p.id)}
                onLongPress={({ pointerId, x, y }) => {
                  if (selectMode) return;
                  toggleSelectMode(true);
                  // 长按这张也直接选中；ids 与下一次 setSelection 保持同一份集合，
                  // 这样不松手继续滑时只是在它上面继续追加。
                  const ids = new Set(selection);
                  ids.add(p.id);
                  setSelection([...ids]);
                  dragSelect.current = {
                    pointerId,
                    startX: x,
                    startY: y,
                    lastX: x,
                    lastY: y,
                    startId: p.id,
                    ids,
                    // 长按已经是明确的选择手势：不用再等 8px 阈值，直接进入划选
                    active: true,
                  };
                }}
                menu={projectMenu(p)}
              />
            ))}
          </motion.div>
        )}
        </motion.div>
        </div>
        </div>

        {/* 文件夹进出的过场纸：只在这块内容区里播（见 `FolderMorph` 的文件头） */}
        {morph && (
          <FolderMorph
            key={`${morph.dir}-${morph.id}`}
            id={morph.id}
            name={morph.name}
            dir={morph.dir}
            from={morph.from}
            area={morph.area}
            onSwap={morphSwap}
            onDone={() => setMorph(null)}
          />
        )}
      </div>

      {/* 项目属性（只读） */}
      <Dialog open={propsMeta !== null} onOpenChange={(o) => !o && setPropsMeta(null)}>
        {propsMeta &&
          (() => {
            const caseInfo = getCase(propsMeta.caseId);
            const folder = propsMeta.folderId
              ? index.folders.find((f) => f.id === propsMeta.folderId)
              : null;
            const value = cn(TYPO.body, "truncate text-right text-ink-2");
            return (
              <DialogContent className="w-[min(460px,92vw)] sm:max-w-none">
                <DialogHeader>
                  <DialogTitle>{t("项目属性")}</DialogTitle>
                  <DialogDescription>{t("查看项目的基本信息。")}</DialogDescription>
                </DialogHeader>
                <CellGroup>
                  <Cell
                    title={t("名称")}
                    controlFill
                    control={
                      <span className={value} title={propsMeta.name}>
                        {propsMeta.name}
                      </span>
                    }
                  />
                  <Cell
                    title={t("所属类型")}
                    control={
                      <span className={cn(value, "whitespace-nowrap")}>
                        {caseInfo?.categoryTitle ?? t("未知案例")}
                      </span>
                    }
                  />
                  <Cell
                    title={t("使用模板")}
                    controlFill
                    control={
                      <span className={value} title={caseInfo?.title ?? t("未知模板")}>
                        {caseInfo?.title ?? t("未知模板")}
                      </span>
                    }
                  />
                  <Cell
                    title={t("模板版本")}
                    control={
                      <span className={cn(value, "whitespace-nowrap")}>
                        {caseInfo ? `v${caseInfo.version}` : "—"}
                      </span>
                    }
                  />
                  <Cell
                    title={t("所在文件夹")}
                    controlFill
                    control={
                      <span className={value} title={folder?.name ?? t("全部项目")}>
                        {folder?.name ?? t("全部项目")}
                      </span>
                    }
                  />
                  <Cell
                    title={t("创建时间")}
                    control={
                      <span className={cn(value, "whitespace-nowrap")}>
                        {formatTime(propsMeta.createdAt)}
                      </span>
                    }
                  />
                  <Cell
                    title={t("最近编辑")}
                    control={
                      <span className={cn(value, "whitespace-nowrap")}>
                        {formatTime(propsMeta.updatedAt)}
                      </span>
                    }
                  />
                  <Cell
                    title={t("最近打开")}
                    control={
                      <span className={cn(value, "whitespace-nowrap")}>
                        {propsMeta.lastOpenedAt
                          ? formatTime(propsMeta.lastOpenedAt)
                          : t("从未打开")}
                      </span>
                    }
                  />
                </CellGroup>
                <DialogFooter>
                  <Button variant="outline" data-sfx="none" onClick={() => setPropsMeta(null)}>
                    {t("关闭")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            );
          })()}
      </Dialog>

      {/* 重命名项目 */}
      <Dialog open={renaming !== null} onOpenChange={(o) => !o && setRenaming(null)}>
        {renaming && (
          <DialogContent className="w-[min(380px,92vw)] sm:max-w-none">
            <DialogHeader>
              <DialogTitle>{t("重命名项目")}</DialogTitle>
              <DialogDescription>{t("输入新的项目名称，回车确认。")}</DialogDescription>
            </DialogHeader>
            <Input
              ref={inputRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  confirmRename();
                }
              }}
              placeholder={t("项目名称")}
            />
            <DialogFooter>
              <Button variant="outline" data-sfx="none" onClick={() => setRenaming(null)}>
                {t("取消")}
              </Button>
              <Button onClick={confirmRename}>{t("确定")}</Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* 新建 / 重命名文件夹 */}
      <Dialog open={folderDialog !== null} onOpenChange={(o) => !o && setFolderDialog(null)}>
        {folderDialog && (
          <DialogContent className="w-[min(380px,92vw)] sm:max-w-none">
            <DialogHeader>
              <DialogTitle>{folderDialog.mode === "new" ? t("新建文件夹") : t("重命名文件夹")}</DialogTitle>
              <DialogDescription>{t("输入文件夹名称，回车确认。")}</DialogDescription>
            </DialogHeader>
            <Input
              ref={inputRef}
              value={folderDialog.value}
              onChange={(e) => setFolderDialog({ ...folderDialog, value: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  confirmFolder();
                }
              }}
              placeholder={t("文件夹名称")}
            />
            <DialogFooter>
              <Button variant="outline" data-sfx="none" onClick={() => setFolderDialog(null)}>
                {t("取消")}
              </Button>
              <Button onClick={confirmFolder}>{t("确定")}</Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* 删除文件夹确认 */}
      <Dialog open={deletingFolder !== null} onOpenChange={(o) => !o && setDeletingFolder(null)}>
        {deletingFolder && (
          <DialogContent className="w-[min(400px,92vw)] sm:max-w-none">
            <DialogHeader>
              <DialogTitle>{t("删除文件夹")}</DialogTitle>
              <DialogDescription>
                确定删除「{deletingFolder.name}」？里面的项目与子文件夹会移动到上一级。
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" data-sfx="none" onClick={() => setDeletingFolder(null)}>
                {t("取消")}
              </Button>
              <Button onClick={confirmDeleteFolder}>{t("删除")}</Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* 移动到文件夹 */}
      <Dialog open={moveIds !== null} onOpenChange={(o) => !o && setMoveIds(null)}>
        {moveIds && (
          <DialogContent className="w-[min(420px,92vw)] sm:max-w-none">
            <DialogHeader>
              <DialogTitle>{t("移动到文件夹")}</DialogTitle>
              <DialogDescription>{t("选择目标文件夹（共 {v1} 个项目）。", { v1: moveIds.length })}</DialogDescription>
            </DialogHeader>
            <div className="max-h-[46vh] overflow-auto rounded-md border border-border p-1">
              <button
                onClick={() => setMoveTarget(null)}
                className={cn(
                  TYPO.body,
                  "flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left hover:bg-accent",
                  moveTarget === null && "text-[var(--brand-strong)]",
                )}
              >
                <FolderIcon className="size-3.5" /> 全部项目（不归类）
                {moveTarget === null && <span className="ml-auto">✓</span>}
              </button>
              {childrenOf(index.folders, null).map((f) => (
                <button
                  key={f.id}
                  onClick={() => setMoveTarget(f.id)}
                  className={cn(
                    TYPO.body,
                    "flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left hover:bg-accent",
                    moveTarget === f.id && "text-[var(--brand-strong)]",
                  )}
                >
                  <FolderIcon className="size-3.5" /> {f.name}
                  {moveTarget === f.id && <span className="ml-auto">✓</span>}
                </button>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" data-sfx="none" onClick={() => setMoveIds(null)}>
                {t("取消")}
              </Button>
              <Button onClick={confirmMove}>{t("移动")}</Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* 批量重命名 */}

      {/* 批量删除确认 */}
      <Dialog open={confirmDeleteBatch} onOpenChange={setConfirmDeleteBatch}>
        <DialogContent className="w-[min(400px,92vw)] sm:max-w-none">
          <DialogHeader>
            <DialogTitle>{t("删除 {v1} 个项目", { v1: selection.length })}</DialogTitle>
            <DialogDescription>
              {t("删除后可在底部提示条中撤销；5 秒后将彻底删除。")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" data-sfx="none" onClick={() => setConfirmDeleteBatch(false)}>
              {t("取消")}
            </Button>
            <Button
              onClick={() => {
                const ids = [...selection];
                setConfirmDeleteBatch(false);
                deleteProjects(ids);
                sfx("delete");
              }}
            >
              {t("删除")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 单张卡片删除确认 */}
      <Dialog open={deletingProject !== null} onOpenChange={(o) => !o && setDeletingProject(null)}>
        <DialogContent className="w-[min(400px,92vw)] sm:max-w-none">
          <DialogHeader>
            <DialogTitle>{t("删除项目")}</DialogTitle>
            <DialogDescription>
              {deletingProject
                ? t("确定删除「{v1}」？删除后可在底部提示条中撤销；5 秒后将彻底删除。", { v1: deletingProject.name })
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" data-sfx="none" onClick={() => setDeletingProject(null)}>
              {t("取消")}
            </Button>
            <Button
              onClick={() => {
                const target = deletingProject;
                setDeletingProject(null);
                if (!target) return;
                deleteProject(target.id);
                sfx("delete");
              }}
            >
              {t("删除")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 撤销删除 / 操作提示 */}
      {justDeleted && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center">
          <div className={cn(TYPO.body, "pointer-events-auto flex items-center gap-3 rounded-full border border-line bg-surface px-4 py-2 shadow-[0_12px_30px_-20px_rgba(60,50,35,0.45)]")}>
            <span className="text-ink-2">
              {justDeleted.items.length === 1 ? t("已删除「{v1}」", { v1: justDeleted.items[0].name }) : t("已删除 {v1} 个项目", { v1: justDeleted.items.length })}
            </span>
            <button onClick={restoreDeleted} className="font-medium text-[var(--brand-strong)]">
              {t("撤销")}
            </button>
          </div>
        </div>
      )}
      {flash && !justDeleted && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center">
          <div className={cn(TYPO.body, "rounded-full border border-line bg-surface px-4 py-2 text-ink-2 shadow-[0_12px_30px_-20px_rgba(60,50,35,0.45)]")}>{flash}</div>
        </div>
      )}
    </div>
  );
}
