// Pyodide 渲染后端：在 Web Worker 中运行 CPython + matplotlib。
// 这是 Web / 移动端的通用后端；桌面端在可用时会优先走本端原生（见 renderers/registry.ts）。
import { parseFontList } from "@/renderers/fonts";
import type { CaseRenderSpec, FontFamily, PackageSpec, PngResult, Renderer, SvgResult } from "@/renderers/types";

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
let chain: Promise<unknown> = Promise.resolve();

function ensureWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./render.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (ev: MessageEvent) => {
    const { id, error, ...rest } = ev.data as { id: number; error?: string };
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    if (error) p.reject(new Error(error));
    else p.resolve(rest);
  };
  worker.onerror = (e) => {
    for (const p of pending.values()) p.reject(new Error(e.message || "pyodide worker error"));
    pending.clear();
    worker = null;
  };
  return worker;
}

function call<T>(type: string, spec?: unknown): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    ensureWorker().postMessage({ id, type, spec });
  });
}

/** 串行化：Pyodide 单线程，请求排队执行 */
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => {});
  return next;
}

/** 初始化（并预热）Pyodide：加载运行时、渲染模块，并跑一次 warmup */
export function initPyodide(): Promise<{ ms: number; ready: boolean }> {
  return serial(() => call<{ ms: number; ready: boolean }>("init"));
}

export const pyodideRenderer: Renderer = {
  id: "pyodide",
  label: "Pyodide",
  renderPng(spec: CaseRenderSpec): Promise<PngResult> {
    return serial(() => call<PngResult>("renderCase", spec));
  },
  renderSvg(spec: CaseRenderSpec): Promise<SvgResult> {
    return serial(() => call<SvgResult>("renderCaseSvg", spec));
  },
  caseScript(spec: PackageSpec): Promise<string> {
    return serial(() => call<{ script: string }>("caseScript", spec)).then((r) => r.script);
  },
  packageZip(spec: PackageSpec): Promise<Uint8Array> {
    return serial(() => call<{ zip: Uint8Array }>("packageCase", spec)).then((r) => r.zip);
  },
  listFonts(): Promise<FontFamily[]> {
    return serial(() => call<{ fonts: unknown }>("fontList")).then((r) => parseFontList(r.fonts));
  },
  async warmup() {
    await initPyodide();
  },
};
