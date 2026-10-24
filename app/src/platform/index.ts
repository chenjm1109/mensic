// 平台适配层：UI 不直接调用 Tauri / 浏览器 API，统一从这里走。
// 原型阶段使用浏览器下载/上传；接入 Tauri 后在此替换为原生对话框即可。

export function isTauri(): boolean {
  if (typeof window === "undefined") return false;
  return "__TAURI_INTERNALS__" in window || "__TAURI__" in window;
}

/** 移动端（Android / iOS）：没有原生「另存为」对话框 */
export function isMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/** iOS：目前只有 Pyodide 后端（Chaquopy 仅支持 Android） */
export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/** Android：系统返回手势、Chaquopy 渲染后端只在安卓上有 */
export function isAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent);
}

/**
 * 是否显示桌面窗口外壳（标题栏：面包屑 + 窗口按钮）。
 * 只有桌面 Tauri 需要；Web / Android / iOS 下标题栏为空白，回退改由页面内的返回按钮承担。
 */
export function hasDesktopChrome(): boolean {
  return isTauri() && !isMobile();
}

export function downloadText(filename: string, text: string, mime = "text/plain;charset=utf-8"): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadDataUrl(filename: string, dataUrl: string): void {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  downloadDataUrl(filename, url);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function mimeForExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case "png":
      return "image/png";
    case "svg":
      return "image/svg+xml";
    case "csv":
      return "text/csv;charset=utf-8";
    case "zip":
    case "mensic":
      return "application/zip";
    case "json":
      return "application/json;charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

async function toBytes(data: Blob | ArrayBuffer | Uint8Array | string): Promise<Uint8Array> {
  if (typeof data === "string") return new TextEncoder().encode(data);
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return new Uint8Array(await data.arrayBuffer());
}

/**
 * 保存文件：
 * - 桌面端：弹原生「另存为」对话框并写入；
 * - 移动端（Android）：**交给系统分享面板**（写到应用缓存 → ACTION_SEND，用户可存到「文件」/
 *   相册 / 发微信等）。Android 没有「另存为」对话框，这是系统提供的标准出口；
 *   失败会抛错，调用方负责提示（不要再静默吞掉）；
 * - Web 端：回退为浏览器下载。
 * 返回是否成功（用户取消返回 false）。
 */
export async function saveFileAs(
  filename: string,
  data: Blob | ArrayBuffer | Uint8Array | string,
  filters?: { name: string; extensions: string[] }[],
): Promise<boolean> {
  const ext = filename.includes(".") ? filename.split(".").pop()! : "";
  if (isTauri() && isMobile()) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("share_file", { name: filename, mime: mimeForExt(ext), bytes: await toBytes(data) });
    return true;
  }
  if (isTauri()) {
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const { invoke } = await import("@tauri-apps/api/core");
      const path = await save({
        defaultPath: filename,
        filters: filters ?? [{ name: ext ? ext.toUpperCase() : "文件", extensions: ext ? [ext] : ["*"] }],
      });
      if (!path) return false;
      const bytes = await toBytes(data);
      await invoke("write_file", { path, contents: bytes });
      return true;
    } catch (e) {
      console.warn("[mensic] 另存为失败：", e);
      return false;
    }
  }
  // Web 回退
  if (typeof data === "string") downloadText(filename, data, mimeForExt(ext));
  else if (data instanceof Blob) downloadBlob(filename, data);
  else downloadBlob(filename, new Blob([data as unknown as BlobPart], { type: mimeForExt(ext) }));
  return true;
}

export interface PickedFile {
  name: string;
  text: string;
}

export function pickTextFile(accept = ".csv,.json,.txt"): Promise<PickedFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const text = await file.text();
      resolve({ name: file.name, text });
    };
    input.click();
  });
}

export function bytesToDataUrl(mime: string, base64: string): string {
  return `data:${mime};base64,${base64}`;
}
