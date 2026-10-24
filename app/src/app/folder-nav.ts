/**
 * 文件夹退出的**唯一转交口**（给创作页以外的地方用）。
 *
 * 退场动效必须在创作页里播（要量卡片落点、等上一级画完），而标题栏面包屑、`useGoUp`
 * 这些入口在页面外面，拿不到 DOM 与动效状态 —— 它们把点击转交给页面：
 * 页面挂载时注册，卸载时自动注销；没有页面注册（例如从编辑器返回文件夹）就走原来的直接切换。
 */
let handler: (() => boolean) | null = null;

/** 页面挂载时注册；返回注销函数。`handler` 返回 false 表示「我没接手，你直接切」 */
export function registerFolderExit(handler_: () => boolean): () => void {
  handler = handler_;
  return () => {
    if (handler === handler_) handler = null;
  };
}

/** @returns true = 已交给创作页播放退场动效（调用方不要再 setScope） */
export function requestFolderExit(): boolean {
  return handler?.() === true;
}
