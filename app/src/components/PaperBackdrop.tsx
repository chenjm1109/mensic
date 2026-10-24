/**
 * 统一纸张背景：白底 + 极浅纸纤维纹理。
 *
 * 撕边以前用 feDisplacementMap 实现（很贵），现在由 `components/ui/paper.tsx` 直接把毛边画成 SVG path
 * —— 全站一套画法，这里不再需要任何全局 SVG 定义。
 */

const FIBER =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='f'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23f)'/%3E%3C/svg%3E\")";

export function PaperBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 bg-surface">
      {/* 极浅纸纤维纹理（不用 mix-blend-mode，避免全屏合成开销） */}
      <div
        className="absolute inset-0"
        style={{ backgroundImage: FIBER, backgroundSize: "180px 180px", opacity: 0.05 }}
      />
    </div>
  );
}
