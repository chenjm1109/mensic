import renderPy from "../../renderer/render.py?raw";
import { contentHash } from "./hash";

const ctx = self as unknown as Worker;

let bootPromise: Promise<PyodideLike> | null = null;
const loaded = new Set<string>(["matplotlib", "pandas", "pyyaml"]);
const written = new Set<string>();

interface PyodideLike {
  loadPackage: (names: string[]) => Promise<void>;
  runPython: (code: string) => unknown;
  globals: { set: (k: string, v: unknown) => void };
  FS: {
    writeFile: (path: string, data: string | Uint8Array) => void;
    readFile: {
      (path: string): Uint8Array;
      (path: string, opts: { encoding: "utf8" }): string;
    };
  };
}

async function boot(): Promise<PyodideLike> {
  const url = "/pyodide/pyodide.mjs";
  const nativeImport = new Function("u", "return import(u)") as (u: string) => Promise<unknown>;
  const mod = (await nativeImport(url)) as {
    loadPyodide: (opts: { indexURL: string }) => Promise<PyodideLike>;
  };
  const pyodide = await mod.loadPyodide({ indexURL: "/pyodide/" });
  await pyodide.loadPackage(["matplotlib", "pandas", "pyyaml"]);

  const res = await fetch("/fonts/NotoSansSC.ttf");
  const font = new Uint8Array(await res.arrayBuffer());
  pyodide.FS.writeFile("/tmp/mensic-font.ttf", font);
  written.add("/tmp/mensic-font.ttf");

  pyodide.runPython(renderPy);
  // 把渲染器源码注入为全局，供 case_script/build_package 内联「共享渲染逻辑」
  pyodide.globals.set("_RENDER_SRC", renderPy);
  pyodide.runPython("warmup()");
  return pyodide;
}

async function ensure(): Promise<PyodideLike> {
  if (!bootPromise) bootPromise = boot();
  return bootPromise;
}

async function ensurePackages(pyodide: PyodideLike, requires: string[]) {
  const need = requires.filter((r) => !loaded.has(r));
  if (need.length === 0) return;
  await pyodide.loadPackage(need);
  for (const r of need) loaded.add(r);
}

/**
 * 案例源码写入「按内容指纹派生」的独立路径：
 * 既避免不同案例互相覆盖，也让 Python 侧（按路径缓存模块）不会把上一个案例的实现用错。
 */
function chartPathFor(source: string): string {
  return `/tmp/case_chart_${contentHash(source)}.py`;
}

function tokensPathFor(source: string): string {
  return `/tmp/tokens_${contentHash(source)}.yaml`;
}

/** 静态资源按「内容指纹路径」只写入一次 */
async function prepareFiles(
  pyodide: PyodideLike,
  chartSource: string,
  tokensSource: string,
  requires?: string[],
) {
  await ensurePackages(pyodide, requires ?? []);
  const chartPath = chartPathFor(chartSource);
  const tokensPath = tokensPathFor(tokensSource);
  if (!written.has(chartPath)) {
    pyodide.FS.writeFile(chartPath, chartSource);
    written.add(chartPath);
  }
  if (!written.has(tokensPath)) {
    pyodide.FS.writeFile(tokensPath, tokensSource);
    written.add(tokensPath);
  }
  return { chartPath, tokensPath };
}

interface CaseSpec {
  chartSource: string;
  tokensSource: string;
  theme: string;
  tokensOverride?: unknown;
  params: Record<string, unknown>;
  presentation: unknown;
  data: { columns: string[]; rows: unknown[][] } | null;
  requires?: string[];
}

interface PackageSpec {
  chartSource: string;
  tokensSource: string;
  theme: string;
  tokensOverride?: unknown;
  params: Record<string, unknown>;
  presentation: unknown;
  dataCsv: string;
  title: string;
  requires?: string[];
}

function packageGlobals(s: PackageSpec, chartPath: string, tokensPath: string) {
  return {
    chartPath,
    tokensPath,
    theme: s.theme,
    tokensOverride: s.tokensOverride,
    params: s.params,
    presentation: s.presentation,
    dataCsv: s.dataCsv,
    title: s.title,
    requires: s.requires ?? [],
  };
}

ctx.onmessage = async (ev: MessageEvent) => {
  const { id, type, spec } = ev.data as { id: number; type: string; spec?: unknown };
  try {
    if (type === "init") {
      const t0 = performance.now();
      await ensure();
      ctx.postMessage({ id, ready: true, ms: performance.now() - t0 });
      return;
    }
    if (type === "renderCase") {
      const t0 = performance.now();
      const pyodide = await ensure();
      const s = spec as CaseSpec;
      const { chartPath, tokensPath } = await prepareFiles(pyodide, s.chartSource, s.tokensSource, s.requires);
      const cs = {
        chartPath,
        tokensPath,
        theme: s.theme,
        tokensOverride: s.tokensOverride,
        params: s.params,
        presentation: s.presentation,
        data: s.data,
      };
      pyodide.globals.set("__mensic_case", JSON.stringify(cs));
      const timing = JSON.parse(pyodide.runPython("render_case(__mensic_case)") as string) as {
        build: number;
        save: number;
      };
      const bytes = pyodide.FS.readFile("/tmp/mensic_out.png");
      ctx.postMessage({ id, png: bytes, ms: performance.now() - t0, t: timing }, [bytes.buffer]);
      return;
    }
    if (type === "renderCaseSvg") {
      const t0 = performance.now();
      const pyodide = await ensure();
      const s = spec as CaseSpec;
      const { chartPath, tokensPath } = await prepareFiles(pyodide, s.chartSource, s.tokensSource, s.requires);
      const cs = {
        chartPath,
        tokensPath,
        theme: s.theme,
        tokensOverride: s.tokensOverride,
        params: s.params,
        presentation: s.presentation,
        data: s.data,
      };
      pyodide.globals.set("__mensic_case", JSON.stringify(cs));
      pyodide.runPython("render_case_svg(__mensic_case)");
      const svg = pyodide.FS.readFile("/tmp/mensic_out.svg", { encoding: "utf8" });
      ctx.postMessage({ id, svg, ms: performance.now() - t0 });
      return;
    }
    if (type === "fontList") {
      const pyodide = await ensure();
      // 结构由 render.py 的 font_list 决定（族名 + 字形覆盖），解析在 renderers/fonts.ts
      const fonts = JSON.parse(pyodide.runPython("font_list()") as string) as unknown;
      ctx.postMessage({ id, fonts });
      return;
    }
    if (type === "caseScript") {
      const pyodide = await ensure();
      const s = spec as PackageSpec;
      const { chartPath, tokensPath } = await prepareFiles(pyodide, s.chartSource, s.tokensSource, s.requires);
      pyodide.globals.set("__mensic_pkg", JSON.stringify(packageGlobals(s, chartPath, tokensPath)));
      const script = pyodide.runPython("case_script(__mensic_pkg)") as string;
      ctx.postMessage({ id, script });
      return;
    }
    if (type === "packageCase") {
      const t0 = performance.now();
      const pyodide = await ensure();
      const s = spec as PackageSpec;
      const { chartPath, tokensPath } = await prepareFiles(pyodide, s.chartSource, s.tokensSource, s.requires);
      pyodide.globals.set("__mensic_pkg", JSON.stringify(packageGlobals(s, chartPath, tokensPath)));
      pyodide.runPython("build_package(__mensic_pkg)");
      const bytes = pyodide.FS.readFile("/tmp/mensic_pkg.zip");
      ctx.postMessage({ id, zip: bytes, ms: performance.now() - t0 }, [bytes.buffer]);
      return;
    }
  } catch (err) {
    ctx.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
