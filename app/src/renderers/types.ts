/**
 * 渲染后端契约。
 *
 * 所有后端（Pyodide / 本端原生 / 未来的云端）实现同一组操作，上层只依赖这里。
 * 关键点：渲染输入是**内容自包含**的（chart.py 源码 + tokens.yaml 源码 + 数据），
 * 不含任何 URL，因此后端不需要理解应用的资源协议，桌面/移动/云端都能复用同一份 spec。
 */

import type { TokensOverride } from "@/core/types";

export type RendererKind = "native" | "pyodide";

/** 渲染输入：内容自包含，任何后端都能执行 */
export interface CaseRenderSpec {
  /** 案例 chart.py 源码 */
  chartSource: string;
  /** design/tokens.yaml 源码 */
  tokensSource: string;
  theme: string;
  /** 项目级令牌覆盖（配色 / 字体）：并进 tokens 后案例代码无需改动 */
  tokensOverride?: TokensOverride;
  params: Record<string, unknown>;
  presentation: unknown;
  data: { columns: string[]; rows: unknown[][] } | null;
  /** 案例额外需要的 Python 包（如 scipy / scikit-learn） */
  requires?: string[];
}

/** 导出包输入 */
export interface PackageSpec {
  chartSource: string;
  tokensSource: string;
  theme: string;
  tokensOverride?: TokensOverride;
  params: Record<string, unknown>;
  presentation: unknown;
  dataCsv: string;
  title: string;
  requires?: string[];
}

/**
 * 一个可用的字体族，附带**实测的字形覆盖** —— 界面据此过滤「中文字体 / 英文字体」
 * 两个下拉框（探针与判定见 `renderer/render.py` 的 `font_list`）。
 */
export interface FontFamily {
  /** matplotlib 认的族名（渲染用，原样存进 tokens） */
  name: string;
  /** 给人看的名字：字体自带中文名就用中文（「宋体」），否则与 `name` 相同 */
  label?: string;
  /** 含常用简体汉字（日文 / 韩文字体只有部分字形，不算） */
  cjk: boolean;
  /** 含基本拉丁字母与数字（图标字体如 Wingdings 不算） */
  latin: boolean;
}

export interface PngResult {
  png: Uint8Array;
  ms: number;
}

export interface SvgResult {
  svg: string;
  ms: number;
}

/** 一个渲染后端 */
export interface Renderer {
  readonly id: RendererKind;
  /** 用于界面展示的名字 */
  readonly label: string;
  /** 渲染 PNG（配合 Blob URL 使用） */
  renderPng(spec: CaseRenderSpec): Promise<PngResult>;
  /** 按需渲染 SVG（导出时调用） */
  renderSvg(spec: CaseRenderSpec): Promise<SvgResult>;
  /** run.py 文本 */
  caseScript(spec: PackageSpec): Promise<string>;
  /** 可运行包（ZIP 二进制） */
  packageZip(spec: PackageSpec): Promise<Uint8Array>;
  /** 当前渲染环境可用的字体族（本端原生 = 整台机器；Pyodide = 只有随包字体） */
  listFonts(): Promise<FontFamily[]>;
  /** 后台预热（启动时调用，避免首次渲染等待） */
  warmup(): Promise<void>;
}
