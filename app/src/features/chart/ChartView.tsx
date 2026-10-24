import { forwardRef, useEffect, useRef, type CSSProperties } from "react";
import type { BuildResult } from "../../core/types";
import { loadPlotly, type Plotly } from "./plotly";

interface Props {
  figure: BuildResult;
  static?: boolean;
  className?: string;
  style?: CSSProperties;
  resizeKey?: string | number;
}

// 统一的 Plotly 渲染视图：figure 变化即增量重绘。
// ⚠️ 库本身按需加载（见 ./plotly.ts）：matplotlib 案例根本不会碰到这 4.4 MB。
export const ChartView = forwardRef<HTMLDivElement, Props>(function ChartView(
  { figure, static: isStatic, className, style, resizeKey },
  externalRef,
) {
  const innerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const config = isStatic
      ? { staticPlot: true, displayModeBar: false, responsive: true }
      : {
          responsive: true,
          displayModeBar: false,
        };
    let alive = true;
    let loaded: Plotly | null = null;
    void loadPlotly().then((Plotly) => {
      if (!alive) return;
      loaded = Plotly;
      void Plotly.react(el, figure.data, figure.layout, config);
    });
    return () => {
      alive = false;
      if (loaded) loaded.purge(el);
    };
  }, [figure, isStatic, resizeKey]);

  const setRefs = (node: HTMLDivElement | null) => {
    innerRef.current = node;
    if (typeof externalRef === "function") externalRef(node);
    else if (externalRef) (externalRef as { current: HTMLDivElement | null }).current = node;
  };

  return <div ref={setRefs} className={className} style={style} />;
});
