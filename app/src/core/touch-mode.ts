/**
 * 触屏模式：把「悬停 / 按压」从浏览器手里拿回来。
 *
 * 两条浏览器规矩，在触屏上都会留下「假选中」：
 * 1. 手指按下也会命中 `:hover`，而且一直挂到下一次点别处；
 * 2. **长按**之后连 `:active` 都卡住 —— 松手了那块底色还在。
 * 于是参数栏的分区标题、Tab 上就留下像「选中了」的一块底色。
 *
 * 纯触屏设备靠 CSS 的 `@media (hover: hover)` 能挡住悬停（见 styles.css），
 * 但长按卡住的 `:active` 挡不住，混合设备（触屏笔记本）的 `hover: hover` 也仍为 true，
 * 所以这里做两件事：
 * - 在 <html> 上打 `data-touch` 标记：手指 / 手写笔按下 → 打，鼠标真的移动了 → 摘；
 * - 触摸的「按下态」改由 `data-pressed` 表示（松手 / 取消立刻摘掉），
 *   CSS 里把触摸时的 `:active` 底色压成透明。
 *
 * 只是旁路标记：不拦事件、不 preventDefault，点击行为一个都不改。
 */

/** 当前被手指按住的 `.hover-sketch`（同一时刻只有一个） */
let pressed: Element | null = null;

function clearPressed(): void {
  if (!pressed) return;
  pressed.removeAttribute("data-pressed");
  pressed = null;
}

export function installTouchMode(): void {
  if (typeof window === "undefined") return;

  const root = document.documentElement;
  let touch = false;

  const set = (on: boolean) => {
    if (on === touch) return;
    touch = on;
    if (on) root.setAttribute("data-touch", "");
    else root.removeAttribute("data-touch");
  };

  // 捕获阶段：赶在这一帧的样式重算之前打标记，手指按下去不会先闪一下悬停底色
  window.addEventListener(
    "pointerdown",
    (e) => {
      clearPressed();

      if (e.pointerType === "mouse") set(false);
      else if (e.pointerType === "touch" || e.pointerType === "pen") set(true);
      else return;

      // 手指 / 手写笔：自己记按下态（鼠标交给 CSS 的 :active，浏览器对它是准的）
      if (e.pointerType === "mouse") return;
      const el = e.target instanceof Element ? e.target.closest(".hover-sketch") : null;
      if (el) {
        el.setAttribute("data-pressed", "");
        pressed = el;
      }
    },
    { capture: true, passive: true },
  );

  // 松手 / 手势被取消（长按、滑动）→ 立刻收掉按下态，绝不留到下一帧以后再
  for (const type of ["pointerup", "pointercancel"] as const) {
    window.addEventListener(type, clearPressed, { capture: true, passive: true });
  }
  // 兜底：窗口失焦时（例如长按弹出了系统面板）不可能再收到 pointerup
  window.addEventListener("blur", clearPressed);

  // 只认真正移动的鼠标（触摸拖动、合成事件都不是 mouse），触摸过的机器一动鼠标就恢复悬停
  window.addEventListener(
    "pointermove",
    (e) => {
      if (touch && e.pointerType === "mouse") set(false);
    },
    { capture: true, passive: true },
  );
}
