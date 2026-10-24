# -*- coding: utf-8 -*-
"""生成画廊缩略图（不绘制标题）。

与 App 内渲染共用同一份渲染器（`renderer/render.py`），避免主题/呈现逻辑出现两份实现：
- matplotlib 案例：读取 `public/cases/<id>/{chart.py,data.csv}`，调用 `render.py` 的 `_make_figure` 出图
- Plotly(3D) 案例：读取 `public/cases/<id>/spec.json`，用 kaleido 出图（并去掉标题）
输出 `public/gallery/<id>.png`

用法：python scripts/gen-thumbnails.py [--missing]
      --missing：只补缺失的缩略图（predev 用，避免每次启动都重画几十张）
"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]  # app/
PUB = ROOT / "public"
THUMB_WIDTH = 640


def load_renderer():
    """加载 App 的渲染器模块（与运行时同一份代码）。"""
    path = ROOT / "renderer" / "render.py"
    spec = importlib.util.spec_from_file_location("mensic_render", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def render_matplotlib(c: dict, out_dir: Path, renderer) -> bool:
    chart_path = PUB / "cases" / c["id"] / "chart.py"
    data_path = PUB / "cases" / c["id"] / "data.csv"
    if not chart_path.exists() or not data_path.exists():
        return False

    pres = {k: v for k, v in (c.get("presentation") or {}).items() if k != "title"}
    canvas = dict(pres.get("canvas") or {})
    size = canvas.get("size") or [8, 5]
    w = float(size[0]) or 8.0
    h = float(size[1]) or 5.0
    # 缩略图：保持英寸尺寸，用 dpi 缩到 THUMB_WIDTH 宽
    dpi = max(48.0, THUMB_WIDTH / w)
    pres["canvas"] = {"size": [w, h], "dpi": dpi}

    df = pd.read_csv(data_path)
    spec = {
        "chartPath": str(chart_path),
        "tokensPath": str(PUB / "design" / "tokens.yaml"),
        "theme": c.get("theme", "rose"),
        "params": {p["key"]: p.get("default") for p in (c.get("params") or [])},
        "presentation": pres,
        "data": {"columns": list(df.columns), "rows": df.values.tolist()},
    }

    fig, dpi = renderer._make_figure(spec)
    fig.savefig(out_dir / f"{c['id']}.png", dpi=dpi)
    renderer.plt.close(fig)
    return True


def render_plotly(c: dict, out_dir: Path) -> bool:
    spec_path = PUB / "cases" / c["id"] / "spec.json"
    if not spec_path.exists():
        return False
    import plotly.io as pio

    figj = json.loads(spec_path.read_text(encoding="utf-8"))
    figj.setdefault("layout", {})
    figj["layout"]["title"] = {"text": ""}
    # 生成规格里含新版 plotly 已移除的遗留键（mapbox / template.data.scattermapbox），清理之
    figj["layout"].pop("mapbox", None)
    tpl = figj["layout"].get("template")
    if isinstance(tpl, dict):
        if isinstance(tpl.get("data"), dict):
            tpl["data"].pop("scattermapbox", None)
        if isinstance(tpl.get("layout"), dict):
            tpl["layout"].pop("mapbox", None)
    try:
        fig = pio.from_json(json.dumps(figj))
    except Exception:
        figj["layout"].pop("template", None)
        fig = pio.from_json(json.dumps(figj))
    fig.update_layout(
        width=THUMB_WIDTH,
        height=int(THUMB_WIDTH * 0.7),
        margin={"l": 0, "r": 0, "t": 8, "b": 0},
    )
    fig.write_image(str(out_dir / f"{c['id']}.png"), scale=1)
    return True


def main() -> int:
    args = sys.argv[1:]
    only_missing = "--missing" in args
    strict = "--strict" in args
    cases = json.loads((ROOT / "src" / "gallery" / "cases.json").read_text(encoding="utf-8"))
    out_dir = PUB / "gallery"
    out_dir.mkdir(parents=True, exist_ok=True)
    if only_missing:
        cases = [c for c in cases if not (out_dir / f"{c['id']}.png").exists()]
        if not cases:
            print("thumbnails 已齐全（--missing）")
            return 0
    renderer = load_renderer()

    made = 0
    for c in cases:
        try:
            ok = render_plotly(c, out_dir) if c.get("engine") != "matplotlib" else render_matplotlib(c, out_dir, renderer)
            made += 1 if ok else 0
        except Exception as exc:  # noqa: BLE001
            print(f"skip {c['id']}: {exc}", file=sys.stderr)
    print(f"generated {made}/{len(cases)} thumbnails")
    if made == len(cases):
        return 0
    # 严格模式（sync / 发版）下缺图直接失败；predev 的 --missing 不严格，别拦着开发
    return 1 if strict else 0


if __name__ == "__main__":
    raise SystemExit(main())
