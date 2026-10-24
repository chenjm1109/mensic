// 渲染后端注册表：运行期挑选可用的后端，并支持自动降级。
//
// 选择顺序：本端原生（Tauri 桌面，sidecar）→ Pyodide（Web / 移动端）。
// 降级分两类：
//   1) 能力不足：某案例需要本端未随包的依赖（如 scipy）→ 该次改用 Pyodide（按需安装）。
//   2) 调用失败：本端原生真的出错 → 本次会话永久改用 Pyodide，保证应用仍然可用。
import { pyodideRenderer } from "@/pyodide/client";
import { RenderError, isNativeSupported, nativeInfo, nativeRenderer } from "./native";
import type { CaseRenderSpec, FontFamily, PackageSpec, PngResult, Renderer, RendererKind, SvgResult } from "./types";

export type RendererStage = "idle" | "warming" | "ready" | "error";

let warmupMs = 0;

let active: Renderer | null = null;
let pick: Promise<Renderer> | null = null;
let demoted = false;
let nativePackages: Set<string> | null = null;
let nativeDetail = "";

let stage: RendererStage = "idle";
const stageListeners = new Set<() => void>();

function setStage(next: RendererStage) {
  if (stage === next) return;
  stage = next;
  for (const fn of stageListeners) fn();
}

export function rendererStage(): RendererStage {
  return stage;
}

export function subscribeRendererStage(fn: () => void): () => void {
  stageListeners.add(fn);
  return () => stageListeners.delete(fn);
}

/** 当前实际使用的后端（未挑选时为 null） */
export function activeRenderer(): Renderer | null {
  return active;
}

export function activeRendererKind(): RendererKind | null {
  return active?.id ?? null;
}

/** 用于界面展示：如「本端原生 · CPython 3.12.9」/「Pyodide」 */
export function activeRendererLabel(): string {
  if (!active) return "…";
  if (active.id === "native" && nativeDetail) return `${active.label} · ${nativeDetail}`;
  return active.label;
}

async function choose(): Promise<Renderer> {
  if (isNativeSupported()) {
    try {
      const info = await nativeInfo();
      nativePackages = new Set(info.packages ?? []);
      nativeDetail = `CPython ${info.python} · matplotlib ${info.matplotlib}`;
      active = nativeRenderer;
      return nativeRenderer;
    } catch (e) {
      console.warn("[mensic] 本端原生渲染器不可用，回退到 Pyodide：", e);
    }
  }
  active = pyodideRenderer;
  return pyodideRenderer;
}

/** 挑选后端（只探一次，结果缓存） */
export function pickRenderer(): Promise<Renderer> {
  if (!pick) pick = choose();
  return pick;
}

async function current(): Promise<Renderer> {
  return active ?? (await pickRenderer());
}

/** 本端原生是否具备该案例所需的额外依赖（Pyodide 按需安装，恒为支持） */
function nativeSupports(requires?: string[]): boolean {
  if (!nativePackages) return true;
  return (requires ?? []).every((r) => nativePackages!.has(r));
}

/** 原生后端是否可用于这次请求 */
function useNative(r: Renderer, requires?: string[]): boolean {
  return r.id === "native" && !demoted && nativeSupports(requires);
}

function demote(err: unknown): Renderer {
  if (!demoted) {
    demoted = true;
    console.warn("[mensic] 本端原生渲染失败，本次会话改用 Pyodide：", err);
  }
  active = pyodideRenderer;
  pick = Promise.resolve(pyodideRenderer);
  return pyodideRenderer;
}

/**
 * 统一路由：优先本端原生，按需降级。
 * - 需要本端未随包的依赖 → 直接用 Pyodide
 * - 本端报「业务错误」（用户数据/参数问题）→ 原样抛出，不降级（避免白等一次运行时准备）
 * - 本端报「不可用类错误」→ 降级到 Pyodide 重试一次
 */
async function route<T>(requires: string[] | undefined, call: (r: Renderer) => Promise<T>): Promise<T> {
  const r = await current();
  if (!useNative(r, requires)) return call(pyodideRenderer);
  try {
    return await call(r);
  } catch (e) {
    if (e instanceof RenderError) throw e;
    return call(demote(e));
  }
}

/**
 * 后端调用的**全局串行队列**。
 *
 * 为什么每一端都要排队：Python 侧（matplotlib / pyplot / rcParams）全是进程级单例，
 * 两个调用并发只会互相踩。Pyodide 本来就把请求排进 worker；安卓的进程内 CPython
 * （Chaquopy）原先**没有任何串行**，字体扫描、出图、导出可以同时在跑 —— 抢 GIL、
 * 还可能读到一半被另一个调用改掉 rcParams。
 */
let chain: Promise<unknown> = Promise.resolve();

function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => {});
  return next;
}

export function rendererPng(spec: CaseRenderSpec): Promise<PngResult> {
  return serial(() => route(spec.requires, (r) => r.renderPng(spec)));
}

export function rendererSvg(spec: CaseRenderSpec): Promise<SvgResult> {
  return serial(() => route(spec.requires, (r) => r.renderSvg(spec)));
}

export function rendererScript(spec: PackageSpec): Promise<string> {
  return serial(() => route(spec.requires, (r) => r.caseScript(spec)));
}

export function rendererZip(spec: PackageSpec): Promise<Uint8Array> {
  return serial(() => route(spec.requires, (r) => r.packageZip(spec)));
}

/**
 * 列出当前渲染环境可用的字体族（含实测的字形覆盖，供界面过滤中英两个下拉框）。
 * 桌面（本端原生）能列出整台机器的字体；Pyodide 只有随包字体。
 */
export async function rendererFonts(): Promise<FontFamily[]> {
  return serial(async () => {
    const r = await current();
    try {
      return await r.listFonts();
    } catch (e) {
      console.warn("[mensic] 读取字体列表失败：", e);
      return [];
    }
  });
}

let warming = false;
/**
 * 后台预热当前后端（启动后空闲时调用）。
 * - 本端原生：拉起 sidecar 进程并等它就绪
 * - Pyodide：加载运行时 + 渲染模块
 */
export function warmupRenderer(): void {
  if (warming || stage === "ready") return;
  warming = true;
  const t0 = performance.now();
  setStage("warming");
  void pickRenderer()
    .then((r) => serial(() => r.warmup()))
    .then(() => {
      warmupMs = Math.round(performance.now() - t0);
      setStage("ready");
    })
    .catch((e) => {
      console.warn("[mensic] 渲染器预热失败：", e);
      setStage("error");
    });
}

/** 预热耗时（毫秒），用于界面上说明「首次准备」的成本 */
export function warmupDuration(): number {
  return warmupMs;
}
