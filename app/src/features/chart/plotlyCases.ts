import type { BuildResult, CaseProject, DataSet } from "@/core/types";
import type { GalleryCase } from "@/gallery";

/**
 * Plotly 3D 案例的**动态**构造器。
 *
 * 之前 3D 案例是构建期跑一遍 Python 生成的静态 spec：参数栏里的值改了也不会重绘，
 * 图形元素更无从谈起。这里把 8 个 3D 实现的 `create_chart` 逐行搬到前端，用同一份
 * 数据 + 参数 + 元素覆盖重建 figure；静态 spec 只当主题模板（layout / colorscale）用。
 *
 * 元素分组都是 `none`（3D 图没有 series 分组），key = `"*"`。
 * 颜色是数值映射（surface3d 色带），所以这些元素在 meta 里都声明为 `color: false`，
 * 只开放大小 / 透明度。
 */

type Trace = Record<string, any>;

const DEFAULT_SURFACE3D = ["#2f648e", "#e9d1ab", "#c3476a"];

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function bool(v: unknown): boolean {
  return v === true || v === "true";
}

function styleOf(project: CaseProject, key: string): Record<string, any> {
  return project.elements?.[key]?.["*"] ?? {};
}

function colorscaleOf(base: BuildResult): unknown {
  const first = base.data?.[0] as Trace | undefined;
  const scale = first?.colorscale;
  if (scale) return scale;
  return DEFAULT_SURFACE3D.map((c, i, all) => [i / (all.length - 1), c]);
}

function column(data: DataSet, name: string): number[] {
  const i = data.columns.indexOf(name);
  if (i < 0) return [];
  return data.rows.map((r) => Number(r[i])).filter((v) => Number.isFinite(v));
}

/** 长表 (x, y, z) → 规整网格（与 Python 的 pivot + sort 等价） */
function pivot(xs: number[], ys: number[], zs: number[]) {
  const ux = [...new Set(xs)].sort((a, b) => a - b);
  const uy = [...new Set(ys)].sort((a, b) => a - b);
  const map = new Map<string, number>();
  for (let i = 0; i < xs.length; i++) map.set(`${xs[i]}\u0000${ys[i]}`, zs[i]);
  const z = uy.map((y) => ux.map((x) => map.get(`${x}\u0000${y}`) ?? 0));
  return { ux, uy, z };
}

const _FACES = [
  [0, 1, 2], [0, 2, 3],
  [4, 5, 6], [4, 6, 7],
  [0, 1, 5], [0, 5, 4],
  [3, 2, 6], [3, 6, 7],
  [0, 3, 7], [0, 7, 4],
  [1, 2, 6], [1, 6, 5],
];
const _EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 0],
  [4, 5], [5, 6], [6, 7], [7, 4],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

/** 3D 柱体：把每个立方体的 8 个顶点合并进一个 Mesh3d */
function build3dBar(base: BuildResult, data: DataSet, project: CaseProject): BuildResult {
  const xs = column(data, "x");
  const ys = column(data, "y");
  const hs = column(data, "height");
  const style = styleOf(project, "bar");
  const barSize = num(style.size, num(project.params.bar_size, 0.15));
  const opacity = num(style.opacity, num(project.params.bar_opacity, 1));
  const showEdges = bool(project.params.show_edges ?? true);
  const half = barSize / 2;
  const zmin = Math.min(...hs);
  const zmax = Math.max(...hs);
  const span = zmax - zmin;

  const vx: number[] = [];
  const vy: number[] = [];
  const vz: number[] = [];
  const intensity: number[] = [];
  const vi: number[] = [];
  const vj: number[] = [];
  const vk: number[] = [];
  const edgeX: (number | null)[] = [];
  const edgeY: (number | null)[] = [];
  const edgeZ: (number | null)[] = [];
  let offset = 0;

  for (let i = 0; i < xs.length; i++) {
    const x = xs[i];
    const y = ys[i];
    const h = hs[i];
    const corners: [number, number, number][] = [
      [x - half, y - half, 0], [x + half, y - half, 0],
      [x + half, y + half, 0], [x - half, y + half, 0],
      [x - half, y - half, h], [x + half, y - half, h],
      [x + half, y + half, h], [x - half, y + half, h],
    ];
    const value = span > 0 ? (h - zmin) / span : 0;
    for (const [cx, cy, cz] of corners) {
      vx.push(cx);
      vy.push(cy);
      vz.push(cz);
      intensity.push(value);
    }
    for (const [a, b, c] of _FACES) {
      vi.push(offset + a);
      vj.push(offset + b);
      vk.push(offset + c);
    }
    for (const [a, b] of _EDGES) {
      edgeX.push(corners[a][0], corners[b][0], null);
      edgeY.push(corners[a][1], corners[b][1], null);
      edgeZ.push(corners[a][2], corners[b][2], null);
    }
    offset += 8;
  }

  const baseMesh = (base.data[0] ?? {}) as Trace;
  const trace: Trace = {
    ...baseMesh,
    x: vx,
    y: vy,
    z: vz,
    i: vi,
    j: vj,
    k: vk,
    intensity,
    colorscale: colorscaleOf(base),
    opacity,
    showscale: false,
    flatshading: true,
    hoverinfo: "skip",
    name: "高度",
  };
  const traces: Trace[] = [trace];
  if (showEdges) {
    const baseEdge = (base.data[1] ?? {}) as Trace;
    traces.push({
      ...baseEdge,
      x: edgeX,
      y: edgeY,
      z: edgeZ,
      mode: "lines",
      line: { ...(baseEdge.line as Trace | undefined), color: "white", width: 3 },
      hoverinfo: "skip",
      showlegend: false,
    });
  }
  return { data: traces, layout: base.layout };
}

function build3dBubble(base: BuildResult, data: DataSet, project: CaseProject): BuildResult {
  const style = styleOf(project, "point");
  const scale = num(style.size, num(project.params.size_scale, 1));
  const opacity = num(style.opacity, num(project.params.opacity, 0.7));
  const z = column(data, "z");
  const baseTrace = (base.data[0] ?? {}) as Trace;
  const marker = { ...(baseTrace.marker as Trace | undefined) };
  return {
    data: [{
      ...baseTrace,
      x: column(data, "x"),
      y: column(data, "y"),
      z,
      mode: "markers",
      marker: {
        ...marker,
        size: column(data, "size").map((v) => v * scale),
        opacity,
        color: z,
        colorscale: colorscaleOf(base),
        colorbar: marker.colorbar ?? { title: "Z 值" },
      },
      name: "气泡",
    }],
    layout: base.layout,
  };
}

function build3dCone(base: BuildResult, data: DataSet, project: CaseProject): BuildResult {
  const style = styleOf(project, "cone");
  const sizeref = num(style.size, num(project.params.sizeref, 60));
  const opacity = num(style.opacity, num(project.params.opacity, 1));
  const showScale = bool(project.params.show_scale ?? true);
  const baseTrace = (base.data[0] ?? {}) as Trace;
  return {
    data: [{
      ...baseTrace,
      x: column(data, "x"),
      y: column(data, "y"),
      z: column(data, "z"),
      u: column(data, "u"),
      v: column(data, "v"),
      w: column(data, "w"),
      colorscale: colorscaleOf(base),
      sizemode: "absolute",
      sizeref,
      opacity,
      showscale: showScale,
    }],
    layout: base.layout,
  };
}

function build3dContour(base: BuildResult, data: DataSet, project: CaseProject): BuildResult {
  const style = styleOf(project, "contour");
  const numLevels = Math.max(1, Math.round(num(project.params.num_levels, 20)));
  const lineWidth = num(style.size, num(project.params.line_width, 4));
  const opacity = num(style.opacity, num(project.params.opacity, 1));
  const { ux, uy, z } = pivot(column(data, "x"), column(data, "y"), column(data, "z"));
  const zmin = Math.min(...z.flat());
  const zmax = Math.max(...z.flat());
  const step = (zmax - zmin) / numLevels;
  const baseTrace = (base.data[0] ?? {}) as Trace;
  return {
    data: [{
      ...baseTrace,
      x: ux,
      y: uy,
      z,
      colorscale: colorscaleOf(base),
      hidesurface: true,
      showscale: false,
      opacity,
      contours: {
        z: { show: true, usecolormap: true, width: lineWidth, start: zmin, end: zmax, size: step },
      },
    }],
    layout: base.layout,
  };
}

function build3dIsosurface(base: BuildResult, data: DataSet, project: CaseProject): BuildResult {
  const style = styleOf(project, "surface");
  const isomin = num(project.params.isomin, 10);
  const isomax = num(project.params.isomax, 50);
  const surfaceCount = Math.max(2, Math.round(num(style.size, num(project.params.surface_count, 5))));
  const opacity = num(style.opacity, num(project.params.opacity, 1));
  const baseTrace = (base.data[0] ?? {}) as Trace;
  return {
    data: [{
      ...baseTrace,
      x: column(data, "x"),
      y: column(data, "y"),
      z: column(data, "z"),
      value: column(data, "value"),
      isomin,
      isomax,
      colorscale: colorscaleOf(base),
      surface_count: surfaceCount,
      opacity,
      colorbar_nticks: 5,
      caps: { x_show: false, y_show: false },
    }],
    layout: base.layout,
  };
}

function build3dScatter(base: BuildResult, data: DataSet, project: CaseProject): BuildResult {
  const style = styleOf(project, "point");
  const size = num(style.size, num(project.params.marker_size, 4));
  const opacity = num(style.opacity, num(project.params.opacity, 1));
  const baseTrace = (base.data[0] ?? {}) as Trace;
  const marker = { ...(baseTrace.marker as Trace | undefined) };
  return {
    data: [{
      ...baseTrace,
      x: column(data, "x"),
      y: column(data, "y"),
      z: column(data, "z"),
      mode: "markers",
      marker: {
        ...marker,
        size,
        opacity,
        color: column(data, "value"),
        colorscale: colorscaleOf(base),
        colorbar: marker.colorbar ?? { title: "Z" },
      },
      name: "散点",
    }],
    layout: base.layout,
  };
}

function build3dSurface(base: BuildResult, data: DataSet, project: CaseProject): BuildResult {
  const style = styleOf(project, "surface");
  const showGrid = bool(project.params.show_grid ?? true);
  const gridWidth = num(style.size, num(project.params.grid_width, 2));
  const opacity = num(style.opacity, num(project.params.opacity, 1));
  const { ux, uy, z } = pivot(column(data, "x"), column(data, "y"), column(data, "z"));
  const baseTrace = (base.data[0] ?? {}) as Trace;
  return {
    data: [{
      ...baseTrace,
      x: ux,
      y: uy,
      z,
      colorscale: colorscaleOf(base),
      opacity,
      showscale: true,
      colorbar: (baseTrace.colorbar as Trace | undefined) ?? { title: "Z" },
      contours: {
        x: { show: showGrid, color: "white", width: gridWidth, start: Math.min(...ux), end: Math.max(...ux), size: 0.1 },
        y: { show: showGrid, color: "white", width: gridWidth, start: Math.min(...uy), end: Math.max(...uy), size: 0.1 },
      },
    }],
    layout: base.layout,
  };
}

function build3dVolume(base: BuildResult, data: DataSet, project: CaseProject): BuildResult {
  const style = styleOf(project, "volume");
  const isomin = num(project.params.isomin, 0.2);
  const isomax = num(project.params.isomax, 0.7);
  const opacity = num(style.opacity, num(project.params.opacity, 0.1));
  const surfaceCount = Math.max(2, Math.round(num(style.size, num(project.params.surface_count, 25))));
  const baseTrace = (base.data[0] ?? {}) as Trace;
  return {
    data: [{
      ...baseTrace,
      x: column(data, "x"),
      y: column(data, "y"),
      z: column(data, "z"),
      value: column(data, "value"),
      isomin,
      isomax,
      opacity,
      surface_count: surfaceCount,
      colorscale: colorscaleOf(base),
      showscale: true,
    }],
    layout: base.layout,
  };
}

const BUILDERS: Record<string, (base: BuildResult, data: DataSet, project: CaseProject) => BuildResult> = {
  "3d-bar": build3dBar,
  "3d-bubble": build3dBubble,
  "3d-cone": build3dCone,
  "3d-contour": build3dContour,
  "3d-isosurface": build3dIsosurface,
  "3d-scatter": build3dScatter,
  "3d-surface": build3dSurface,
  "3d-volume": build3dVolume,
};

/** 重建一个 Plotly 3D figure；没有对应构造器时原样返回静态 spec。 */
export function buildPlotlyCase(c: GalleryCase, project: CaseProject, data: DataSet, base: BuildResult): BuildResult {
  const build = BUILDERS[c.id];
  return build ? build(base, data, project) : base;
}
