/**
 * Plotly 的**按需加载**入口。
 *
 * plotly.js-dist-min 有 4.4 MB，而绝大多数案例是 matplotlib 渲染的 —— 静态引入会让
 * 整个编辑器 chunk 变成 5 MB，进编辑器先解析几秒（安卓上尤其明显）。
 *
 * 所以这里只暴露一个 `loadPlotly()`：第一次真正需要画 3D 图 / 导出 / 取封面时才加载，
 * 之后复用同一个 Promise。**不要在任何模块顶层 `import Plotly`**（见 AGENTS 的分包要求）。
 */
type PlotlyModule = typeof import("plotly.js-dist-min");
export type Plotly = PlotlyModule["default"];

let pending: Promise<Plotly> | null = null;

export function loadPlotly(): Promise<Plotly> {
  if (!pending) {
    pending = import("plotly.js-dist-min").then((m) => m.default);
    // 加载失败不缓存：下次还能再试（例如离线首发）
    pending.catch(() => {
      pending = null;
    });
  }
  return pending;
}
