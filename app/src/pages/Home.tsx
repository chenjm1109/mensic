import { useEffect, useRef, useState } from "react";
import { motion, type Variants } from "motion/react";
import { Play } from "@/components/animate-ui/icons/play";
import { useSize } from "@/components/baked";
import { RoughEntryMotif } from "@/components/rough";
import { SketchUnderline } from "@/components/sketch";
import { PaperLayers } from "@/components/ui/paper";
import { useAppName } from "@/core/i18n/useT";
/**
 * 首页背景：**模糊是烘进图里的**（`home-backdrop-*.webp`），不要再用 CSS `filter: blur()`。
 * 安卓 WebView 在超大合成层上会跳过 `filter`（背景会变清晰）；烘进图里四端一致，还省一次全屏模糊。
 * 亮 / 暗各一张，源图是同目录的 `home-backdrop-{light,dark}-sharp.png`
 * （PIL：缩放到 1440 宽 → GaussianBlur(6) → WebP）。
 */
import backdropLight from "@/assets/home-backdrop-light.webp";
import backdropDark from "@/assets/home-backdrop-dark.webp";
import { sfx } from "@/sound";
import { useCurrentProject, useStore, type Page } from "@/store";
import { TYPO } from "@/core/typography";
import { cn } from "@/lib/utils";

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 260, damping: 24 } },
};

/** 三张纸的堆叠动效（起伏 / 旋转 / 抬起都用同一支弹簧） */
const SPRING = { type: "spring", stiffness: 320, damping: 28 } as const;
/**
 * 三张纸：**从左到右**排成一行，相邻两张重叠 `OVERLAP`，叠出「一叠错开的纸」的感觉。
 * 每张比左边那张高一层（z 递增），所以每张的投影正好落在左邻那张纸面上 —— 这就是
 * 「卡片之间」的阴影；鼠标移到哪张，哪张再翻到最上层。
 */
const CARD_W = 296;
/**
 * 纸的高度。**刻意矮**：首页是「字标 + 三张纸」的纵向构图，卡片一高，上下留白就被挤没
 * （手机横屏 / 小宽屏尤其明显）。矮下来之后构图的宽高比更横，缩放适配时才会在上下留出余量。
 *
 * ⚠️ 这个高度和里面那几样是**一套数**：图案盒 128×86 + `gap-4` + 标题/副标题（约 54）
 * + 上下 `py-4`（32）≈ 188，剩下 ~24 是图案上下各自的余量。改图案尺寸要同步这个高度，
 * 否则内容会被 `justify-center` 挤得上下不均（再矮就要连图案一起缩）。
 */
const CARD_H = 212;
const OVERLAP = 44;
const STEP_X = CARD_W - OVERLAP;
const LIFT = 12;

/** 副标题字号（px）。⚠️ 必须与字标下方那个 `TYPO.body`（13px）一致（反推字间距时要用它） */
const SUBTITLE_FONT = 13;

/** 装饰小星（四角） */
function Sparkle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className ?? "size-[18px]"} aria-hidden="true">
      <path
        d="M12 1.6c.7 6.1 4.3 9.7 10.4 10.4C16.3 12.7 12.7 16.3 12 22.4 11.3 16.3 7.7 12.7 1.6 12 7.7 11.3 11.3 7.7 12 1.6Z"
        fill="#c8a06a"
      />
    </svg>
  );
}

interface Entry {
  key: string;
  title: string;
  sub: string;
  motif: "gallery" | "projects" | "settings";
  /** 静止时这一张在第几层：数字大的压在上面 */
  z: number;
  onClick: () => void;
}

/**
 * 首页入口纸：白纸 + 撕边 + 手绘图案。
 *
 * - 三张纸从左到右排开、相邻两张重叠；每张比左邻高一层，所以它的投影会落在左邻纸面上
 *   （这就是「纸与纸之间」的阴影），鼠标移到哪张，哪张再翻到最上层；
 * - 纸内部：图案居中偏上，标题 + 作用文字居中偏下，全部居中对齐。
 */
function EntryCard({
  entry,
  index,
  hot,
  hidden,
  onHot,
  animateIn,
}: {
  entry: Entry;
  index: number;
  hot: string | null;
  hidden?: boolean;
  onHot: (key: string | null) => void;
  /** 冷启动时不播入场（见 Home 里的 `entrance`）：三张纸直接摆在各自位置上 */
  animateIn: boolean;
}) {
  const top = hot === entry.key;
  const x = index * STEP_X;

  // 过渡开始后卸载本张，交给全屏纸层（同 layoutId）接管；保留占位避免位置跳动
  if (hidden) {
    return <div className="absolute" style={{ left: x, top: 0, width: CARD_W, height: CARD_H }} aria-hidden />;
  }

  return (
    <motion.div
      layoutId={`entry-${entry.key}`}
      className="absolute"
      style={{ left: 0, top: 0, width: CARD_W, height: CARD_H, zIndex: top ? 30 : entry.z }}
      initial={animateIn ? { opacity: 0 } : false}
      animate={{ x, y: top ? -LIFT : 0, scale: top ? 1.02 : 1, opacity: 1 }}
      transition={{
        x: SPRING,
        y: SPRING,
        scale: SPRING,
        opacity: { duration: 0.32, delay: 0.06 * index, ease: [0.4, 0, 0.2, 1] },
      }}
    >
      <motion.button
        type="button"
        onClick={entry.onClick}
        // 只有**真的能悬停**才抬起这张纸。触摸没有 hover：手指点一下会先来一个 pointerenter，
        // 于是「抬起来 → 立刻落回去」——小屏（触屏 / 设备模拟）上点卡片时整体抖一下就是这个。
        onPointerEnter={(e) => {
          if (e.pointerType === "touch") return;
          onHot(entry.key);
        }}
        // 键盘 Tab 改变焦点时也抬起并给一声（鼠标划过时全局的 hover 音效已经覆盖，避免重复发声）。
        // ⚠️ 只认 `:focus-visible`：鼠标 / 手指点一下同样会 focus，那时不该把卡片抬起来
        // （否则点下去仍然会「抬一下又落回去」）。
        onFocus={(e) => {
          if (!e.currentTarget.matches(":focus-visible")) return;
          onHot(entry.key);
          sfx("hover", 0.9);
        }}
        whileTap={{ scale: 0.99 }}
        data-sfx="open"
        className="group relative block h-full w-full text-left"
      >
        {/* 纸张：撕边纸片（canvas 烘焙）+ 跟着撕边轮廓走的投影（统一走 PaperLayers） */}
        <PaperLayers raised={top} />

        {/* 内容：图案居中偏上，标题 + 作用居中偏下 */}
        <span className="relative flex h-full flex-col items-center justify-center gap-4 px-6 py-4">
          <span className="h-[86px] w-[128px] shrink-0">
            <RoughEntryMotif kind={entry.motif} className="h-full w-full" />
          </span>
          <span className="flex flex-col items-center">
            <span className={cn(TYPO.heading, "font-bold tracking-tight text-ink")}>{entry.title}</span>
            <span className={cn(TYPO.body, "mt-1 text-ink-3")}>{entry.sub}</span>
          </span>
        </span>
      </motion.button>
    </motion.div>
  );
}

export function Home() {
  const setPage = useStore((s) => s.setPage);
  const appName = useAppName();
  /**
   * 冷启动时启动骨架还盖着（`data-app-ready` 还没打，字标还在等 ZhuoKai）：
   * 这时候播入场动效，等于把「卡片一排排长出来」的过程留给用户看。
   * 所以首屏直接给最终状态；从别的页面回首页时（骨架早没了）照常播。
   */
  const [entrance] = useState(() => document.documentElement.hasAttribute("data-app-ready"));
  // 字标宽度：下划线要跟文字等宽（中文「涵数」与英文「mensic」长度差很多）
  const [titleRef, titleSize] = useSize<HTMLHeadingElement>();
  /**
   * 整张首页是一张**固定尺寸的海报**（三张纸各 296×330、字标 68px），手机上（竖屏 390 宽、
   * 横屏只有 390 高）它比可视区大，于是上下两头都被裁掉 —— 就是「首页没显示完整」。
   *
   * 这里按可用空间**等比缩到放得下**：只缩不放（桌面端恒为 1，观感零变化）。
   * 两个尺寸都用 `useSize`（ResizeObserver 的 contentRect）量，它**不受 transform 影响**，
   * 所以量到的是内容的真实尺寸 —— 不会「缩了之后变窄、再缩一点」自激。
   */
  const [stageRef, stage] = useSize<HTMLDivElement>();
  const [contentRef, content] = useSize<HTMLDivElement>();
  /** 缩放时四周留的余量：**上下**靠它留白 —— 高度成为约束时，上下各留 ~24px（原来只有 ~12px，显得挤） */
  const FIT_PAD = 48;
  const fitScale = Math.min(
    1,
    stage.w > 0 && content.w > 0 ? Math.max(0.05, (stage.w - FIT_PAD) / content.w) : 1,
    stage.h > 0 && content.h > 0 ? Math.max(0.05, (stage.h - FIT_PAD) / content.h) : 1,
  );
  const transition = useStore((s) => s.pageTransition);
  const startTransition = useStore((s) => s.startPageTransition);
  const project = useCurrentProject();
  const bgRef = useRef<HTMLDivElement>(null);
  const [hot, setHot] = useState<string | null>(null);

  /**
   * 副标题「数据可视化笔记本」：字间距按「**总宽 = 字标总宽**」反推。
   *
   * 中文是全角字，一个字正好 1em 宽，于是
   *   字标宽 = 字数 × 字号 + (字数 − 1) × 间距
   * 解出间距即可（`titleSize.w` 就是字标的实测宽度）。
   * 英文文案比中文长得多，算出来是负数 —— 兜底成 0，不强加负间距。
   *
   * ⚠️ `SUBTITLE_FONT` 必须与下面那个 `TYPO.body`（13px）保持一致。
   */
  const subtitle = t("数据可视化笔记本");
  const subtitleGap =
    titleSize.w > 0 && subtitle.length > 1
      ? Math.max(0, (titleSize.w - subtitle.length * SUBTITLE_FONT) / (subtitle.length - 1))
      : 0;

  /**
   * 背景底图跟着鼠标走：指针移动时反向轻移（视差），让静态的散点图「活」起来。
   *
   * 性能上注意两点（否则首页会明显掉帧）：
   * 1. 模糊放在**子元素**上、位移放在**外层容器**上 —— 带 filter 的元素一旦被逐帧改 transform，
   *    浏览器会反复重做模糊（掉到主线程）。分开之后外层只是一个普通的合成层位移，非常便宜。
   * 2. 不用 CSS transition，改为在 rAF 里做「阻尼跟随」：每帧只写一次 transform，
   *    且位移小于半个像素时直接跳过，避免无意义的样式失效。
   * 另外请求了 will-change: transform，让这一层提前提升为合成层。
   */
  useEffect(() => {
    const el = bgRef.current;
    if (!el) return;
    if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf: number | null = null;
    let tx = 0;
    let ty = 0;
    let cx = 0;
    let cy = 0;
    let lastX = -100;
    let lastY = -100;

    const loop = () => {
      const dx = tx - cx;
      const dy = ty - cy;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
        if (!(cx === tx && cy === ty)) {
          cx = tx;
          cy = ty;
          el.style.transform = `scale(1.08) translate3d(${cx.toFixed(2)}px, ${cy.toFixed(2)}px, 0)`;
        }
        raf = null;
        return;
      }
      cx += dx * 0.16;
      cy += dy * 0.16;
      el.style.transform = `scale(1.08) translate3d(${cx.toFixed(2)}px, ${cy.toFixed(2)}px, 0)`;
      raf = requestAnimationFrame(loop);
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      if (Math.abs(e.clientX - lastX) < 1 && Math.abs(e.clientY - lastY) < 1) return;
      lastX = e.clientX;
      lastY = e.clientY;
      const nx = e.clientX / Math.max(1, window.innerWidth) - 0.5;
      const ny = e.clientY / Math.max(1, window.innerHeight) - 0.5;
      tx = -nx * 34;
      ty = -ny * 26;
      if (raf === null) raf = requestAnimationFrame(loop);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, []);

  const entries: Entry[] = [
    {
      key: "gallery",
      title: t("图鉴"),
      sub: t("浏览灵感"),
      motif: "gallery",
      z: 1,
      onClick: () => startTransition("gallery" as Page, "gallery"),
    },
    {
      // 静止时这一张在最上层（鼠标没停在任何一张上时，它就是「当前」的那张）
      key: "projects",
      title: t("创作"),
      sub: t("创建与管理"),
      motif: "projects",
      z: 3,
      onClick: () => startTransition("projects" as Page, "projects"),
    },
    {
      key: "settings",
      title: t("设置"),
      sub: t("调整外观与偏好"),
      motif: "settings",
      z: 2,
      // 与图鉴/创作走同一条「纸片展开成全屏」的过场，声效节奏也就一致了
      // （直接 openSettings() 会让页面立刻切走，导航音与点击音撞在一起）
      onClick: () => startTransition("settings" as Page, "settings"),
    },
  ];

  return (
    <div ref={stageRef} className="relative flex h-full min-h-0 flex-col items-center justify-center overflow-hidden">
      {/* 背景：一张**已烘好模糊**的散点图，亮 / 暗各一张，铺满作为底图（随鼠标视差轻移）。
          ⚠️ 不要再加 `blur-[...]` 之类的 CSS 滤镜，也不要改成 `gallery/<案例>.png`：
             前者在安卓上会被 WebView 跳过（合成层太大），后者是 `public/` 生成物、发布构建会裁掉。 */}
      <div
        ref={bgRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 will-change-transform"
        style={{ transform: "scale(1.08)" }}
      >
        <img
          src={backdropLight}
          alt=""
          draggable={false}
          className="h-full w-full object-cover opacity-60 dark:hidden"
        />
        <img
          src={backdropDark}
          alt=""
          draggable={false}
          className="hidden h-full w-full object-cover opacity-40 dark:block"
        />
      </div>
      {/* 薄雾：亮色用纸色、暗色自动转深，保证前景的字与纸依然清晰 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-surface/50 via-surface/25 to-surface/65"
      />

      {/* 内容：整块按可用空间等比缩放（scale 见上，桌面端 = 1）；`w-max` 让它量得到真实宽度 */}
      <div
        ref={contentRef}
        className="relative flex w-max flex-col items-center"
        style={{ transform: `scale(${fitScale})`, transformOrigin: "center center" }}
      >
      {/* 内容 */}
      <motion.div
        variants={container}
        initial={entrance ? "hidden" : "show"}
        animate="show"
        className="relative flex flex-col items-center px-8"
      >
        {/* 字标 */}
        <motion.div variants={item} className="flex flex-col items-center">
          <h1
            ref={titleRef}
            className={cn(TYPO.display, "leading-none text-ink")}
            style={{ fontWeight: 600, letterSpacing: "0.005em" }}
          >
            {appName}
          </h1>
          <SketchUnderline width={Math.max(60, Math.round(titleSize.w))} thickness={6} className="mt-2" />
          {/* 副标题：一行小字，字间距由上面的 `subtitleGap` 反推，总宽与字标对齐。
              末尾那段字间距用 `marginRight` 抵掉 —— 否则行盒比字宽，居中会看着偏左。 */}
          <p
            className={cn(TYPO.body, "mt-3 text-ink-3")}
            style={{ letterSpacing: `${subtitleGap}px`, marginRight: `-${subtitleGap}px` }}
          >
            {subtitle}
          </p>
          {/* 分隔线 + 星。⚠️ 这里的上下间距（`mt-4` / 下面卡片行的 `mt-6`）要克制：
              卡片变矮之后，中间这一块在原尺寸下显得空 —— 上下各收紧一档，整条「字标 → 副标题
              → 星 → 三张纸」才是均匀的节奏。 */}
          <div className="mt-4 flex items-center justify-center gap-3">
            <span className="h-px w-14" style={{ background: "linear-gradient(to right, rgba(200,160,106,0), #c8a06a)" }} />
            <Sparkle />
            <span className="h-px w-14" style={{ background: "linear-gradient(to left, rgba(200,160,106,0), #c8a06a)" }} />
          </div>
        </motion.div>

        {/* 三张纸从左到右排成一行（相邻重叠）；鼠标移到哪张，哪张翻到最上层 */}
        <div
          className="relative mt-6"
          style={{ width: CARD_W + 2 * STEP_X, height: CARD_H }}
          onPointerLeave={() => setHot(null)}
        >
          {entries.map((e, i) => (
            <EntryCard
              key={e.key}
              entry={e}
              index={i}
              hot={hot}
              hidden={!!transition && transition.motif === e.key}
              onHot={setHot}
              animateIn={entrance}
            />
          ))}
        </div>

        {/* 有上一个项目时：继续编辑（不占纸位，放在摞下面） */}
        {project && (
          <motion.button
            variants={item}
            whileTap={{ scale: 0.97 }}
            onClick={() => setPage("editor")}
            className={cn(TYPO.body, "mt-6 inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-5 py-2.5 font-medium text-ink-2 backdrop-blur-md")}
          >
            <Play size={15} animateOnHover /> {t("继续上一个项目")}
          </motion.button>
        )}
      </motion.div>
      </div>
    </div>
  );
}
