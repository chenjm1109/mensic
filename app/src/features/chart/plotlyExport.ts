import type { BuildResult, Canvas } from "@/core/types";
import { loadPlotly } from "./plotly";

/**
 * 导出 Plotly（3D）图。
 *
 * 3D 图是 Plotly（WebGL）在界面里画的，不走 Python 渲染器，所以只能让 Plotly 自己导出。
 * 这里**离屏新建一份**再导出，而不是抓界面上那块 DOM：用户可能正停在「数据表格」标签页，
 * 那时预览已经卸载了，抓不到元素。
 *
 * `Plotly.toImage` 返回 data URL —— SVG 是 URL 编码的文本，PNG 是 base64。
 * ⚠️ Plotly 按需加载（见 ./plotly.ts）：只在真的导出 3D 图时才付这 4.4 MB 的代价。
 */
async function offscreenImage(figure: BuildResult, canvas: Canvas, format: "svg" | "png"): Promise<string> {
  const Plotly = await loadPlotly();
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-20000px;top:0;width:${canvas.width}px;height:${canvas.height}px`;
  document.body.appendChild(host);
  try {
    await Plotly.newPlot(host, figure.data, figure.layout, { staticPlot: true, displayModeBar: false });
    return await Plotly.toImage(host, { format, width: canvas.width, height: canvas.height });
  } finally {
    Plotly.purge(host);
    host.remove();
  }
}

/** 导出 SVG 文本（3D 的 WebGL 图层会被 Plotly 栅格化后嵌进 SVG） */
export async function plotlySvg(figure: BuildResult, canvas: Canvas): Promise<string> {
  const url = await offscreenImage(figure, canvas, "svg");
  const comma = url.indexOf(",");
  const meta = url.slice(0, comma);
  const body = url.slice(comma + 1);
  return meta.includes("base64") ? atob(body) : decodeURIComponent(body);
}

/** 导出 PNG（返回 data URL，可直接给 <img> 或下载） */
export function plotlyPng(figure: BuildResult, canvas: Canvas): Promise<string> {
  return offscreenImage(figure, canvas, "png");
}
