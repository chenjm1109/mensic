// 本端原生渲染后端（Tauri）：
// - 桌面：随包 Python sidecar（原生 CPython + matplotlib），无 wasm 开销、进程常驻；
// - Android：进程内 Chaquopy CPython（Rust 经 JNI 调 Kotlin），同一套命令与协议；
// - iOS：暂无（Chaquopy 只支持 Android），由 registry 回落到 Pyodide。
import { invoke } from "@tauri-apps/api/core";
import { isIOS, isTauri } from "@/platform";
import { parseFontList } from "./fonts";
import type { CaseRenderSpec, FontFamily, PackageSpec, PngResult, Renderer, SvgResult } from "./types";

export interface NativeInfo {
  /** 由 sidecar 上报，用于界面展示与排障 */
  python: string;
  matplotlib: string;
  version: string;
  /** 随包可用的 Python 包（用于判断某案例能否走本端原生） */
  packages: string[];
}

export function isNativeSupported(): boolean {
  return isTauri() && !isIOS();
}

/** 探测本端原生渲染器是否可用（会拉起 sidecar 进程，结果由 registry 缓存） */
export async function nativeInfo(): Promise<NativeInfo> {
  return await invoke<NativeInfo>("renderer_info");
}

/** 渲染器返回的业务错误（用户数据/参数问题），不代表后端不可用 */
export class RenderError extends Error {
  readonly isRenderError = true;
}

function toError(e: unknown): Error {
  const raw = e instanceof Error ? e.message : String(e);
  if (raw.startsWith("RENDER_ERROR:")) {
    return new RenderError(raw.slice("RENDER_ERROR:".length));
  }
  return e instanceof Error ? e : new Error(raw);
}

async function callBinary(op: string, spec: unknown): Promise<Uint8Array> {
  try {
    const res = await invoke<ArrayBuffer | Uint8Array>("renderer_call", { op, spec });
    return res instanceof Uint8Array ? res : new Uint8Array(res);
  } catch (e) {
    throw toError(e);
  }
}

async function callText(op: string, spec: unknown): Promise<string> {
  try {
    return await invoke<string>("renderer_call_text", { op, spec });
  } catch (e) {
    throw toError(e);
  }
}

export const nativeRenderer: Renderer = {
  id: "native",
  label: "本端原生",
  async renderPng(spec: CaseRenderSpec): Promise<PngResult> {
    const t0 = performance.now();
    const png = await callBinary("render_png", spec);
    return { png, ms: performance.now() - t0 };
  },
  async renderSvg(spec: CaseRenderSpec): Promise<SvgResult> {
    const t0 = performance.now();
    const bytes = await callBinary("render_svg", spec);
    return { svg: new TextDecoder().decode(bytes), ms: performance.now() - t0 };
  },
  caseScript(spec: PackageSpec): Promise<string> {
    return callText("case_script", spec);
  },
  packageZip(spec: PackageSpec): Promise<Uint8Array> {
    return callBinary("package_zip", spec);
  },
  async listFonts(): Promise<FontFamily[]> {
    return parseFontList(await callText("list_fonts", {}));
  },
  async warmup() {
    await callText("ping", null);
  },
};
