import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { TYPO } from "@/core/typography";

/**
 * 轻提示（light notice）：从**顶部中间**掉下来的一小块提示，两秒后自己消失。
 *
 * 设计取向（跟应用整体一致）：
 *  · 材质用现有的 `.chrome`（细边框 + 轻模糊 + 极轻投影），与标题栏 / 弹层同一套；
 *  · 没有新颜色：语气只靠图标区分（成功 = 主题色对勾，提醒 = 弱色信息图标）；
 *  · 动效沿用全应用的短促缓动（opacity + 位移，0.2s）。
 *
 * 用法：App 里挂一次 `<Toaster />`，任何地方 `notify("已复制 …")`。
 */

export type NoticeTone = "ok" | "info";

interface Notice {
  id: number;
  text: string;
  tone: NoticeTone;
}

let notices: Notice[] = [];
let nextId = 1;
const subs = new Set<() => void>();

function emit() {
  for (const fn of subs) fn();
}

function subscribe(fn: () => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}

/**
 * 弹一条轻提示。
 * @param text 文案（已在调用点用 t() 翻好）
 * @param tone `ok`（成功，默认）/ `info`（提醒，例如「剪贴板里不是颜色」）
 */
export function notify(text: string, opts?: { tone?: NoticeTone; duration?: number }): void {
  const id = nextId++;
  notices = [...notices, { id, text, tone: opts?.tone ?? "ok" }];
  emit();
  window.setTimeout(() => {
    notices = notices.filter((n) => n.id !== id);
    emit();
  }, opts?.duration ?? 1900);
}

/** 挂在 App 根部一次即可 */
export function Toaster() {
  const list = React.useSyncExternalStore(
    subscribe,
    () => notices,
    () => notices,
  );
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-16 z-[60] flex flex-col items-center gap-2"
    >
      <AnimatePresence initial={false}>
        {list.map((n) => (
          <motion.div
            key={n.id}
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="chrome pointer-events-auto flex max-w-[420px] items-center gap-2 rounded-lg px-3.5 py-2"
          >
            {n.tone === "ok" ? (
              <Check className="size-3.5 shrink-0 text-[var(--brand-strong)]" />
            ) : (
              <Info className="size-3.5 shrink-0 text-ink-3" />
            )}
            <span className={cn(TYPO.body, "truncate text-ink")}>{n.text}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
