import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useSpring } from "motion/react";

/**
 * 全站自定义光标。
 *
 * 造型和软件一致：一个实心小圆点（跟随指针，毫秒级无延迟）+ 一枚弹簧跟随的描边圆环，
 * 悬停可点元素时圆环放大、按下时收拢。配色取主题色，不引入任何第三方皮肤。
 *
 * 四种形态：
 * - 默认：点 + 圆环；
 * - `pointer`（可点元素）：圆环放大、点收小；
 * - `grab`（可拖拽区域：画廊轮播、横向滚动的标签行等）：圆环外再出现四个短刻线，示意「可以拖」；
 * - 拖拽中：刻线收拢、圆环收紧 —— 像「抓紧了」。
 *
 * 例外（保留系统光标）：文本输入 / 可编辑区域；以及显式声明 `[data-cursor-native]` 的区域。
 * 触屏设备与「减少动态效果」偏好下不启用。
 *
 * ⚠️ 触摸一律当「不显示」：`pointerType === "touch"` 的 enter / down / move 都不画，
 * 并且立刻把已经画出来的藏掉。二合一笔记本上「鼠标能画、手指一点又冒出来一个圈」
 * 就是没挡这一层（系统光标此时是 `cursor: none`，墙角/上次鼠标的位置会留下一个圈+点）。
 */
const INTERACTIVE =
  'a, button, [role="button"], [role="option"], [role="menuitem"], [role="tab"], label, summary, select, input[type="checkbox"], input[type="radio"], [data-cursor="pointer"]';
const TEXTUAL = 'input, textarea, [contenteditable=""], [contenteditable="true"]';
/** 四根短刻线（抓取态）的坐标：从半径 19 到 25 */
const TICKS: [number, number, number, number][] = [
  [32, 7, 32, 13],
  [32, 57, 32, 51],
  [7, 32, 13, 32],
  [57, 32, 51, 32],
];

export function CustomCursor() {
  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState<"default" | "pointer" | "grab">("default");
  const [pressed, setPressed] = useState(false);
  const [visible, setVisible] = useState(false);
  const dotRef = useRef<HTMLDivElement>(null);
  // 圆环用弹簧跟随，点用直接跟随 —— 既有"跟随感"又不失精确
  const ringX = useSpring(0, { stiffness: 420, damping: 34, mass: 0.5 });
  const ringY = useSpring(0, { stiffness: 420, damping: 34, mass: 0.5 });

  useEffect(() => {
    const mq = typeof window.matchMedia === "function" ? window.matchMedia.bind(window) : null;
    // `pointer: fine` 管「有没有精确指针」，`hover: hover` 管「能不能悬停」：
    // 触屏（安卓 WebView / 平板）只满足前者的机器是有的，两个一起判才稳。
    const fine = !!mq && mq("(pointer: fine) and (hover: hover)").matches;
    const reduce = !!mq && mq("(prefers-reduced-motion: reduce)").matches;
    setEnabled(fine && !reduce);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const root = document.documentElement;
    root.classList.add("cursor-none");

    const place = (x: number, y: number) => {
      if (dotRef.current) dotRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      ringX.set(x);
      ringY.set(y);
    };

    const onMove = (e: PointerEvent) => {
      // 触摸：既不跟随也不显示（手指离开后也不留一个圈在原地）
      if (e.pointerType === "touch") {
        setVisible(false);
        return;
      }
      const el = e.target as HTMLElement | null;
      const overText = !!(el && el.closest && el.closest(TEXTUAL));
      const overNative = !!(el && el.closest && el.closest("[data-cursor-native]"));
      const native = overText || overNative;
      setVisible(!native);
      if (native) return; // 交给系统光标，位置不再更新
      place(e.clientX, e.clientY);
      // 就近声明优先：可拖拽区里的小图若标了 data-cursor="pointer"，就按可点击显示
      const marked = el && el.closest ? el.closest("[data-cursor]") : null;
      const kind = marked ? marked.getAttribute("data-cursor") : null;
      const mode =
        kind === "grab" || kind === "grabbing"
          ? "grab"
          : kind === "pointer" || (el && el.closest && el.closest(INTERACTIVE))
            ? "pointer"
            : "default";
      setMode(mode);
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "touch") {
        setVisible(false);
        return;
      }
      setPressed(true);
    };
    const onUp = () => setPressed(false);
    const onLeave = () => setVisible(false);
    // 触摸也会先来一个 pointerenter —— 不挡的话「手指点一下」就会在光标原位置冒出一个圈
    const onEnter = (e: PointerEvent) => setVisible(e.pointerType !== "touch");

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    document.addEventListener("pointerenter", onEnter);
    return () => {
      root.classList.remove("cursor-none");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("pointerenter", onEnter);
    };
  }, [enabled, ringX, ringY]);

  if (!enabled) return null;

  const grabbing = mode === "grab" && pressed;
  const dotSize = mode === "pointer" ? 6 : mode === "grab" ? 8 : 9;
  const ringSize = grabbing ? 24 : mode === "grab" ? 32 : mode === "pointer" ? 46 : 30;

  return createPortal(
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[9999]">
      {/* 圆环（弹簧跟随）：描边 + 一圈极淡的「纸色」外晕，保证在任何背景上都看得清 */}
      <motion.div className="absolute left-0 top-0" style={{ x: ringX, y: ringY }}>
        <motion.div
          className="-translate-x-1/2 -translate-y-1/2 rounded-full border-2"
          style={{ boxShadow: "0 0 0 1.5px color-mix(in srgb, var(--surface) 72%, transparent)" }}
          initial={false}
          animate={{
            width: ringSize,
            height: ringSize,
            opacity: visible ? (pressed && mode === "pointer" ? 0.65 : 1) : 0,
            scale: pressed && mode !== "grab" ? 0.88 : 1,
            borderColor:
              mode === "default"
                ? "color-mix(in srgb, var(--brand) 82%, transparent)"
                : "var(--brand)",
          }}
          transition={{ type: "spring", stiffness: 420, damping: 32, mass: 0.5 }}
        />
      </motion.div>
      {/* 抓取态的四根短刻线：拖动时向内收拢 */}
      <motion.div className="absolute left-0 top-0" style={{ x: ringX, y: ringY }}>
        <motion.svg
          viewBox="0 0 64 64"
          className="absolute -translate-x-1/2 -translate-y-1/2"
          width={64}
          height={64}
          initial={false}
          animate={{ opacity: visible && mode === "grab" ? 1 : 0, scale: grabbing ? 0.84 : 1 }}
          transition={{ type: "spring", stiffness: 420, damping: 30 }}
        >
          {TICKS.map(([x1, y1, x2, y2], i) => (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="var(--brand-strong)"
              strokeWidth={1.8}
              strokeLinecap="round"
            />
          ))}
        </motion.svg>
      </motion.div>
      {/* 实心点（直接跟随，保证精确） */}
      <div ref={dotRef} className="absolute left-0 top-0 will-change-transform">
        <motion.div
          className="-translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--brand-strong)]"
          style={{ boxShadow: "0 0 0 1.5px color-mix(in srgb, var(--surface) 78%, transparent)" }}
          initial={false}
          animate={{
            width: dotSize,
            height: dotSize,
            opacity: visible ? 1 : 0,
            scale: pressed ? 1.3 : 1,
          }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
        />
      </div>
    </div>,
    document.body,
  );
}
