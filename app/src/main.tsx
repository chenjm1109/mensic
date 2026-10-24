import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import { SoundProvider } from "./sound";
import { useStore } from "./store";
import { hasDesktopChrome } from "./platform";
import { installTouchMode } from "./core/touch-mode";
import "./styles.css";

/**
 * 启动顺序（**首屏优先**）：
 *   1. 先把界面挂上去（首页不需要任何异步数据）；
 *   2. 首帧画完之后再异步初始化存储 / 迁移 / 用户模板库（`store.init`）；
 *   3. 打点：`app:start → app:first-paint → app:ready`，桌面上冷启动时可直接量。
 *
 * ⚠️ 不要把 `init()` 挪到挂载之前：那会让首页等存储（Tauri 文件系统 / IndexedDB）就绪，
 *    白白多出几百毫秒到数秒的白屏（入口 chunk 那 5.4MB 的老问题已由路由懒加载解决）。
 *
 * ⚠️ 骨架（`data-app-ready`）要等**字体和首屏图**就位再撤：只在首帧就撤的话，
 *    用户会看到「字标先按系统字体画一遍、再跳成 ZhuoKai」以及图片后冒出来。
 */

performance.mark?.("app:start");

// 触摸 / 手写笔按下时给 <html> 打 data-touch，让 CSS 关掉悬停底色（触屏上会「粘住」）
installTouchMode();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SoundProvider>
      <App />
    </SoundProvider>
  </React.StrictMode>,
);

/**
 * 等首屏「看得见的东西」就位：
 * - **字体**：全站正文与字标都是 `ZhuoKai`（`font-display: swap`）。不等它就撤骨架，
 *   用户能明显看到字标从系统字体跳成手写体。
 * - **图片**：首屏的首页背景（两张 webp），不等它就撤骨架，底图会晚一步冒出来。
 *
 * ⚠️ 必须带超时兜底：字体 / 图片请求卡住时不能让启动页永远挂着（2.5s 后照常放行）。
 * ⚠️ 只等**当前已经挂在 DOM 里**的资源，不要改成「等所有网络请求」。
 */
async function waitForStartupAssets(): Promise<void> {
  const tasks: Promise<unknown>[] = [];

  if (typeof document.fonts?.ready?.then === "function") {
    // 显式点名：首屏字标用的就是这个族 + 这个字重
    void document.fonts.load('600 16px "ZhuoKai"').catch(() => {});
    tasks.push(document.fonts.ready);
  }

  for (const img of Array.from(document.images)) {
    if (img.complete) continue;
    tasks.push(img.decode().catch(() => {}));
  }

  const timeout = new Promise<void>((resolve) => window.setTimeout(resolve, 2500));
  await Promise.race([Promise.all(tasks), timeout]);
}

// 首帧之后：把骨架撤掉（桌面窗口此时才显示，见下面的 show()）并开始初始化
requestAnimationFrame(() => {
  performance.mark?.("app:first-paint");
  document.documentElement.setAttribute("data-app-painted", "1");
  window.dispatchEvent(new Event("mensic:first-paint"));

  // 字体 / 首屏图就位之后再撤骨架（淡出本身 240ms，见 index.html）
  void waitForStartupAssets()
    .catch(() => {})
    .then(() => {
      // 再等两帧：首页的尺寸（`fitScale` / 字标宽）是 ResizeObserver 量的，要晚一拍才落到真实值
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          document.documentElement.setAttribute("data-app-ready", "1");
          performance.mark?.("app:ready");
        }),
      );
    });
});

// 首帧之后再初始化存储：不阻塞第一屏
if (window.requestIdleCallback) {
  window.requestIdleCallback(() => void useStore.getState().init(), { timeout: 600 });
} else {
  window.setTimeout(() => void useStore.getState().init(), 0);
}

/**
 * 桌面端：窗口是 `visible:false` 创建的（避免看到白屏），首帧之后这里才把它显示出来。
 * ⚠️ 必须有兜底：万一首帧事件没来，也要让窗口出现，否则用户看到的是「启动了但没窗口」。
 */
if (hasDesktopChrome()) {
  const show = async () => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      await win.show();
      await win.setFocus();
      performance.mark?.("app:window-shown");
    } catch (e) {
      // ⚠️ 这里**必须出声**：曾经因为漏了 `core:window:allow-show` 权限，
      //    show() 抛错被静默吞掉，窗口就永远不出现（Rust 侧另有一层 2.5s 兜底）。
      console.error("[mensic] 显示窗口失败（检查 src-tauri/capabilities/default.json 的 core:window:allow-show）：", e);
    }
  };
  const onPainted = () => void show();
  window.addEventListener("mensic:first-paint", onPainted, { once: true });
  // 兜底：1.5s 内没收到首帧事件也显示（宁可显示白屏，也不能没有窗口）
  window.setTimeout(onPainted, 1500);
}
