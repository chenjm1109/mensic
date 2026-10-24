# -*- coding: utf-8 -*-
"""Chaquopy 入口：把「与桌面/导出同源」的渲染逻辑暴露给 Kotlin。

与桌面 sidecar.py 的关系：
- 桌面：sidecar.py 是**独立进程**，用 stdin/stdout 定长帧协议对外服务。
- 安卓：本文件在 App 进程内被 Kotlin 调用，直接复用 sidecar 的 `OPS`，不需要帧协议。

因此两端跑的是**同一份 render.py**，导出脚本也内联同一段 SHARED-RUNTIME —— 效果一致。
"""
import json
import os
import tempfile

# Android 没有 /tmp，tempfile 默认会失败。Chaquopy 把 HOME 指向应用私有目录。
_base = os.environ.get("HOME") or os.path.expanduser("~")
os.environ.setdefault("TMPDIR", _base)
tempfile.tempdir = _base

import sidecar  # noqa: E402  与桌面共用：负责载入 render.py、准备路径与产物位置

OPS = sidecar.OPS


def call(op, spec_json):
    """Kotlin 调用入口。返回 bytes（PNG / SVG / ZIP）或 UTF-8 文本。

    失败时抛异常，由 Kotlin 侧转成错误信息回传（对应桌面协议里的 status=1）。
    """
    fn = OPS.get(op)
    if fn is None:
        raise ValueError("未知操作：%s" % op)
    spec = json.loads(spec_json) if spec_json else None
    result = fn(spec)
    if result is None:
        result = b""
    if isinstance(result, str):
        result = result.encode("utf-8")
    return bytes(result)
