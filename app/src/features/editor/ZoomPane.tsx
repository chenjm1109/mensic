import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { Scan, ZoomIn, ZoomOut } from "lucide-react";
import { ToolbarDivider, ToolbarGroup, ToolbarIconButton, toolBarClass } from "@/components/ui/toolbar-button";
import { cn } from "@/lib/utils";
import { TYPO } from "@/core/typography";

/**
 * 可缩放查看区：画布预览与「导出图片预览」共用同一套交互。
 *
 * - 按钮：缩小 / 当前倍率 / 放大 / 适配视野
 * - Ctrl（macOS 为 ⌘）+ 滚轮：以鼠标位置为焦点缩放
 * - 触控板双指捏合：走同一条 ctrl+wheel 通道，因此同样可用
 * - 普通滚轮：滚动查看（放大到超出可视区后用来平移）
 * - 缩放为逐帧写 DOM + 缓动动画，画面完整可见时按中心缩放，溢出后锁定指针位置
 */
export function ZoomPane({
  width,
  height,
  children,
  toolbar = true,
  overlay,
  className,
  workspaceClassName,
}: {
  /** 画布逻辑尺寸（px） */
  width: number;
  height: number;
  children: ReactNode;
  toolbar?: boolean;
  /** 叠加在画布上的内容（不受缩放层影响，大小恒定）。调用方自己定位，记得 `pointer-events-none` */
  overlay?: ReactNode;
  className?: string;
  workspaceClassName?: string;
}) {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const pctRef = useRef<HTMLSpanElement>(null);
  const zoomRef = useRef(1);
  const animRef = useRef<number | null>(null);
  const mouseRef = useRef<{ x: number; y: number } | null>(null);
  /**
   * 当前倍率是否仍等于「自动适配」值。
   * 只要用户手动缩放（按钮/滚轮/捏合）就置空，之后不再自动改倍率，免得和他较劲；
   * 点「适配视野」会重新恢复自动适配。
   */
  const autoFitRef = useRef<number | null>(null);

  /** 直接写 DOM（逐帧更新，不经过 React 渲染，避免动画期间重渲染/被覆盖） */
  const applyStyles = (z: number) => {
    const st = stageRef.current;
    const inn = innerRef.current;
    if (st) {
      st.style.width = `${width * z}px`;
      st.style.height = `${height * z}px`;
    }
    if (inn) {
      inn.style.left = `${(width * (z - 1)) / 2}px`;
      inn.style.top = `${(height * (z - 1)) / 2}px`;
      inn.style.transform = `scale(${z})`;
    }
    if (pctRef.current) pctRef.current.textContent = `${Math.round(z * 100)}%`;
  };

  const workspaceCenter = () => {
    const ws = workspaceRef.current;
    if (!ws) return null;
    const r = ws.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  const mouseAnchor = () => {
    const m = mouseRef.current;
    const ws = workspaceRef.current;
    if (!m || !ws) return null;
    const r = ws.getBoundingClientRect();
    const inside = m.x >= r.left && m.x <= r.right && m.y >= r.top && m.y <= r.bottom;
    return inside ? m : null;
  };

  /**
   * 缩放到目标值：默认以工作区中心为锚点；传入锚点（鼠标位置）时以该点为焦点，
   * 超出可视区后继续缩放会通过逐帧修正滚动锁定该点。
   * keepAutoFit=true 用于「自动适配」自身（不算用户手动缩放）。
   */
  const zoomTo = (
    target: number,
    anchor?: { x: number; y: number } | null,
    opts?: { keepAutoFit?: boolean },
  ) => {
    if (!opts?.keepAutoFit) autoFitRef.current = null; // 用户手动缩放：退出自动适配
    const z1 = clampZoom(target);
    const z0 = zoomRef.current;
    const ws = workspaceRef.current;
    const st = stageRef.current;
    if (!ws || !st) {
      zoomRef.current = z1;
      applyStyles(z1);
      return;
    }
    if (Math.abs(z1 - z0) < 0.001) return;

    const rect = st.getBoundingClientRect();
    const a = anchor ?? workspaceCenter()!;
    const ax = (a.x - rect.left) / z0;
    const ay = (a.y - rect.top) / z0;

    if (animRef.current !== null) cancelAnimationFrame(animRef.current);
    let t0: number | null = null;
    const step = (now: number) => {
      if (t0 === null) t0 = now;
      const p = Math.min(1, Math.max(0, (now - t0) / DURATION));
      const z = z0 + (z1 - z0) * (1 - Math.pow(1 - p, 3));
      zoomRef.current = z;
      applyStyles(z);
      const r = st.getBoundingClientRect();
      ws.scrollLeft += r.left + ax * z - a.x;
      ws.scrollTop += r.top + ay * z - a.y;
      if (p < 1) {
        animRef.current = requestAnimationFrame(step);
      } else {
        animRef.current = null;
        zoomRef.current = z1;
        applyStyles(z1);
      }
    };
    animRef.current = requestAnimationFrame(step);
  };

  /**
   * 立即缩放到目标倍率（**不做缓动**）：把 anchor 那个点在屏幕上钉住。
   * 与 zoomTo 的差别只有「没有动画」—— 捏合是连续手势，逐帧都要跟手，
   * 用缓动去追 200ms 前的目标会像在拖橡皮筋。
   */
  const zoomAt = (target: number, anchor?: { x: number; y: number } | null) => {
    autoFitRef.current = null; // 手动缩放：退出自动适配
    const ws = workspaceRef.current;
    const st = stageRef.current;
    const z1 = clampZoom(target);
    if (!ws || !st) {
      zoomRef.current = z1;
      applyStyles(z1);
      return;
    }
    const z0 = zoomRef.current;
    if (Math.abs(z1 - z0) < 0.001) return;
    const rect = st.getBoundingClientRect();
    const a = anchor ?? workspaceCenter()!;
    const ax = (a.x - rect.left) / z0;
    const ay = (a.y - rect.top) / z0;
    zoomRef.current = z1;
    applyStyles(z1);
    const r = st.getBoundingClientRect();
    ws.scrollLeft += r.left + ax * z1 - a.x;
    ws.scrollTop += r.top + ay * z1 - a.y;
  };

  const fitZoom = () => {
    const el = workspaceRef.current;
    if (!el) return null;
    const availW = el.clientWidth - PAD - 16;
    const availH = el.clientHeight - PAD - 16;
    if (availW <= 0 || availH <= 0) return null;
    return Math.min(MAX_ZOOM, Math.max(0.05, Math.floor(Math.min(availW / width, availH / height) * 100) / 100));
  };

  /**
   * 真实的最佳适配倍率。
   *
   * 直接测一次会偏小：刚挂载时画布还是 1:1，比可视区大 → 工作区出现滚动条 →
   * clientWidth 少掉滚动条的宽度 → 适配出来小 1% 左右（表现为「刚切过来 88%，再点一下适配变 89%」）。
   * 这里先把画布尺寸按第一遍的结果预置好（同一帧内不留痕，不会看到闪动），
   * 滚动条随之消失后再测一遍，取两者较大值 —— 这才是真正的最大适配尺寸。
   */
  const bestFitZoom = (): number | null => {
    const st = stageRef.current;
    const z1 = fitZoom();
    if (z1 === null || !st) return z1;
    if (z1 >= MAX_ZOOM) return z1;
    const prevW = st.style.width;
    const prevH = st.style.height;
    st.style.width = `${width * z1}px`;
    st.style.height = `${height * z1}px`;
    const z2 = fitZoom();
    st.style.width = prevW;
    st.style.height = prevH;
    return z2 === null ? z1 : Math.max(z1, z2);
  };

  useLayoutEffect(() => {
    // 画布尺寸变了：仍处于「自动适配」就重新贴到最佳大小
    if (autoFitRef.current !== null) {
      const z = bestFitZoom();
      if (z !== null) {
        autoFitRef.current = z;
        zoomRef.current = z;
        applyStyles(z);
        return;
      }
    }
    applyStyles(zoomRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height]);

  // 首帧适配视野：直接落到「最佳」尺寸（容器可能还没量出尺寸，重试若干次）
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const attempt = (tries: number) => {
      if (cancelled) return;
      const el = workspaceRef.current;
      if (el && el.clientWidth > 0 && el.clientHeight > 0) {
        const z = bestFitZoom();
        if (z !== null) {
          autoFitRef.current = z;
          zoomRef.current = z;
          applyStyles(z);
        }
        return;
      }
      if (tries > 0) timer = window.setTimeout(() => attempt(tries - 1), 100);
    };
    attempt(20);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height]);

  /**
   * 容器尺寸变化时跟随调整（收起/展开右侧参数栏、切标签、窗口缩放…）：
   * 只要当前倍率还是「自动适配」值，就实时重算——容器是平滑变宽的，
   * 所以这里逐帧改倍率，观感上就是图像跟着侧边栏一起缩放。
   */
  useEffect(() => {
    const el = workspaceRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (autoFitRef.current === null) return; // 用户手动缩放过：不动他的倍率
      const z = bestFitZoom();
      if (z === null) return; // 容器暂时不可见（例如切到数据表格）
      if (Math.abs(z - autoFitRef.current) < 0.005 && Math.abs(z - zoomRef.current) < 0.005) return;
      autoFitRef.current = z;
      zoomRef.current = z;
      applyStyles(z);
    });
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height]);

  // Ctrl/⌘ + 滚轮（含触控板双指捏合）：以鼠标位置为焦点缩放
  useEffect(() => {
    const el = workspaceRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const notches = Math.max(-2, Math.min(2, e.deltaY / 100));
      zoomTo(zoomRef.current * Math.pow(ZOOM_STEP, -notches), { x: e.clientX, y: e.clientY });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * 触屏双指捏合：以两指中点为锚点缩放 —— 手机上这是唯一的缩放入口（没有 ctrl+滚轮）。
   *
   * 与整页缩放的关系：整页双指缩放已经在全局被关掉（index.html 的 viewport +
   * styles.css 的 touch-action），这里是自己算的缩放，所以**必须** preventDefault
   * 拦住 WebView/浏览器对这组手势的默认处理，否则会被当成滚动而收不到后续 touchmove。
   * 单指拖动依旧是原生平移（workspace 的 pan-x pan-y），不在这里管。
   */
  useEffect(() => {
    const el = workspaceRef.current;
    if (!el) return;
    let start: { dist: number; zoom: number } | null = null;

    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const mid = (t: TouchList) => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 });

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      if (animRef.current !== null) cancelAnimationFrame(animRef.current);
      animRef.current = null;
      start = { dist: dist(e.touches), zoom: zoomRef.current };
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !start) return;
      e.preventDefault();
      zoomAt(start.zoom * (dist(e.touches) / Math.max(1, start.dist)), mid(e.touches));
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) start = null;
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
    // 依赖 width/height：zoomAt 闭包里的画布尺寸要跟着走（切案例会换画布尺寸）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height]);

  useEffect(
    () => () => {
      if (animRef.current !== null) cancelAnimationFrame(animRef.current);
    },
    [],
  );

  return (
    <div className={cn("relative flex h-full min-h-0 min-w-0 flex-1 flex-col", className)}>
      {toolbar && (
        <div className="absolute left-1/2 top-4 z-10 -translate-x-1/2">
          <ToolbarGroup className={toolBarClass(undefined, { floating: true })}>
            <ToolbarIconButton
              title={t("缩小")}
              icon={<ZoomOut className="size-4" />}
              onClick={() => zoomTo(zoomRef.current / ZOOM_STEP, mouseAnchor())}
            />
            <span ref={pctRef} className={cn(TYPO.label, "w-11 text-center tabular-nums text-ink-3")} />
            <ToolbarIconButton
              title={t("放大")}
              icon={<ZoomIn className="size-4" />}
              onClick={() => zoomTo(zoomRef.current * ZOOM_STEP, mouseAnchor())}
            />
            <ToolbarDivider />
            <ToolbarIconButton
              title={t("适配视野")}
              icon={<Scan className="size-4" />}
              onClick={() => {
                const z = bestFitZoom();
                if (z !== null) {
                  autoFitRef.current = z; // 重新回到「自动适配」
                  zoomTo(z, null, { keepAutoFit: true });
                }
              }}
            />
          </ToolbarGroup>
        </div>
      )}

      <div
        ref={workspaceRef}
        onMouseMove={(e) => {
          mouseRef.current = { x: e.clientX, y: e.clientY };
        }}
        style={{ overflowAnchor: "none" }}
        className={cn("flex min-h-0 min-w-0 flex-1 overflow-auto p-12", workspaceClassName)}
      >
        <div
          ref={stageRef}
          data-preview-stage
          className="relative m-auto shrink-0 bg-white outline outline-1 outline-border shadow-[0_1px_3px_rgba(70,58,40,0.05),0_14px_34px_-14px_rgba(70,58,40,0.18)]"
        >
          {/* 内容以几何中心缩放；left/top 与 scale 同步（均由 applyStyles 直接写 DOM） */}
          <div
            ref={innerRef}
            className="absolute"
            style={{ width, height, transformOrigin: "center center", willChange: "transform" }}
          >
            {children}
          </div>
          {overlay}
        </div>
      </div>
    </div>
  );
}

const PAD = 96;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;
/** 倍率收进范围并对齐到 1%（避免把 88.0000001% 这类噪声写进 DOM） */
function clampZoom(z: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 100) / 100));
}
/** 乘法步长：每格 ×1.2 / ÷1.2，视觉变化与当前倍率无关 */
const ZOOM_STEP = 1.2;
const DURATION = 200;
