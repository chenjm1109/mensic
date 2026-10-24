# -*- coding: utf-8 -*-
"""验收：中文字体 / 英文字体的族顺序（matplotlib 逐字回退）+ 字体列表的字形覆盖标记。
跑法：app/.renderer-venv/Scripts/python.exe scripts/check-font-family.py
"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

from matplotlib import font_manager
from matplotlib.ft2font import FT2Font

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
sys.path.insert(0, str(ROOT / "renderer"))
spec = importlib.util.spec_from_file_location("vr", ROOT / "renderer" / "render.py")
render = importlib.util.module_from_spec(spec)
spec.loader.exec_module(render)

fail = 0


def check(name, ok, detail=""):
    global fail
    if not ok:
        fail += 1
    print(f"  {'ok  ' if ok else 'FAIL'}  {name}   {detail}")


base = render._load_tokens_yaml(str(REPO / "design" / "tokens.yaml"), "rose")
has_builtin = bool(render._FONT_NAME)
if not has_builtin:
    print("  （本机没注入随包 CJK 字体，跳过两条跟它有关的断言；App 里由 MENSIC_FONT 提供）")

# 1) 默认（没选过字体）：内置中文字体优先
fam = render._font_family(base)
if has_builtin:
    check("默认：内置中文字体排第一", fam and fam[0] == render._FONT_NAME, str(fam[:3]))
else:
    check("默认：用设计默认字体族", fam == base["font"]["family"], str(fam[:3]))

# 2) 选了英文字体 + 中文字体：英文在前（拉丁字母用它），中文在后，内置永远兜底
toks = {**base, "font": {**base["font"], "latin": "Arial", "cjk": "Microsoft YaHei"}}
fam = render._font_family(toks)
check("英文字体排第一", fam[0] == "Arial", str(fam[:4]))
check("中文字体紧随其后", fam[1] == "Microsoft YaHei", str(fam[:4]))
if has_builtin:
    check("内置中文字体仍在列表里兜底", render._FONT_NAME in fam, str(fam[:5]))

# 3) 只选中文：只把中文提到前面，英文跟着设计默认族走
toks = {**base, "font": {**base["font"], "cjk": "Source Han Sans SC"}}
fam = render._font_family(toks)
check("只选中文时它排第一", fam[0] == "Source Han Sans SC", str(fam[:4]))

# 4) 老项目遗留的 font.primary 仍按老规则生效（不写新键也能正常渲染）
toks = {**base, "font": {**base["font"], "primary": "SimSun"}}
fam = render._font_family(toks)
check("老键 font.primary 仍优先", fam[0] == "SimSun", str(fam[:3]))

# 5) 真的画一张图，确认换字体不会崩、也不会退化成方块（用系统里有的字体）
import pandas as pd
import matplotlib

matplotlib.use("Agg")


def load_chart(path: Path, alias: str):
    s = importlib.util.spec_from_file_location(alias, path)
    m = importlib.util.module_from_spec(s)
    s.loader.exec_module(m)
    return m


impl = REPO / "catalog" / "scatter" / "scatter-basic" / "implementations" / "matplotlib"
chart = load_chart(impl / "chart.py", "chart_font")
df = pd.read_csv(next((impl.parents[1] / "data").glob("*.csv")))
for label, font in [("指定中文字体", {"cjk": "DejaVu Sans"}), ("指定英文字体", {"latin": "DejaVu Sans"})]:
    toks = {**base, "font": {**base["font"], **font}}
    params = {"tokens": toks, "elements": {}, "size": 100, "show_projection": False}
    pres = {"projection": "rect", "canvas": {"size": [8, 5], "dpi": 100}}
    try:
        fig, _ = render.build_figure(chart.create_chart, df, params, pres, toks)
        check(f"{label}：能正常出图", True)
    except Exception as exc:  # noqa: BLE001
        check(f"{label}：能正常出图", False, str(exc))

# 6) 轴标签 / 刻度的字号与字重真的能盖到图上（「坐标轴」分区里那两组设置）
toks = {
    **base,
    "font": {**base["font"], "axis_label_size": 15, "axis_label_weight": "bold", "tick_label_size": 12, "tick_label_weight": "normal"},
}
params = {"tokens": toks, "elements": {}, "size": 100, "show_projection": False}
pres = {"projection": "rect", "canvas": {"size": [8, 5], "dpi": 100}, "xlabel": "X", "ylabel": "Y"}
fig, _ = render.build_figure(chart.create_chart, df, params, pres, toks)
ax = fig.axes[0]
check("轴标签字号生效", ax.xaxis.label.get_fontsize() == 15, f"{ax.xaxis.label.get_fontsize()}")
check("轴标签字重生效", str(ax.xaxis.label.get_fontweight()) == "bold", str(ax.xaxis.label.get_fontweight()))
tick = ax.get_xticklabels()[0]
check("刻度字号生效", tick.get_fontsize() == 12, f"{tick.get_fontsize()}")
check("刻度字重生效", str(tick.get_fontweight()) == "normal", str(tick.get_fontweight()))

# 7) 连续渲染不会「串味」：改过字号再改回默认，必须真的回到默认
#    （rcParams 是全局单例，曾经在这里咬人：改回 10 仍然显示 20）
toks_big = {**base, "font": {**base["font"], "axis_label_size": 20, "tick_label_size": 20}}
params_big = {"tokens": toks_big, "elements": {}, "size": 100, "show_projection": False}
pres = {"projection": "rect", "canvas": {"size": [8, 5], "dpi": 100}, "xlabel": "X", "ylabel": "Y"}
fig1, _ = render.build_figure(chart.create_chart, df, params_big, pres, toks_big)
check("先改成 20：生效", fig1.axes[0].xaxis.label.get_fontsize() == 20, f"{fig1.axes[0].xaxis.label.get_fontsize()}")

toks_back = {**base, "font": {**base["font"]}}  # 覆盖已清空
params_back = {"tokens": toks_back, "elements": {}, "size": 100, "show_projection": False}
fig2, _ = render.build_figure(chart.create_chart, df, params_back, pres, toks_back)
back_label = fig2.axes[0].xaxis.label.get_fontsize()
back_tick = fig2.axes[0].get_xticklabels()[0].get_fontsize()
check("再改回默认：轴标签回到 10", back_label == 10, f"{back_label}")
check("再改回默认：刻度回到 10", back_tick == 10, f"{back_tick}")

toks_w = {**base, "font": {**base["font"], "axis_label_weight": "bold"}}
params_w = {"tokens": toks_w, "elements": {}, "size": 100, "show_projection": False}
fig3, _ = render.build_figure(chart.create_chart, df, params_w, pres, toks_w)
check("先把轴标签字重改粗：生效", str(fig3.axes[0].xaxis.label.get_fontweight()) == "bold")
fig4, _ = render.build_figure(chart.create_chart, df, params_back, pres, toks_back)
check(
    "字重清空后跟随全局字重",
    str(fig4.axes[0].xaxis.label.get_fontweight()) == str(base["font"]["weight"]),
    str(fig4.axes[0].xaxis.label.get_fontweight()),
)

# 7.1) 全局字号：轴标签 / 刻度留空时跟着变；显式写了的仍然优先
toks_size = {**base, "font": {**base["font"], "size": 14}}
params_size = {"tokens": toks_size, "elements": {}, "size": 100, "show_projection": False}
figg, _ = render.build_figure(chart.create_chart, df, params_size, pres, toks_size)
check("字号留空跟随全局：轴标签 14", figg.axes[0].xaxis.label.get_fontsize() == 14, f"{figg.axes[0].xaxis.label.get_fontsize()}")
check("字号留空跟随全局：刻度 14", figg.axes[0].get_xticklabels()[0].get_fontsize() == 14, f"{figg.axes[0].get_xticklabels()[0].get_fontsize()}")

toks_mix = {**base, "font": {**base["font"], "size": 14, "axis_label_size": 9}}
params_mix = {"tokens": toks_mix, "elements": {}, "size": 100, "show_projection": False}
figm, _ = render.build_figure(chart.create_chart, df, params_mix, pres, toks_mix)
check("显式轴标签字号优先于全局", figm.axes[0].xaxis.label.get_fontsize() == 9, f"{figm.axes[0].xaxis.label.get_fontsize()}")
check("没写的刻度仍跟随全局", figm.axes[0].get_xticklabels()[0].get_fontsize() == 14, f"{figm.axes[0].get_xticklabels()[0].get_fontsize()}")

# 7.2) 全局字重改回常规：留空的轴标签 / 刻度也一起变
toks_gw = {**base, "font": {**base["font"], "weight": "normal"}}
params_gw = {"tokens": toks_gw, "elements": {}, "size": 100, "show_projection": False}
figw, _ = render.build_figure(chart.create_chart, df, params_gw, pres, toks_gw)
check("字重留空跟随全局：轴标签常规", str(figw.axes[0].xaxis.label.get_fontweight()) == "normal", str(figw.axes[0].xaxis.label.get_fontweight()))
check("字重留空跟随全局：刻度常规", str(figw.axes[0].get_xticklabels()[0].get_fontweight()) == "normal", str(figw.axes[0].get_xticklabels()[0].get_fontweight()))

# 8) 轴标签 / 刻度 / 标题三者互不牵连（曾经「改轴标签颜色会把刻度一起改掉」）
base_color = base["color"]
pres_c = {"projection": "rect", "canvas": {"size": [8, 5], "dpi": 100}, "xlabel": "X", "ylabel": "Y"}
toks_lbl = {**base, "font": {**base["font"]}, "color": {**base_color, "label": "#ff0000"}}
params_c = {"tokens": toks_lbl, "elements": {}, "size": 100, "show_projection": False}
figc, _ = render.build_figure(chart.create_chart, df, params_c, pres_c, toks_lbl)
axc = figc.axes[0]
check("改轴标签颜色：标签变色", axc.xaxis.label.get_color() == "#ff0000", str(axc.xaxis.label.get_color()))
tick_color = axc.get_xticklabels()[0].get_color()
check("改轴标签颜色：刻度**不**跟着变", tick_color != "#ff0000", f"刻度色 {tick_color}（应为正文色 {base_color['text']}）")
check("改轴标签颜色：刻度用的仍是它自己的默认（正文色）", tick_color == base_color["text"], str(tick_color))

toks_tick = {**base, "font": {**base["font"]}, "color": {**base_color, "tick": "#00ff00", "label": "#ff0000"}}
params_c2 = {"tokens": toks_tick, "elements": {}, "size": 100, "show_projection": False}
figc2, _ = render.build_figure(chart.create_chart, df, params_c2, pres_c, toks_tick)
axc2 = figc2.axes[0]
check("单独改刻度颜色：刻度变色", axc2.get_xticklabels()[0].get_color() == "#00ff00", str(axc2.get_xticklabels()[0].get_color()))
check("单独改刻度颜色：标签保持原样", axc2.xaxis.label.get_color() != "#00ff00", str(axc2.xaxis.label.get_color()))

# 9) 字体列表带**字形覆盖**（界面据此过滤「中文字体 / 英文字体」两个下拉框）
fonts = json.loads(render.font_list())
by = {x["name"]: x for x in fonts}
check("字体列表是结构化条目", bool(fonts) and len(by) == len(fonts), f"{len(fonts)} 个族")
check(
    "每个条目都有 cjk / latin 两个布尔标记",
    all(isinstance(x.get("cjk"), bool) and isinstance(x.get("latin"), bool) for x in fonts),
)
# 下拉框显示 `label`（字体自带的中文名），存进 tokens 的是 `name`（渲染族名）
check(
    "每个条目都有展示名（没有中文名就与族名相同）",
    all(isinstance(x.get("label"), str) and x["label"] for x in fonts),
)
check("展示名解码没有乱码", all("\ufffd" not in x["label"] for x in fonts))
for en, zh in (("SimSun", "宋体"), ("SimHei", "黑体"), ("KaiTi", "楷体"), ("Microsoft YaHei", "微软雅黑")):
    if en in by:  # 系统没装这个字体就跳过
        check(f"{en} 的展示名是「{zh}」", by[en]["label"] == zh, by[en]["label"])
dejavu = by.get("DejaVu Sans")  # matplotlib 自带，任何机器上都在
if dejavu:
    check("DejaVu Sans：算英文字体、不算中文字体", dejavu["latin"] and not dejavu["cjk"])
if render._FONT_NAME:
    builtin = by.get(render._FONT_NAME)
    check("随包中文字体被认成中文", bool(builtin and builtin["cjk"]), render._FONT_NAME)

# 图标字体：排不了字母数字，必须从「英文字体」里筛掉（本机没有就跳过）
for icon in ("Wingdings", "Webdings", "Symbol", "Segoe MDL2 Assets"):
    if icon in by:
        check(f"图标字体 {icon} 不算英文字体", by[icon]["latin"] is False)
# 日文 / 韩文字体：只有一部分汉字字形，排不了中文，必须从「中文字体」里筛掉
for other in ("MS Gothic", "Yu Gothic", "Malgun Gothic"):
    if other in by:
        check(f"日 / 韩字体 {other} 不算中文字体", by[other]["cjk"] is False)

# 反过来：标成中文的族必须真的覆盖简体「汉」（日文字体只有「漢」，过不了这一关）
paths = {e.name: e.fname for e in font_manager.fontManager.ttflist}
missing = [n for n, x in by.items() if x["cjk"] and not FT2Font(paths[n]).get_char_index(0x6C49)]
check("标成中文的族都能排简体「汉」", not missing, str(missing[:3]))

print("\n字体族顺序与字体列表验收通过" if fail == 0 else f"\n失败 {fail} 项")
sys.exit(0 if fail == 0 else 1)
