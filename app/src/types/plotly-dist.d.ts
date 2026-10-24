declare module "plotly.js-dist-min" {
  const Plotly: {
    react: (
      el: HTMLElement,
      data: unknown[],
      layout?: Record<string, unknown>,
      config?: Record<string, unknown>,
    ) => Promise<unknown>;
    newPlot: (
      el: HTMLElement,
      data: unknown[],
      layout?: Record<string, unknown>,
      config?: Record<string, unknown>,
    ) => Promise<unknown>;
    purge: (el: HTMLElement) => void;
    toImage: (
      el: HTMLElement,
      opts: { format: string; width?: number; height?: number; scale?: number },
    ) => Promise<string>;
    relayout: (el: HTMLElement, update: Record<string, unknown>) => Promise<unknown>;
  };
  export default Plotly;
}
