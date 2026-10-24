# -*- coding: utf-8 -*-
"""把 `catalog/` 解析成一份 JSON 清单，供 `app/scripts/sync-catalog.mjs` 使用。

以前这份清单由仓库根的 Python 引擎（`viz manifest`）生成；引擎随网站一起去掉后，
**清单的唯一来源就是 `catalog/**/meta.yaml`**。这里用 PyYAML 读它（比在 JS 里手写
YAML 子集稳），并把「只有 Plotly 实现的案例」真跑一遍、导出 `spec.json` ——
3D 图是 plotly.js 直接读这份规格渲染的。

跑在 `app/.renderer-venv`（与渲染器/缩略图同一个环境）：
    python scripts/catalog-manifest.py --out .catalog-manifest.json

输出与旧 manifest 同形（sync-catalog 依赖这些字段）：
    { "categories": [...], "topics": [ { META_FIELDS..., data_schema, params_schema,
      presentation, implementations, spec? } ] }
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from pathlib import Path

import yaml

APP = Path(__file__).resolve().parents[1]  # app/
ROOT = APP.parent  # 仓库根
CATALOG = ROOT / "catalog"
TOKENS = ROOT / "design" / "tokens.yaml"
RENDER_PY = APP / "renderer" / "render.py"

# 元数据里直接透传到清单的字段（与旧 manifest 一致）
META_FIELDS = ("id", "version", "title", "category", "tags", "summary", "difficulty", "default_library", "order")


def load_renderer():
    """加载 App 的渲染器（只为借用它的设计令牌解析，保证与界面/导出同一套色）。"""
    spec = importlib.util.spec_from_file_location("mensic_render", RENDER_PY)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def load_categories() -> list[dict]:
    path = CATALOG / "_categories.yaml"
    if not path.exists():
        return []
    return yaml.safe_load(path.read_text(encoding="utf-8")) or []


def iter_cases():
    """按 `catalog/<category>/<case>/meta.yaml` 遍历；`_` 开头的是配置不是案例。"""
    for cat in sorted(p for p in CATALOG.iterdir() if p.is_dir() and not p.name.startswith("_")):
        for case in sorted(p for p in cat.iterdir() if p.is_dir()):
            meta_path = case / "meta.yaml"
            if not meta_path.exists():
                continue
            meta = yaml.safe_load(meta_path.read_text(encoding="utf-8")) or {}
            if not meta.get("id"):
                continue
            yield cat.name, case, meta


def _apply_tokens(fig, tokens: dict) -> None:
    """Plotly 主题模板：配色 / 字体 / 背景与 App 内一致（对齐旧引擎 adapters/plotly.py）。"""
    c = tokens["color"]
    scene_bg = c.get("surface_bg")
    fig.update_layout(
        font=dict(family=", ".join(tokens["font"]["family"]), color=c["text"]),
        title=dict(font=dict(color=c["label"])),
        paper_bgcolor=c["figure"],
        plot_bgcolor=c["axes"],
        colorway=c["palette"],
        xaxis=dict(gridcolor=c["grid"], color=c["label"], zerolinecolor=c["grid"]),
        yaxis=dict(gridcolor=c["grid"], color=c["label"], zerolinecolor=c["grid"]),
        scene=dict(
            xaxis=dict(backgroundcolor=scene_bg, gridcolor=c["grid"]),
            yaxis=dict(backgroundcolor=scene_bg, gridcolor=c["grid"]),
            zaxis=dict(backgroundcolor=scene_bg, gridcolor=c["grid"]),
        ),
        legend=dict(bgcolor=c["axes"], bordercolor=c["axes"]),
    )


def _apply_presentation(fig, pres: dict) -> None:
    if not pres:
        return
    title = pres.get("title")
    if isinstance(title, dict) and title.get("text"):
        fig.update_layout(title=dict(text=title["text"], x=0.01, xanchor="left"))
    elif title:
        fig.update_layout(title_text=str(title))
    if pres.get("xlabel") is not None:
        fig.update_xaxes(title_text=pres["xlabel"])
    if pres.get("ylabel") is not None:
        fig.update_yaxes(title_text=pres["ylabel"])
    limits = pres.get("limits") or {}
    if limits.get("x"):
        fig.update_xaxes(range=limits["x"])
    if limits.get("y"):
        fig.update_yaxes(range=limits["y"])
    legend = pres.get("legend", None)
    if legend is False:
        fig.update_layout(showlegend=False)
    elif isinstance(legend, dict):
        fig.update_layout(
            legend=dict(
                orientation="h" if legend.get("ncols", 1) > 1 else "v",
                yanchor="top",
                y=1.0,
                xanchor="left",
                x=0.0,
            )
        )
    if pres.get("margin") is not None:
        fig.update_layout(margin=pres["margin"])


def plotly_spec(case_dir: Path, meta: dict, render) -> dict | None:
    """只有 Plotly 实现的案例：跑一遍 `create_chart`，取 `fig.to_json()`。"""
    import pandas as pd
    import plotly.graph_objects as go

    theme = meta.get("theme") or "rose"
    tokens = render._load_tokens_yaml(str(TOKENS), theme)
    params = {p["key"]: p.get("default") for p in (meta.get("params") or []) if isinstance(p, dict) and p.get("key")}
    params["tokens"] = tokens

    source = (meta.get("data") or {}).get("source")
    if not source:
        return None
    data = pd.read_csv(case_dir / source)

    chart_py = case_dir / "implementations" / "plotly" / "chart.py"
    spec = importlib.util.spec_from_file_location(f"case_{meta['id']}", chart_py)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    fig = go.Figure()
    result = mod.create_chart(fig, data, params)
    if result is not None:
        fig = result
    _apply_tokens(fig, tokens)
    _apply_presentation(fig, meta.get("presentation") or {})
    return json.loads(fig.to_json())


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="输出 JSON 路径")
    args = ap.parse_args()

    render = load_renderer()
    categories = load_categories()
    topics = []
    for cat_name, case_dir, meta in iter_cases():
        libs = [i.get("library") for i in (meta.get("implementations") or []) if isinstance(i, dict) and i.get("library")]
        item = {k: meta.get(k) for k in META_FIELDS}
        item["category"] = item.get("category") or cat_name
        # 发布状态：缺省 = draft（没适配好的案例默认不进发布包）
        item["status"] = str(meta.get("status") or "draft").strip()
        item["data_schema"] = (meta.get("data") or {}).get("schema")
        item["params_schema"] = meta.get("params") or []
        item["presentation"] = meta.get("presentation") or {}
        item["implementations"] = [{"library": lib} for lib in libs]
        # 只有 Plotly（没有 matplotlib 实现）的案例才需要预生成规格
        item["spec"] = plotly_spec(case_dir, meta, render) if ("plotly" in libs and "matplotlib" not in libs) else None
        topics.append(item)

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"categories": categories, "topics": topics}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"[catalog] {len(topics)} 个案例，{len(categories)} 个类别 → {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
