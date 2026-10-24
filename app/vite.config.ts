import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

/**
 * ⚠️ 分包策略：**首屏 chunk 里绝对不能出现 plotly / pyodide / glide-data-grid**。
 * plotly 一个就 4.4 MB，进了入口 chunk 就是「冷启动白屏十几秒」。
 *
 * 实测结论：**不要用 manualChunks 手动命名这些库**。Rollup 会把「被命名的共享 chunk」
 * 提升成首屏预加载 —— 试过命名 plotly / glide（vendor-plotly / vendor-grid），
 * index.html 里立刻多出对应的 modulepreload，把 4,565KB / 442KB 又拉回首屏。
 * 正确做法是**路由级懒加载**：库自然落进「用到它的那个页面 chunk」。
 * `scripts/check-bundle-split.mjs` 守住这条线。
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**", "**/.renderer-venv/**", "**/build/**", "**/docs/**", "**/apk/**", "**/.check-tmp/**"] },
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "es2020",
    sourcemap: false,
  },
});
