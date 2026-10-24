import type { CaseProject } from "@/core/types";
import type { GalleryCase } from "@/gallery";

/**
 * 「案例的呈现规格 ⊕ 项目的覆盖」→ 真正发给渲染器的 `presentation`。
 *
 * 纯函数、不碰任何资源：`scripts/check-presentation-merge.ts` 直接拿它做回归
 * （合并规则很容易写成「整块替换」，而那次 bug 的后果是：改个刻度朝向就把案例的
 * 主/次刻度间隔冲掉，图上的小刻度直接消失）。
 *
 * 规则：
 *  - `xlabel` / `ylabel` / `legend`：整块覆盖（项目的值就是最终值）；
 *  - `limits`：**逐轴**合并（案例可能只给了一侧；写 `null` = 明确去掉该轴范围）；
 *  - `ticks`：**逐键**合并（案例常有 `x_major` / `x_minor`，项目只改 `direction` 时不能丢）；
 *  - `canvas`：按项目画布尺寸 + 案例 dpi 换算（`presentation` 里的 canvas 只是画布，不是覆盖项）；
 *  - 标题由界面另存，不进来。
 */
export function presentationFor(
  c: Pick<GalleryCase, "presentation" | "canvas">,
  project: Pick<CaseProject, "presentation" | "canvas">,
): Record<string, unknown> {
  // 以案例的呈现规格为底，去掉标题；再用项目的覆盖项覆盖；最后按画布尺寸换算
  const base: Record<string, unknown> = { ...(c.presentation ?? {}) };
  delete base.title;
  // 案例自带的 ticks 要先存下来：项目的 ticks 是**部分覆盖**（例如只写 direction），
  // 只改刻度朝向时不能把案例的 x_major / x_minor（主/次刻度间隔）冲掉。
  const caseTicks = (base.ticks as Record<string, unknown> | undefined) ?? {};
  const p = (project.presentation ?? {}) as unknown as Record<string, unknown>;
  for (const k of ["xlabel", "ylabel", "legend"] as const) {
    if (p[k] !== undefined) base[k] = p[k];
  }
  // limits 要**逐轴**合并：案例可能只给了一侧（如百分比堆叠图的 y = [0,110]），
  // 用户只改另一侧时不能把案例那侧一起丢掉。写 null 表示明确去掉该轴范围。
  if (p.limits !== undefined) {
    const merged = { ...((base.limits as Record<string, unknown>) ?? {}), ...(p.limits as Record<string, unknown>) };
    for (const k of Object.keys(merged)) if (merged[k] === null) delete merged[k];
    base.limits = merged;
  }
  // ticks 逐键合并：案例的 x_major / x_minor（散点图 5 / 1 这种）必须留着。
  if (p.ticks !== undefined) {
    base.ticks = { ...caseTicks, ...(p.ticks as Record<string, unknown>) };
  }
  const dpi = c.canvas?.dpi ?? 150;
  base.canvas = { size: [project.canvas.width / dpi, project.canvas.height / dpi], dpi };
  return base;
}
