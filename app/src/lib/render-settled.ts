/**
 * 等「渲染高峰」过去再执行下一步。
 *
 * 场景：一次切页/进文件夹时，目标内容（几十张纸卡 + 图片上屏 + 滤镜光栅化）挂载会持续掉帧
 * （实测要 300~700ms）。如果这时候就把「盖子」（过场纸层）撤掉，用户看到的就是
 * 「内容在盖子后面一帧一帧长出来」。所以要等高峰过去再撤。
 *
 * 判据用**时间窗**而不是「连续两帧正常」：卡顿之间常有短暂空隙，后者会误判。
 * 连续 `quietMs` 没有出现 > `jankMs` 的帧，或总时长超过 `capMs`，就回调。
 *
 * ⚠️ 页面被遮挡时 rAF 会完全停摆，所以除了 rAF 还挂一个 `setTimeout` 兜底
 * （定时器在后台仍会触发），保证任何环境下都不会卡住不动。
 *
 * @returns 取消函数
 */
export function whenRenderSettled(
  cb: () => void,
  opts?: { quietMs?: number; jankMs?: number; capMs?: number },
): () => void {
  const quietMs = opts?.quietMs ?? 100;
  const jankMs = opts?.jankMs ?? 24;
  const capMs = opts?.capMs ?? 900;

  let raf = 0;
  let timer = 0;
  let done = false;
  let last = performance.now();
  let lastJanky = last;
  const started = last;

  const finish = () => {
    if (done) return;
    done = true;
    if (raf) cancelAnimationFrame(raf);
    if (timer) window.clearTimeout(timer);
    cb();
  };

  const tick = () => {
    const now = performance.now();
    const dt = now - last;
    last = now;
    if (dt > jankMs) lastJanky = now; // 这一帧卡了 → 重新计时
    if (now - lastJanky > quietMs || now - started > capMs) {
      finish();
      return;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  timer = window.setTimeout(finish, capMs + 250);

  return () => {
    done = true;
    if (raf) cancelAnimationFrame(raf);
    if (timer) window.clearTimeout(timer);
  };
}
