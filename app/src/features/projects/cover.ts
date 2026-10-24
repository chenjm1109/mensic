// 项目封面：把渲染结果缩小成 ≤480px 的 PNG，作为项目卡片的实时缩略图。
import { loadPlotly } from "@/features/chart/plotly";

/** 把一张**已经解码好**的图缩放成封面（不再二次解码 PNG：预览里那张图早就解码过了） */
export function captureFromImage(img: HTMLImageElement, maxW = 480): Promise<Blob | null> {
  const w0 = img.naturalWidth;
  const h0 = img.naturalHeight;
  if (!w0 || !h0) return Promise.resolve(null);
  const scale = Math.min(1, maxW / w0);
  const w = Math.max(1, Math.round(w0 * scale));
  const h = Math.max(1, Math.round(h0 * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.drawImage(img, 0, 0, w, h);
  return new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), "image/png"));
}

/** 从图片对象 URL 缩放导出（matplotlib PNG；调用方手上没有 <img> 元素时用） */
export async function captureFromImageUrl(url: string, maxW = 480): Promise<Blob | null> {
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch {
    /* 某些环境 decode 不可用，退回 onload */
    await new Promise<void>((res) => {
      img.onload = () => res();
      img.onerror = () => res();
    });
  }
  return captureFromImage(img, maxW);
}

/** 从 DOM 元素导出（Plotly） */
export async function captureFromElement(el: HTMLElement, maxW = 480): Promise<Blob | null> {
  const Plotly = await loadPlotly();
  const dataUrl = await Plotly.toImage(el, {
    format: "png",
    width: maxW,
    height: Math.max(1, Math.round(maxW * 0.7)),
  });
  const res = await fetch(dataUrl);
  return await res.blob();
}
