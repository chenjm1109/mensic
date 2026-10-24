/**
 * 剪贴板：**优先走原生**（Tauri 的 clipboard-manager 插件），浏览器里才退回 `navigator.clipboard`。
 *
 * 为什么必须这么做：`navigator.clipboard.readText()` 会弹一个**浏览器样式的权限气泡**
 * （「允许读取剪贴板？」），在桌面应用里非常出戏。走原生插件则不经过 WebView 的权限那套，
 * 用户点一下就直接成功。
 */
import { isTauri } from "@/platform";

/** 桌面端才有的原生实现（动态 import：Web 构建里不会把它打进首屏） */
async function nativeClipboard() {
  if (!isTauri()) return null;
  try {
    return await import("@tauri-apps/plugin-clipboard-manager");
  } catch {
    return null;
  }
}

export async function writeClipboardText(text: string): Promise<void> {
  const native = await nativeClipboard();
  if (native) return native.writeText(text);
  await navigator.clipboard.writeText(text);
}

export async function readClipboardText(): Promise<string> {
  const native = await nativeClipboard();
  if (native) return native.readText();
  return navigator.clipboard.readText();
}
