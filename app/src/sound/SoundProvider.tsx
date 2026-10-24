import { useEffect } from "react";
import { ensureCtx, setSoundConfig, sfx, unlock } from "./engine";
import { SOUND_NAMES, type SoundName } from "./patches";
import { useStore } from "@/store";

/** 会被自动加上音效的可交互元素 */
const INTERACTIVE_SELECTOR = [
  "button",
  "a[href]",
  '[role="button"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '[role="tab"]',
  '[role="option"]',
  '[role="switch"]',
  '[data-sfx]',
].join(",");

const VALID = new Set<string>(SOUND_NAMES);

function interactiveFrom(node: EventTarget | null): HTMLElement | null {
  if (!(node instanceof Element)) return null;
  return node.closest(INTERACTIVE_SELECTOR) as HTMLElement | null;
}

function isTypingTarget(el: HTMLElement): boolean {
  return el.matches("input, textarea, select, [contenteditable='true']");
}

/**
 * 全局声效层：
 * - 首次手势解锁音频上下文；
 * - 事件委托：所有可交互元素自动获得「悬停 / 点击」音；
 * - 通过 data-sfx="<name>" 可为单个元素指定音色，data-sfx="none" 可静音；
 * - 与设置中的开关 / 音量实时同步。
 */
export function SoundProvider({ children }: { children: React.ReactNode }) {
  const enabled = useStore((s) => s.soundEnabled);
  const volume = useStore((s) => s.soundVolume);

  // 同步设置
  useEffect(() => {
    setSoundConfig({ enabled, volume: volume / 100 });
  }, [enabled, volume]);

  useEffect(() => {
    // 提前建好（挂起状态）以降低首次发声延迟
    ensureCtx();

    const onFirstGesture = () => unlock();

    let lastEl: HTMLElement | null = null;
    let lastHoverAt = 0;

    const onOver = (e: PointerEvent) => {
      const el = interactiveFrom(e.target);
      if (el === lastEl) return;
      lastEl = el;
      if (!el) return;
      if (el.getAttribute("data-sfx") === "none" || el.hasAttribute("disabled")) return;
      if (isTypingTarget(el)) return;
      const t = performance.now();
      if (t - lastHoverAt < 70) return;
      lastHoverAt = t;
      sfx("hover", 0.9);
    };

    const onOut = (e: PointerEvent) => {
      const el = interactiveFrom(e.target);
      if (!el) return;
      const to = interactiveFrom(e.relatedTarget);
      if (to !== el) lastEl = null;
    };

    const onDown = (e: PointerEvent) => {
      const el = interactiveFrom(e.target);
      if (!el) return;
      const attr = el.getAttribute("data-sfx");
      if (attr === "none") return;
      if (el.hasAttribute("disabled")) return;
      if (attr && VALID.has(attr)) {
        sfx(attr as SoundName);
        return;
      }
      if (el.getAttribute("role") === "switch") {
        sfx(el.getAttribute("data-state") === "checked" ? "toggleOff" : "toggleOn");
        return;
      }
      if (isTypingTarget(el)) return;
      sfx("tap");
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const el = interactiveFrom(document.activeElement);
      if (!el || isTypingTarget(el) || el.hasAttribute("disabled")) return;
      if (el.getAttribute("data-sfx") === "none") return;
      sfx("tap");
    };

    window.addEventListener("pointerdown", onFirstGesture, true);
    window.addEventListener("keydown", onFirstGesture, true);
    window.addEventListener("pointerover", onOver, true);
    window.addEventListener("pointerout", onOut, true);
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);

    return () => {
      window.removeEventListener("pointerdown", onFirstGesture, true);
      window.removeEventListener("keydown", onFirstGesture, true);
      window.removeEventListener("pointerover", onOver, true);
      window.removeEventListener("pointerout", onOut, true);
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, []);

  return <>{children}</>;
}
