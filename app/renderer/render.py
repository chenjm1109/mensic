"""mensic · matplotlib 渲染器（在 Pyodide 中运行）。

按「案例的 chart.py」渲染：输入 spec（chartPath / tokensPath / theme / params /
presentation / data），输出 PNG / SVG，或生成可运行脚本与 ZIP。

导出脚本与 App 预览**共用同一段渲染逻辑**（见 SHARED-RUNTIME 标记之间）：
`_script_text` 会把这段源码原样内联进 run.py，因此导出的绘图效果与界面预览严格一致。
"""
import json
import os
import struct
import warnings

import pandas as pd
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib import font_manager, ft2font  # noqa: E402

# Pyodide 走虚拟文件系统（默认 /tmp/...）；本端原生渲染器用 MENSIC_FONT 指向随包字体。
FONT_PATH = os.environ.get("MENSIC_FONT") or "/tmp/mensic-font.ttf"
_FONT_NAME = None

# 渲染产物路径：Pyodide 用虚拟 /tmp；本端原生渲染器会覆盖为真实临时目录。
OUT_PNG = os.environ.get("MENSIC_OUT_PNG") or "/tmp/mensic_out.png"
OUT_SVG = os.environ.get("MENSIC_OUT_SVG") or "/tmp/mensic_out.svg"
OUT_PKG = os.environ.get("MENSIC_OUT_PKG") or "/tmp/mensic_pkg.zip"
PKG_ROOT = os.environ.get("MENSIC_PKG_ROOT") or "/tmp/mensic_pkg"

# ===== SHARED-RUNTIME-BEGIN =====
# 以下函数会被原样内联进导出的 run.py —— App 预览与导出脚本同源，保证效果一致。
# 依赖模块级名字：matplotlib / plt / warnings / font_manager / FONT_PATH / _FONT_NAME。


def _setup_font():
    """注册随包/内置的 CJK 字体（缺失则回退到 tokens 里的字体族）。"""
    global _FONT_NAME
    try:
        font_manager.fontManager.addfont(FONT_PATH)
        name = font_manager.FontProperties(fname=FONT_PATH).get_name()
        matplotlib.rcParams["font.family"] = name
        matplotlib.rcParams["axes.unicode_minus"] = False
        _FONT_NAME = name
        return name
    except Exception:
        return None


def _font_family(tokens):
    """字体族顺序（matplotlib 会**逐字**在这个列表里找字体，见 mpl ≥3.6 的 fallback）。

    - `font.latin` / `font.cjk`：界面上的「英文字体 / 中文字体」。
      英文字体排前面：拉丁字母与数字用它，中文它没有就落到中文字体，再落到内置字体。
    - `font.primary`：早期只有一个「字体」选项时写的键，老项目可能还留着 ——
      按老规则处理（它排第一，内置 CJK 兜底），新界面不再写它。
    - 内置 CJK 字体永远留在列表最后：缺字时才轮得到它，中文不会变方块。
    """
    family = list(tokens["font"].get("family") or [])
    latin = tokens["font"].get("latin")
    cjk = tokens["font"].get("cjk")
    primary = tokens["font"].get("primary")

    picked = [f for f in (latin, cjk) if f]
    if picked or primary:
        head = picked if picked else [primary]
        # 中文字体放英文字体后面（英文优先用它自己的），再排设计默认族，最后内置兜底
        tail = [f for f in family if f not in head]
        if _FONT_NAME and _FONT_NAME not in head and _FONT_NAME not in tail:
            tail.append(_FONT_NAME)
        return head + tail
    if _FONT_NAME:
        family = [_FONT_NAME] + [f for f in family if f != _FONT_NAME]
    return family


def _apply_theme(tokens):
    from cycler import cycler

    c = tokens["color"]
    font = tokens.get("font") or {}
    weight = font.get("weight", "normal")
    rc = {
        "font.sans-serif": _font_family(tokens),
        "font.family": "sans-serif",
        "axes.unicode_minus": False,
        "figure.facecolor": c["figure"],
        "figure.dpi": tokens["figure"]["dpi"],
        "axes.facecolor": c["axes"],
        "axes.edgecolor": c["edge"],
        # ⚠️ 轴标签 / 标题 / 刻度**三者互不牵连**：
        #    以前刻度与标题都回落 `label`，于是「改轴标签颜色」会把刻度和标题一起改掉。
        #    现在刻度/标题回落 `text`（「标题与正文」那一项）—— 内置主题里 text 与 label 本来就是同一个色值，
        #    观感不变，但改轴标签就只改轴标签了。
        "axes.labelcolor": c["label"],
        "axes.titlecolor": c["text"],
        "axes.prop_cycle": cycler(color=c["palette"]),
        # 基础 tokens 里故意没有 color.tick：只有用户改过刻度颜色才会有这个键，
        # 此时它才生效（并且由 _force_text_style 盖到各轴的刻度文本上）。
        "xtick.color": c.get("tick") or c["text"],
        "ytick.color": c.get("tick") or c["text"],
        "text.color": c["text"],
        "font.weight": weight,
        "legend.edgecolor": c["axes"],
        "legend.facecolor": c["axes"],
        "grid.color": c["grid"],
        "grid.linewidth": tokens["grid"]["width"],
        # 网格线的线型 / 透明度：**每次都写确定值**（rcParams 是全局单例，见字号那段的注释）
        "grid.linestyle": (tokens.get("grid") or {}).get("style", matplotlib.rcParamsDefault["grid.linestyle"]),
        "grid.alpha": (tokens.get("grid") or {}).get("alpha", matplotlib.rcParamsDefault["grid.alpha"]),
        "savefig.facecolor": c["figure"],
    }
    # 字号 / 字重：**必须每次都写一个确定的值**（没设过就写回 matplotlib 默认）。
    # ⚠️ rcParams 是全局单例：以前这里是「设过才写」，于是用户把字号调回默认值时，
    #    上一次渲染留下的 20 还留在 rcParams 里 —— 表现为「改回 10 没反应」。
    #    写回 rcParamsDefault 才能让每次渲染都是确定的结果。
    # 轴标签 / 刻度留空 = 跟随全局：它们的默认值写 `medium`（相对 font.size），
    # 字重写全局字重 —— 用户在「字体」分区改全局值，两处就一起变。
    default = matplotlib.rcParamsDefault
    # 全局字号：轴标签 / 刻度留空时，`medium` 会解析到它（见下面两行）。
    rc["font.size"] = font.get("size", default["font.size"])
    rc["axes.labelsize"] = font.get("axis_label_size", default["axes.labelsize"])
    # 轴标签字重：留空 = 跟随全局字重，而不是 matplotlib 默认的 normal。
    rc["axes.labelweight"] = font.get("axis_label_weight", weight)
    tick_size = font.get("tick_label_size", default["xtick.labelsize"])
    rc["xtick.labelsize"] = tick_size
    rc["ytick.labelsize"] = tick_size
    plt.rcParams.update(rc)


def _force_text_style(fig, tokens):
    """最终发言权：刻度文本 / 轴标签的字号与字重。

    各案例的 chart.py 里常写死 `fontsize=8`、`tick_params(labelcolor=...)`，
    光改 rcParams 会被它们盖掉。这里在 create_chart 跑完之后统一盖最后一遍。

    但**只在用户真的设过时才盖**：基础 tokens 里没有这些键就完全不动，
    否则会打断「双轴图左右刻度各一色」这类案例自己的设计。
    """
    c = tokens["color"]
    font = tokens.get("font") or {}
    tick_color = c.get("tick")
    tick_size = font.get("tick_label_size")
    tick_weight = font.get("tick_label_weight")
    label_size = font.get("axis_label_size")
    label_weight = font.get("axis_label_weight")
    if not (tick_color or tick_size is not None or tick_weight or label_size is not None or label_weight):
        return
    for ax in fig.get_axes():
        if tick_color or tick_size is not None or tick_weight:
            for lbl in list(ax.get_xticklabels()) + list(ax.get_yticklabels()):
                if tick_color:
                    lbl.set_color(tick_color)
                if tick_size is not None:
                    lbl.set_fontsize(tick_size)
                if tick_weight:
                    lbl.set_fontweight(tick_weight)
        if label_size is not None or label_weight:
            for axis in (ax.xaxis, ax.yaxis):
                if label_size is not None:
                    axis.label.set_fontsize(label_size)
                if label_weight:
                    axis.label.set_fontweight(label_weight)


def _force_axes_decoration(fig, tokens):
    """最终发言权：绘图区边框 / 网格线的显示与样式。

    **只在用户真的接管时才动**（`tokens.frame.on` / `tokens.grid.on` 存在）：
    很多案例自己画网格（柱状图的白线、极坐标只画 x 轴、日历图的 minor 格），
    没接管时一律不碰，免得把它们的设计抹平。

    rcParams 管不到「某条轴画不画网格」和「边框是否可见」，所以这里直接落到各轴上。
    """
    color = tokens["color"]
    frame = tokens.get("frame") or {}
    grid = tokens.get("grid") or {}
    spines = frame.get("spines") or {}
    if frame.get("on") is None and not spines and grid.get("on") is None:
        return
    for ax in fig.get_axes():
        if frame.get("on") is not None or spines:
            # 总开关（`on`）管「整圈要不要」，`spines` 再逐边细化；没写的边 = 显示
            master = frame.get("on")
            for name, spine in ax.spines.items():
                if name not in ("top", "bottom", "left", "right"):
                    continue
                visible = (True if master is None else bool(master)) and spines.get(name, True)
                spine.set_visible(bool(visible))
                if visible:
                    spine.set_color(color["edge"])
        if grid.get("on") is not None:
            if grid["on"]:
                ax.grid(
                    True,
                    color=color["grid"],
                    linestyle=grid.get("style", matplotlib.rcParamsDefault["grid.linestyle"]),
                    linewidth=grid.get("width", tokens["grid"]["width"]),
                    alpha=grid.get("alpha", matplotlib.rcParamsDefault["grid.alpha"]),
                )
            else:
                ax.grid(False)


def _apply_limits(ax, limits):
    """施加轴范围。**允许只给一侧**（另一侧按这张图自己的数据范围自动）。

    为什么不能直接把 [5, None] 丢给 matplotlib：`set_xlim(5, None)` 里的 None 取的是
    **当前**上界，而图还没画完时那是 matplotlib 的初始值 (0, 1)，不是数据范围 ——
    所以缺失的一侧先用 `autoscale_view()` 让 matplotlib 按数据定好，再把明确的一侧盖上去。
    """
    for axis, get_cur, set_cur in (("x", ax.get_xlim, ax.set_xlim), ("y", ax.get_ylim, ax.set_ylim)):
        lim = limits.get(axis)
        if not lim:
            continue
        try:
            lo, hi = (list(lim) + [None, None])[:2]
        except TypeError:
            continue
        if lo is None and hi is None:
            continue
        if lo is None or hi is None:
            try:
                ax.autoscale_view()
            except Exception:  # noqa: BLE001 — 特殊投影下 autoscale 可能不适用，退回默认
                continue
            cur = get_cur()
            if lo is None:
                lo = cur[0]
            if hi is None:
                hi = cur[1]
        set_cur(lo, hi)


def _apply_presentation_ax(ax, pres):
    if not pres:
        return
    import matplotlib.ticker as mticker

    if pres.get("xlabel") is not None:
        ax.set_xlabel(pres["xlabel"])
    if pres.get("ylabel") is not None:
        ax.set_ylabel(pres["ylabel"])
    limits = pres.get("limits") or {}
    _apply_limits(ax, limits)
    ticks = pres.get("ticks") or {}
    try:
        if ticks.get("x_major"):
            ax.xaxis.set_major_locator(mticker.MultipleLocator(ticks["x_major"]))
        if ticks.get("x_minor"):
            ax.xaxis.set_minor_locator(mticker.MultipleLocator(ticks["x_minor"]))
        if ticks.get("y_major"):
            ax.yaxis.set_major_locator(mticker.MultipleLocator(ticks["y_major"]))
        if ticks.get("y_minor"):
            ax.yaxis.set_minor_locator(mticker.MultipleLocator(ticks["y_minor"]))
    except (ValueError, NotImplementedError):
        pass
    # 刻度朝向：`in` = 朝里，`out` = 朝外（不写就是 matplotlib 默认的 `out`）。
    # 主刻度 / 次刻度一起改 —— 界面上只有一个开关，用户说的是「整套刻度朝哪边」。
    direction = (ticks or {}).get("direction")
    if direction in ("in", "out", "inout"):
        ax.tick_params(axis="both", which="both", direction=direction)
    legend = pres.get("legend", None)
    if legend is False:
        if ax.get_legend() is not None:
            ax.get_legend().remove()
    elif isinstance(legend, dict):
        handles, labels = ax.get_legend_handles_labels()
        if labels:
            ax.legend(
                loc=legend.get("loc", "best"),
                ncols=legend.get("ncols", 1),
                frameon=legend.get("frameon", True),
            )


def build_figure(create_chart, df, params, pres, tokens):
    """创建并绘制 Figure：主题、画布、投影、呈现、tight_layout 全在这里。

    App 预览与导出脚本都调用它，因此布局/尺寸/配色完全一致。
    """
    _apply_theme(tokens)
    canvas = pres.get("canvas") or {}
    size = canvas.get("size", tokens["figure"]["size"])
    dpi = canvas.get("dpi", tokens["figure"]["dpi"])
    projection = pres.get("projection", "rect")

    fig = plt.figure(figsize=tuple(size), dpi=dpi)
    if projection == "figure":
        # 多子图案例：由案例自行 fig.subplots(...)，需要整张 Figure
        create_chart(fig, df, params)
    else:
        if projection == "3d":
            ax = fig.add_subplot(111, projection="3d")
        elif projection == "polar":
            ax = fig.add_subplot(111, projection="polar")
        else:
            ax = fig.add_subplot(111)
        create_chart(ax, df, params)
        _apply_presentation_ax(ax, pres)
    _force_text_style(fig, tokens)
    _force_axes_decoration(fig, tokens)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        fig.tight_layout()
    return fig, dpi


# ===== SHARED-RUNTIME-END =====


# ---------------- 案例渲染：运行案例自身的 chart.py ----------------
def _deep_update(target, override):
    import copy

    for k, v in override.items():
        if isinstance(v, dict) and isinstance(target.get(k), dict):
            _deep_update(target[k], v)
        else:
            target[k] = copy.deepcopy(v)
    return target


def _load_tokens_yaml(path, theme, override=None):
    import copy

    import yaml

    raw = yaml.safe_load(open(path, encoding="utf-8").read())
    themes = raw.pop("themes", {}) or {}
    merged = copy.deepcopy(raw)
    if theme in themes:
        _deep_update(merged, themes[theme])
    # 项目级覆盖优先级最高（配色 / 字体），与「主题预设」是两层
    if override:
        _deep_update(merged, override)
    return merged


def _import_file(path, name="mensic_case_chart"):
    import importlib.util

    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


_MODULES = {}
_TOKENS = {}


def _import_cached(path):
    """按「路径 + 内容指纹」缓存，避免同一路径内容变化后仍用旧模块。"""
    try:
        with open(path, "rb") as f:
            key = (path, hash(f.read()))
    except OSError:
        key = (path, None)
    mod = _MODULES.get(key)
    if mod is None:
        mod = _import_file(path)
        # 清掉同一路径的旧快照，缓存不会无限增长
        for k in [k for k in _MODULES if k[0] == path]:
            _MODULES.pop(k, None)
        _MODULES[key] = mod
    return mod


def _load_tokens_cached(path, theme, override=None):
    key = (path, theme, json.dumps(override or {}, sort_keys=True, ensure_ascii=False))
    if key not in _TOKENS:
        _TOKENS[key] = _load_tokens_yaml(path, theme, override)
    return _TOKENS[key]


def _build_df(data):
    if not data or not data.get("columns"):
        return pd.DataFrame()
    return pd.DataFrame(data.get("rows", []), columns=data["columns"])


def _make_figure(spec):
    tokens = _load_tokens_cached(spec["tokensPath"], spec.get("theme"), spec.get("tokensOverride"))
    params = dict(spec.get("params", {}))
    params["tokens"] = tokens
    pres = spec.get("presentation") or {}
    df = _build_df(spec.get("data"))
    mod = _import_cached(spec["chartPath"])
    return build_figure(mod.create_chart, df, params, pres, tokens)


def render_case(spec_json):
    """渲染为 PNG（写入 /tmp/mensic_out.png）。"""
    import time

    t0 = time.perf_counter()
    spec = json.loads(spec_json)
    fig, dpi = _make_figure(spec)
    t1 = time.perf_counter()
    fig.savefig(OUT_PNG, format="png", dpi=dpi, facecolor=spec_facecolor(spec))
    t2 = time.perf_counter()
    plt.close(fig)
    return json.dumps({"build": round((t1 - t0) * 1000), "save": round((t2 - t1) * 1000)})


def spec_facecolor(spec):
    """保存底色与预览一致（tokens 的 figure 颜色）。"""
    try:
        return _load_tokens_cached(spec["tokensPath"], spec.get("theme"), spec.get("tokensOverride"))["color"]["figure"]
    except Exception:
        return "#ffffff"


def render_case_svg(spec_json):
    """按需渲染为 SVG（写入 /tmp/mensic_out.svg）。"""
    spec = json.loads(spec_json)
    matplotlib.rcParams["svg.fonttype"] = "none"
    fig, dpi = _make_figure(spec)
    fig.savefig(OUT_SVG, format="svg", dpi=dpi, facecolor=spec_facecolor(spec))
    plt.close(fig)
    return "svg"


# 「中文字体 / 英文字体」两个下拉框的过滤依据：**直接问字体文件有没有那个字的字形**，
# 不靠名字猜（名字里带 "Song"/"Hei" 的不一定是中文字体，名字里没中文的也可能是）。
# - 中文探针是一撮最常用的简体汉字：真中文字体（含随包 Noto Sans SC）全命中；
#   日文 / 韩文字体只有一部分字形（实测 MS Gothic 30/42、Malgun Gothic 21/42），
#   过不了这条线 —— 它们排不了中文，不该出现在「中文字体」里。
# - 拉丁探针是基本字母与数字：图标字体（Wingdings / Symbol / Segoe MDL2 / STIXSize*Sym）
#   一个都没有，从「英文字体」里筛掉。
_CJK_PROBE = "一中文汉字图数据你好月份数值相关性网络热图基本柱状折线散点饼图箱线雷达桑基日历极坐标"
_LATIN_PROBE = "Aa0.,-"
_CJK_RATIO = 0.9

_FONT_LIST_CACHE = None

# 界面上的「中文名」（「宋体」/「微软雅黑」）**不在** matplotlib 的族名里：
# `entry.name` 取的是字体 name 表里英文（Windows 语言 0x409）那条记录，font_manager
# 也不暴露其他语言。用户要中文名，就只能自己读 name 表 —— 纯 Python 解析
# （不依赖 fontTools：Pyodide 的虚拟文件系统与安卓包里都没有它）。
# 语言按「大陆 → 新加坡 → 台湾 → 香港 → 澳门」挑（同一族通常只有一条中文记录）。
_ZH_LANGS = (0x0804, 0x1004, 0x0404, 0x0C04, 0x1404)
# 名字字段：族名 → 排版族名 → 全名（个别字体前两者是英文，中文只写在全名里）
_NAME_IDS = (1, 16, 4)


def _sfnt_faces(f):
    """字体文件里每个 face 的偏移（TTC 装多个 face，ttf / otf 只有一个）。"""
    head = f.read(12)
    if len(head) < 12:
        return []
    if head[:4] != b"ttcf":
        return [0]
    n = struct.unpack(">I", head[8:12])[0]
    raw = f.read(4 * n)
    if len(raw) < 4 * n:
        return []
    return list(struct.unpack(">%dI" % n, raw))


def _sfnt_names(f, base):
    """读一个 face 的 name 表 → [(platformID, encodingID, languageID, nameID, 原始字节)]。"""
    f.seek(base)
    hdr = f.read(12)
    if len(hdr) < 12:
        return []
    count = struct.unpack(">H", hdr[4:6])[0]
    records = f.read(16 * count)
    for i in range(count):
        tag, _checksum, off, size = struct.unpack_from(">4sIII", records, 16 * i)
        if tag != b"name":
            continue
        f.seek(off)
        data = f.read(size)
        if len(data) < 6:
            return []
        _fmt, n, strings = struct.unpack_from(">HHH", data, 0)
        out = []
        for j in range(n):
            pos = 6 + 12 * j
            if pos + 12 > len(data):
                break
            pid, eid, lid, nid, length, start = struct.unpack_from(">HHHHHH", data, pos)
            out.append((pid, eid, lid, nid, data[strings + start:strings + start + length]))
        return out
    return []


def _decode_name(pid, eid, raw):
    """name 表里的字符串 → str（Windows / Unicode 记录是 UTF-16BE， encodingID 10 是 UTF-32BE）。"""
    try:
        if pid not in (0, 3):
            return None  # Mac 记录用 MacRoman，排不了中日韩，用不上
        if eid == 10:
            return raw.decode("utf-32-be").strip()
        return raw.decode("utf-16-be").strip()
    except UnicodeDecodeError:
        return None


def _names_for(records, name_ids, langs):
    """按「语言优先、字段次之」收集某个 face 的名字（去重、去空）。"""
    out = []
    for lang in langs:
        for nid in name_ids:
            for pid, eid, lid, rid, raw in records:
                if pid != 3 or lid != lang or rid != nid:
                    continue
                text = _decode_name(pid, eid, raw)
                if text and text not in out:
                    out.append(text)
    return out


def _has_han(text):
    """含汉字？个别字体的「中文记录」里其实还是英文（例如 HP Simplified Hans Light），
    那种不算中文名 —— 否则会显示成「英文名 + 样式后缀」，比原来的英文名更难认。"""
    return any("\u3400" <= ch <= "\u9fff" or "\uf900" <= ch <= "\ufaff" for ch in text)


def _font_label(path, family):
    """字体文件里的**中文名**；没有中文记录就返回 None（界面回落英文族名）。

    TTC 里的 face 与族名一一对应，必须挑对 face —— 否则「微软雅黑」会被写成
    同文件里的「微软雅黑 Light」。对不上时只在单 face 字体上兜底。
    """
    try:
        with open(path, "rb") as f:
            faces = _sfnt_faces(f)
            first = None
            for base in faces:
                records = _sfnt_names(f, base)
                if not records:
                    continue
                zh = [x for x in _names_for(records, _NAME_IDS, _ZH_LANGS) if _has_han(x)]
                if not zh:
                    continue
                if first is None:
                    first = zh[0]
                if family is None or family in _names_for(records, (1, 16), (0x0409,)):
                    return zh[0]
            return first if len(faces) <= 1 else None
    except Exception:  # 字体文件损坏 / 格式不认识：宁可显示英文名，也不要整个列表失败
        return None


def _font_coverage(path):
    """字体文件的字形覆盖 → (是否含中文, 是否含基本拉丁)；读不出来返回 None。

    ⚠️ 读不出来**不要**猜：猜「是」会把图标字体放进中文列表，猜「否」会把好字体藏起来
    （后者更糟，用户会以为机器上没这个字体）。
    """
    try:
        face = ft2font.FT2Font(path)
    except Exception:
        return None
    cjk = sum(1 for ch in _CJK_PROBE if face.get_char_index(ord(ch)))
    latin = sum(1 for ch in _LATIN_PROBE if face.get_char_index(ord(ch)))
    return (cjk >= _CJK_RATIO * len(_CJK_PROBE), latin >= len(_LATIN_PROBE) - 1)


def font_list():
    """当前渲染环境里可用的字体族 + **实测的字形覆盖**（界面据此过滤中英两个下拉框）。

    本端原生（PC 的 sidecar / 安卓的 Chaquopy）是真 CPython，matplotlib 的
    font_manager 已经扫过整台机器，所以这里能列出系统字体；
    Pyodide 的虚拟文件系统里只有随包字体，就只会返回它一个。

    返回 `[{"name": str, "label": str, "cjk": bool, "latin": bool}, ...]`（按族名排序）。
    `name` 是 matplotlib 认的族名（渲染用），`label` 是**给人看的中文名**
    （字体自带就取中文，没有就与 `name` 相同）—— 界面的下拉框显示 `label`、
    存的是 `name`。

    一次会话里字体不会变，扫一次就缓存 —— 安卓上扫整机字体不便宜。
    """
    global _FONT_LIST_CACHE
    if _FONT_LIST_CACHE is None:
        try:
            entries = list(font_manager.fontManager.ttflist)
        except Exception:  # pragma: no cover
            entries = []
        cover = {}
        labels = {}
        for entry in entries:
            if not entry.name:
                continue
            got = _font_coverage(entry.fname)
            if got is None:
                continue
            # 同一个族通常有多个文件（常规 / 粗体 / 斜体）：覆盖取并集，
            # 常规体有中文而粗体没读到，这个族仍算有中文。
            # 中文名同理，每个族读一次就够（各样式文件里的族名一致）。
            cur = cover.get(entry.name)
            cover[entry.name] = got if cur is None else (cur[0] or got[0], cur[1] or got[1])
            if entry.name not in labels:
                labels[entry.name] = _font_label(entry.fname, entry.name)
        _FONT_LIST_CACHE = [
            {"name": n, "label": labels.get(n) or n, "cjk": c, "latin": l}
            for n, (c, l) in sorted(cover.items())
        ]
    return json.dumps(_FONT_LIST_CACHE, ensure_ascii=False)


def warmup():
    """预热 matplotlib：字体字形缓存、文本布局、tight_layout、savefig 路径。

    在 Pyodide 启动后调用一次，把首次绘制的初始化成本提前到后台。
    """
    try:
        if _FONT_NAME:
            matplotlib.rcParams["font.family"] = _FONT_NAME
        matplotlib.rcParams["axes.unicode_minus"] = False
        fig = plt.figure(figsize=(3, 1.6), dpi=72)
        ax = fig.add_subplot(111)
        ax.set_title("预热 0123456789")
        ax.set_xlabel("月份")
        ax.set_ylabel("数值")
        ax.plot([0, 1, 2], [1, 3, 2])
        ax.text(0.5, 0.5, "相关性网络热图 基本柱状图", transform=ax.transAxes)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            fig.tight_layout()
        fig.savefig(os.path.join(os.path.dirname(OUT_PNG) or "/tmp", "mensic_warm.png"), format="png", dpi=72)
        plt.close(fig)
        # 预热 pandas（首个案例渲染会用到）
        pd.DataFrame({"x": [1, 2, 3], "y": [3, 2, 1]}).groupby("x").sum()
        return "ok"
    except Exception as exc:  # pragma: no cover
        return f"warmup skipped: {exc}"


# ---------------- 导出可运行包 ----------------
SHARED_BEGIN = "# ===== SHARED-RUNTIME-BEGIN ====="
SHARED_END = "# ===== SHARED-RUNTIME-END ====="

RUN_HEADER = '''# -*- coding: utf-8 -*-
"""__TITLE__ —— 可运行脚本（matplotlib）

与 mensic 界面预览使用同一套渲染逻辑（主题 / 投影 / 呈现 / tight_layout 完全一致）。
用法：
    pip install -r requirements.txt
    python run.py
输出：output.png
"""
import os
import warnings

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib import font_manager  # noqa: E402
import pandas as pd  # noqa: E402

TOKENS = __TOKENS__
PARAMS = __PARAMS__
PRESENTATION = __PRESENTATION__
DATA = "data/data.csv"
# 随包附带 CJK 字体时优先使用，保证与界面预览一致；缺失则回退到 tokens 的字体族
FONT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts", "mensic-cjk.ttf")
_FONT_NAME = None


# ===================== 与 App 同源的渲染逻辑（自动内联） =====================
__SHARED__


# ===================== 案例实现（内联） =====================
__CHART__


# ===================== 运行入口 =====================
def main():
    params = dict(PARAMS)
    params["tokens"] = TOKENS
    _setup_font()
    df = pd.read_csv(DATA)
    fig, dpi = build_figure(create_chart, df, params, PRESENTATION, TOKENS)
    fig.savefig("output.png", dpi=dpi, facecolor=TOKENS["color"]["figure"])
    print("已保存 output.png")


if __name__ == "__main__":
    main()
'''

README_TEMPLATE = """# __TITLE__

由 mensic 导出的可运行包（与界面预览同源的渲染逻辑）。

## 运行

```bash
pip install -r requirements.txt
python run.py
```

会在当前目录生成 `output.png`。

## 文件

- `run.py`     自包含运行脚本（内联案例实现与渲染逻辑，读取数据、套用主题与呈现规格、导出图片）
- `data/data.csv`  数据
- `fonts/mensic-cjk.ttf`  导出时随包的 CJK 字体（保证中文与预览一致；可删除）
- `requirements.txt`  依赖
"""


def _shared_block():
    """从自身源码里截取 SHARED-RUNTIME 区块（由 Worker 注入 _RENDER_SRC）。"""
    src = globals().get("_RENDER_SRC")
    if not isinstance(src, str):
        return ""
    a = src.find(SHARED_BEGIN)
    b = src.find(SHARED_END)
    if a < 0 or b < 0:
        return ""
    return src[a + len(SHARED_BEGIN):b].strip("\n")


def _script_text(spec):
    tokens = _load_tokens_cached(spec["tokensPath"], spec.get("theme"), spec.get("tokensOverride"))
    with open(spec["chartPath"], encoding="utf-8") as f:
        chart_src = f.read().strip()
    text = RUN_HEADER
    text = text.replace("__TITLE__", str(spec.get("title", "mensic 案例")))
    text = text.replace("__TOKENS__", repr(tokens))
    text = text.replace("__PARAMS__", repr(spec.get("params", {})))
    text = text.replace("__PRESENTATION__", repr(spec.get("presentation", {})))
    text = text.replace("__SHARED__", _shared_block())
    text = text.replace("__CHART__", chart_src)
    return text


def case_script(spec_json):
    """返回完整运行脚本 run.py 的文本。"""
    return _script_text(json.loads(spec_json))


def build_package(spec_json):
    """生成可运行包（ZIP：run.py + data/ + fonts/ + requirements.txt + README.md）。"""
    import os
    import shutil
    import zipfile

    spec = json.loads(spec_json)
    root = PKG_ROOT
    shutil.rmtree(root, ignore_errors=True)
    os.makedirs(os.path.join(root, "data"), exist_ok=True)

    with open(os.path.join(root, "run.py"), "w", encoding="utf-8") as f:
        f.write(_script_text(spec))
    with open(os.path.join(root, "data", "data.csv"), "w", encoding="utf-8") as f:
        f.write(spec.get("dataCsv", ""))

    # 随包附带 CJK 字体，保证中文渲染与预览一致
    if os.path.exists(FONT_PATH):
        os.makedirs(os.path.join(root, "fonts"), exist_ok=True)
        shutil.copyfile(FONT_PATH, os.path.join(root, "fonts", "mensic-cjk.ttf"))

    reqs = ["matplotlib", "pandas", "numpy"] + list(spec.get("requires") or [])
    with open(os.path.join(root, "requirements.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(dict.fromkeys(reqs)) + "\n")
    with open(os.path.join(root, "README.md"), "w", encoding="utf-8") as f:
        f.write(README_TEMPLATE.replace("__TITLE__", str(spec.get("title", "mensic 案例"))))

    zip_path = OUT_PKG
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for base, _dirs, files in os.walk(root):
            for name in files:
                full = os.path.join(base, name)
                z.write(full, os.path.relpath(full, root))
    return "ok"


_setup_font()
