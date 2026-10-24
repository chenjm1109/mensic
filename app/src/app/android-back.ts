/**
 * 安卓系统返回（含全面屏边缘滑动）的唯一入口。
 *
 * 为什么这样接：Tauri 的 `TauriActivity.handleBackNavigation = false`，但它自带的
 * `AppPlugin.kt` 里挂了一个 `OnBackPressedCallback` —— **有 JS 监听 `back-button` 时**
 * 只往 JS 发事件、不再关 Activity；没人监听才会 `activity.onBackPressed()`（也就是退出到桌面）。
 * 所以这里注册一次监听就把默认行为接管了，Kotlin 侧一行都不用改。
 *
 * 规则：
 * 1. 有弹层（弹窗 / 下拉 / 气泡 / 选择器）→ 先关最上层那个，页面不动；
 * 2. 非首页 → 与左上角返回按钮**完全相同**的路径（`goUpOf`，与 `useGoUp` 同一份判断）；
 * 3. 首页 → 第一次提示「再按一次退出应用」，2 秒内再按才真正退出（`finishAffinity`）。
 *
 * ⚠️ 不要改成在 `MainActivity` 里覆写 `onBackPressed`：`gen/android` 是生成物，
 *    重跑 `tauri android init` 会把改动冲掉，而且 Android 13+ 的预测性返回也不认它。
 */
import { notify } from "@/components/ui/toast";
import { isAndroid, isTauri } from "@/platform";
import { useStore } from "@/store";
import { goUpOf, type GoUpInput } from "./nav";

/** 首页「连按两次退出」的时间窗（毫秒） */
const EXIT_WINDOW = 2000;

/**
 * Radix 的弹层内容都带 `data-slot`；只认 `data-state="open"` 的，
 * 免得退场动画还没播完时（节点仍在 DOM 里）把下一次返回吃掉。
 */
const OVERLAY_SELECTOR = [
  '[data-slot="dialog-content"]',
  '[data-slot="dropdown-menu-content"]',
  '[data-slot="popover-content"]',
  '[data-slot="select-content"]',
]
  .map((s) => `${s}[data-state="open"]`)
  .join(",");

/**
 * 关掉最上层弹层，返回是否关掉了。
 *
 * 不在应用里自己记「谁开着」：Radix 的 dismissable layer 在 document 上监听 Escape，
 * 并且**只有栈顶那层**会响应 —— 派发一次键盘事件既能关对层，也不会把嵌套弹层一起关掉。
 */
function closeTopOverlay(): boolean {
  if (!document.querySelector(OVERLAY_SELECTOR)) return false;
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
  );
  return true;
}

/** 从当前 store 快照算出「上一级」（与 useGoUp 共用同一份规则） */
function currentGoUp() {
  const s = useStore.getState();
  const input: GoUpInput = {
    page: s.page,
    galleryCaseId: s.galleryCaseId,
    scope: s.scope,
    folders: s.index.folders,
    folderId: s.current?.folderId ?? null,
    settingsReturnTo: s.settingsReturnTo,
    galleryReturnTo: s.galleryReturnTo,
    actions: s,
  };
  return goUpOf(input);
}

/** 首页上「连按两次退出」的上一次按下时间；离开首页就清零 */
let lastHomeBackAt = 0;

/**
 * 安装返回手势处理；返回反注册函数。
 *
 * 只在 Android + Tauri 下生效（桌面 / 网页不注册，也没有这个事件）。
 * 注册失败时只告警，系统会退回原来的默认行为（直接退出），不会把返回彻底锁死。
 */
export function installAndroidBack(): () => void {
  if (!isTauri() || !isAndroid()) return () => {};

  let disposed = false;
  let unlisten: { unregister: () => Promise<void> } | null = null;

  void (async () => {
    const { onBackButtonPress, exit } = await import("@tauri-apps/api/app");
    const listener = await onBackButtonPress(() => {
      // 1) 弹层优先：返回只关最上面那层，不带着底下页面一起跳
      if (closeTopOverlay()) {
        lastHomeBackAt = 0;
        return;
      }
      // 2) 非首页：等价于左上角返回
      const goUp = currentGoUp();
      if (goUp) {
        lastHomeBackAt = 0;
        goUp.go();
        return;
      }
      // 3) 首页：两次退出
      const now = Date.now();
      if (now - lastHomeBackAt <= EXIT_WINDOW) {
        lastHomeBackAt = 0;
        void exit(0).catch((e) => console.warn("[mensic] 退出应用失败：", e));
        return;
      }
      lastHomeBackAt = now;
      notify(t("再按一次退出应用"), { tone: "info", duration: EXIT_WINDOW });
    });

    // StrictMode / 热更新下可能「注册还没回来就已经卸载」：补一次反注册
    if (disposed) void listener.unregister();
    else unlisten = listener;
  })().catch((e) => {
    console.warn("[mensic] 安卓返回手势注册失败，将退回系统默认行为（直接退出）：", e);
  });

  return () => {
    disposed = true;
    if (unlisten) void unlisten.unregister();
  };
}
