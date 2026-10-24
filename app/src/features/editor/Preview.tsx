import { useEffect, useState, type RefObject } from "react";
import { motion } from "motion/react";
import type { BuildResult, Canvas } from "@/core/types";
import { cn } from "@/lib/utils";
import { ChartView } from "../chart/ChartView";
import { ZoomPane } from "./ZoomPane";
import { TYPO } from "@/core/typography";

interface Props {
  canvas: Canvas;
  /** matplotlib 渲染结果（PNG 对象 URL） */
  pngUrl?: string | null;
  /** Plotly（3D）figure */
  figure?: BuildResult | null;
  /** 还没有新图时先垫着的旧图 / 项目封面缩略图 */
  backfill?: string | null;
  busy?: boolean;
  error?: string | null;
  chartRef?: RefObject<HTMLDivElement>;
  /** 当前显示的 <img>：封面缩略图直接复用它，免得再解一遍整张 PNG */
  imgRef?: RefObject<HTMLImageElement>;
}

/**
 * 画布预览：缩放/滚动交互全部来自 ZoomPane（与「导出图片预览」同一套）。
 *
 * 渲染中的反馈**只有「模糊 + 呼吸」**：旧图（或项目封面）先垫在下面，
 * 模糊程度做一个缓慢的呼吸循环表示正在渲染；新图就位后 0.5s 内淡入（对焦）。
 * 全程**不出现文字、也不出现转圈之类的加载指示**。
 *
 * ⚠️ 呼吸**不是**逐帧动画 `filter: blur()`（安卓 WebView 上每帧都要重栅格化整张大图）：
 * 两层**静态**模糊（5px / 13px）叠在一起，只让上面那层的 `opacity` 呼吸 ——
 * 观感完全一致，代价从「每帧一次大图光栅化」降到「每张图一次」。
 */
export function Preview({ canvas, pngUrl, figure, backfill, busy, error, chartRef, imgRef }: Props) {
  const rendering = !!busy;
  // 旧图优先，其次项目封面；两者都没有时用纸底呼吸占位
  const fallback = pngUrl ?? backfill;
  const hasImage = !!fallback;

  /** 出图后的「对焦」结束（0.5s）→ 把下面两层模糊卸载，只留清晰那张 */
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (rendering || !hasImage) {
      setSettled(false);
      return;
    }
    const id = window.setTimeout(() => setSettled(true), 560);
    return () => window.clearTimeout(id);
  }, [rendering, hasImage, fallback]);

  return (
    <ZoomPane width={canvas.width} height={canvas.height}>
      <div className="absolute inset-0">
        {figure ? (
          <ChartView
            ref={chartRef}
            figure={figure}
            className="plot-host absolute inset-0"
            resizeKey={`${canvas.width}x${canvas.height}`}
          />
        ) : hasImage ? (
          <>
            {/* 底层：两层静态模糊（呼吸只动 opacity）。渲染中 + 对焦那 0.5s 才挂载 */}
            {(rendering || !settled) && (
              <div className="absolute inset-0" aria-hidden>
                <img
                  src={fallback as string}
                  alt=""
                  aria-hidden
                  className="preview-blur-soft absolute inset-0 h-full w-full object-contain"
                  draggable={false}
                />
                <img
                  src={fallback as string}
                  alt=""
                  aria-hidden
                  className="preview-blur-strong preview-breathe absolute inset-0 h-full w-full object-contain"
                  draggable={false}
                />
              </div>
            )}
            {/* 上层：清晰那张。渲染中隐藏（露出下面的模糊），出图后 0.5s 淡入 */}
            <img
              ref={imgRef}
              src={fallback as string}
              alt={t("预览")}
              className="absolute inset-0 h-full w-full object-contain"
              style={{
                opacity: rendering ? 0 : 1,
                transition: `opacity ${rendering ? 160 : 500}ms cubic-bezier(0.4, 0, 0.2, 1)`,
              }}
              draggable={false}
            />
          </>
        ) : (
          // 连封面都没有（新建项目首次渲染）：纸底 + 主题浅色的缓慢呼吸
          <div className="absolute inset-0 bg-surface-2">
            <motion.div
              className="absolute inset-0 bg-[var(--brand-soft)]"
              animate={{ opacity: [0.22, 0.55, 0.22] }}
              transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>
        )}
      </div>

      {/* 出错时才给文字（正常渲染不出现任何提示文字） */}
      {error && !rendering && (
        <div className={cn(TYPO.label, "absolute inset-0 grid place-items-center p-10 text-center leading-relaxed text-destructive")}>
          {error}
        </div>
      )}
    </ZoomPane>
  );
}
