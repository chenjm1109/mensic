/**
 * 本机字体列表：**启动后自动扫一次**，面板只订阅结果（不再让用户点「扫描」）。
 *
 * 扫描要拉一次渲染后端（本端原生 sidecar / Pyodide），所以放在 App 启动后的空闲时机跑，
 * 不阻塞首屏；扫失败也只是退回内置字体族，不报错。
 *
 * 每个族带**实测的字形覆盖**（`cjk` / `latin`，见 `render.py` 的 `font_list`）：
 * 参数栏用它把「中文字体」只留真能排中文的族、「英文字体」筛掉图标字体。
 */
import { useSyncExternalStore } from "react";
import { rendererFonts } from "@/renderers/registry";
import type { FontFamily } from "@/renderers/types";

let list: FontFamily[] = [];
let state: "idle" | "loading" | "done" = "idle";
let inFlight: Promise<void> | null = null;
const subs = new Set<() => void>();

function emit() {
  for (const fn of subs) fn();
}

export function subscribeFonts(fn: () => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}

export function fontList(): FontFamily[] {
  return list;
}

export function fontsLoading(): boolean {
  return state === "loading";
}

/**
 * 只启动一次；重复调用复用同一次扫描（幂等）。
 * 上一次扫出空列表（渲染后端还没就绪）时允许再扫一次 —— 面板挂载时会再调一遍，
 * 否则「启动那一次没扫到」会让字体列表永远空着。
 */
export function ensureFonts(): Promise<void> {
  if (state === "loading") return inFlight ?? Promise.resolve();
  if (state === "done" && list.length > 0) return Promise.resolve();
  state = "loading";
  emit();
  inFlight = rendererFonts()
    .then((fonts) => {
      list = fonts;
    })
    .catch(() => {
      list = [];
    })
    .finally(() => {
      state = "done";
      inFlight = null;
      emit();
    });
  return inFlight;
}

/** 面板用：订阅字体列表（扫完自动刷新） */
export function useFontList(): { fonts: FontFamily[]; loading: boolean } {
  const fonts = useSyncExternalStore(subscribeFonts, fontList, fontList);
  const loading = useSyncExternalStore(subscribeFonts, fontsLoading, fontsLoading);
  return { fonts, loading };
}
