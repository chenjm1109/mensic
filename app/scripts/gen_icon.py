"""生成 mensic 应用图标源图（1024x1024 PNG）。"""

from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Rectangle

fig = plt.figure(figsize=(10.24, 10.24), dpi=100)
ax = fig.add_axes([0, 0, 1, 1])
ax.set_xlim(0, 100)
ax.set_ylim(0, 100)
ax.axis("off")

# 蓝色圆角底
ax.add_patch(
    FancyBboxPatch(
        (6, 6),
        88,
        88,
        boxstyle="round,pad=0,rounding_size=22",
        facecolor="#3B82F6",
        edgecolor="none",
    )
)

# 白色柱状图
bars = [(26, 30), (42, 46), (58, 62), (74, 78)]
for x, h in bars:
    ax.add_patch(Rectangle((x, 26), 10, h - 26, facecolor="#FFFFFF", edgecolor="none"))

out = Path("src-tauri/app-icon.png")
out.parent.mkdir(parents=True, exist_ok=True)
fig.savefig(out, transparent=True)
print(f"saved {out}")
