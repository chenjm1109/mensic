import { useEffect, useLayoutEffect, useRef } from "react";
import { useStore } from "@/store";

/** 放大到目标位置的时长（与编辑器侧栏「拉抽屉」的时长对齐，两者同时开始、同时结束） */
const GROW_MS = 340;
/** 落位后与目标页的真实元素做淡入淡出交替的时长 */
const FADE_MS = 240;
/**
 * 目标还没出现时最多原地等多久（只对 `waitForTarget` 的过场生效）。
 *
 * 回程（编辑器 → 创作页）没有可估算的落点，只能等目标卡片出现再开始；
 * 而页面切换要等上一页退场（约 60ms），所以这几帧必须等 —— 否则会出现
 * 「先停在原地、目标一出现就猛地跳一大段」。等不到就用原地当落点，不无限等。
 */
const MAX_WAIT = 400;

/**
 * 共享元素过场（Hero）：
 *
 * 点一张图后（项目卡片 / 画廊卡片），先在原地放一张一模一样的图，占住被点元素的位置，
 * **立刻**开始朝目标长大 —— 目标矩形每帧重新测一次，所以目标页自己的布局还在变
 * （侧栏正在拉出来、画布正在自适应尺寸）时，这张图是跟着一起变的：
 * 整个过程只有一段动画，最后正好落在目标元素上。到位后触发 `landHero()`，
 * 目标页把自己真实的图亮出来（同一位置的交替，看不出切换），过场图淡出后清掉。
 *
 * 之所以不用 Motion 的 layoutId：那套依赖两侧在同一帧挂载/卸载再测量，遇到滚动过的列表、
 * 被缩放的容器、目标页尺寸还在自适应的情形会跑偏（图会「不知道从哪儿钻出来」）。
 * 这里每次都从「被点击那张图的实际屏幕矩形」出发，所以始终连续。
 */
export function HeroFlip() {
  const hero = useStore((s) => s.hero);
  const land = useStore((s) => s.landHero);
  const clear = useStore((s) => s.clearHero);
  const boxRef = useRef<HTMLDivElement>(null);
  /** 静态模糊副本：过场朝编辑器落位时，用透明度把「正在渲染的模糊」叠出来 */
  const blurRef = useRef<HTMLImageElement>(null);

  // 记录当前这段过场的标识，避免同一段动画被重复启动
  const runRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el || !hero) return;
    const key = `${hero.id}|${hero.src}|${hero.from.x},${hero.from.y},${hero.from.w},${hero.from.h}|${hero.target}`;
    if (runRef.current === key) return;
    runRef.current = key;

    let raf = 0;
    let cancelled = false;
    let startedAt = performance.now();
    /** 开始等目标的时刻（只用于给「等待」封顶） */
    const waitSince = startedAt;
    const imgEl = el.querySelector("img");
    /** 目标还没出现时的临时落点：优先用调用方给的估算位置，否则退化成屏幕中上方的一个大框 */
    const fallback = () => {
      if (hero.fallback) return hero.fallback;
      const w = Math.min(window.innerWidth * 0.6, window.innerHeight * 0.9);
      return { x: (window.innerWidth - w) / 2, y: window.innerHeight * 0.22, w, h: w * 0.7 };
    };

    const place = (x: number, y: number, w: number, h: number, radius: number) => {
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      el.style.borderRadius = `${radius}px`;
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    };

    // 起点：被点击的那张图（原样清晰）
    place(hero.from.x, hero.from.y, hero.from.w, hero.from.h, hero.radius);
    if (imgEl) imgEl.style.filter = "none";
    const blurEl = blurRef.current;
    if (blurEl) blurEl.style.opacity = "0";

    /**
     * 逐帧「瞄着目标长大」：目标每帧重新测一次（目标页可能还在展开自己的侧栏、
     * 画布还在自适应尺寸），所以放大与布局变化是同时发生的，最后正好落在目标位置上 ——
     * 而不是「先放大到一个临时位置，再被挤到一边」。
     */
    const step = (now: number) => {
      if (cancelled) return;
      const node = document.querySelector(hero.target);
      const r = node ? node.getBoundingClientRect() : null;
      const measured = r && r.width > 1 && r.height > 1 ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;

      /**
       * 目标还没出现：
       * - 进编辑器那类有精确估算落点（`fallback`）→ 用估算的，第一帧就朝最终位置走；
       * - 回程（`waitForTarget`）→ **先按住不动**，并把计时起点一起往后挪，
       *   等目标真出现时是从 0% 重新开始，而不是从半路接上（那会是一次可见的猛跳）。
       */
      if (!measured && hero.waitForTarget && now - waitSince < MAX_WAIT) {
        startedAt = now;
        place(hero.from.x, hero.from.y, hero.from.w, hero.from.h, hero.radius);
        raf = requestAnimationFrame(step);
        return;
      }

      const p = Math.min(1, (now - startedAt) / GROW_MS);
      const e = 1 - Math.pow(1 - p, 3); // easeOutCubic：起步快、收尾稳
      const to = measured ?? fallback();
      const from = hero.from;
      place(
        from.x + (to.x - from.x) * e,
        from.y + (to.y - from.y) * e,
        from.w + (to.w - from.w) * e,
        from.h + (to.h - from.h) * e,
        hero.radius * (1 - e),
      );
      // 模糊与放大同步推进：落位时已经是目标页那个「渲染中」的模糊程度。
      // ⚠️ 不要把 blur 逐帧写进 filter（每帧重栅格化整张大图）：上面盖的那张是**静态**模糊，
      //    这里只改它的透明度 —— 观感一样，代价是一个合成层的 opacity 动画。
      if (blurEl) blurEl.style.opacity = `${e}`;
      if (p < 1) raf = requestAnimationFrame(step);
      else land();
    };

    raf = requestAnimationFrame(step);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hero?.id, hero?.src, hero?.from.x, hero?.from.y, hero?.from.w, hero?.from.h, hero?.target, hero?.radius]);

  // 落位后淡出，再清掉
  useEffect(() => {
    if (hero?.phase !== "landed") return;
    const id = window.setTimeout(clear, FADE_MS + 40);
    return () => window.clearTimeout(id);
  }, [hero?.phase, clear]);

  /**
   * 兜底：窗口在后台时 requestAnimationFrame 会被暂停，动画就推进不下去。
   * 这里按最坏耗时定一个定时器（等待目标 + 放大 + 余量），到点直接落位 ——
   * 保证不会卡在「预览藏着」的状态。
   */
  useEffect(() => {
    if (!hero || hero.phase !== "grow") return;
    const id = window.setTimeout(land, MAX_WAIT + GROW_MS + 600);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hero?.id, hero?.phase, land]);

  if (!hero) return null;

  return (
    <div
      aria-hidden
      data-hero=""
      className="pointer-events-none fixed left-0 top-0 z-[45]"
      style={{
        opacity: hero.phase === "landed" ? 0 : 1,
        transition: `opacity ${FADE_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
      }}
    >
      <div
        ref={boxRef}
        className={
          "relative overflow-hidden border border-line shadow-[0_30px_70px_-34px_rgba(60,50,35,0.5)] " +
          (hero.bgClass ?? "bg-surface")
        }
      >
        <img src={hero.src} alt="" draggable={false} className="h-full w-full object-contain" />
        {hero.blurTo ? (
          <img
            ref={blurRef}
            src={hero.src}
            alt=""
            aria-hidden
            draggable={false}
            className="pointer-events-none absolute inset-0 h-full w-full object-contain"
            style={{ filter: `blur(${hero.blurTo}px)`, opacity: 0 }}
          />
        ) : null}
      </div>
    </div>
  );
}
