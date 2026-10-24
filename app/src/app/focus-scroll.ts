import { useEffect } from "react";
import { isMobile } from "@/platform";

/**
 * 移动端键盘兜底：输入框获得焦点后，等键盘动画结束再确认它有没有落在可视区里。
 *
 * 原生侧已经把 WebView 按 IME insets 压矮（见 `MainActivity.applyImeInsets`），所以这里的
 * `window.innerHeight` 就是「键盘上方还剩多少」。只有仍然被盖住（或跑到顶部之外）才滚一下，
 * 正常情况不打断浏览器的自动聚焦滚动。
 *
 * 下拉 / 弹层里的输入框由 Radix popper 自己避让键盘，这里跳过 —— 否则会把背后的页面滚走。
 */
export function useMobileFocusScroll(): void {
  useEffect(() => {
    if (!isMobile()) return;
    const onFocus = (e: FocusEvent) => {
      const el = e.target instanceof HTMLElement ? e.target : null;
      if (!el) return;
      const editable = el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
      if (!editable) return;
      if (el.closest("[data-radix-popper-content-wrapper]")) return;
      window.setTimeout(() => {
        if (!el.isConnected) return;
        const r = el.getBoundingClientRect();
        const bottom = window.innerHeight - 8;
        if (r.top >= 0 && r.bottom <= bottom) return;
        el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
      }, 350);
    };
    document.addEventListener("focusin", onFocus);
    return () => document.removeEventListener("focusin", onFocus);
  }, []);
}
