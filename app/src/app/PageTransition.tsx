import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { useStore } from "@/store";
import { whenRenderSettled } from "@/lib/render-settled";

/**
 * 页面切换动效（Motion 共享布局 / shared layout）：
 * 首页那根柱子与全屏纸层共用同一个 `layoutId`，点击时柱子卸载、纸层挂载，
 * 由 Motion 在两处布局间自动插值 —— 视觉上「柱子展开成一张整纸」，随后淡出露出目标页。
 *
 * 四个入口的纸色都一样（都是白纸），所以过场层不再按入口换色。
 */
export function PageTransition() {
  const t = useStore((s) => s.pageTransition);
  const page = useStore((s) => s.page);
  const setPage = useStore((s) => s.setPage);
  const clear = useStore((s) => s.clearPageTransition);
  const [phase, setPhase] = useState<"expand" | "fade">("expand");

  // 每次新过渡都从「展开」阶段开始
  useEffect(() => {
    if (t) setPhase("expand");
  }, [t]);

  /**
   * 「被子」的关键：**等目标页画完再撤**，不是按固定时间撤。
   *
   * 目标页（图鉴那种几十张图的列表）挂载、布局、图片上屏、纸张滤镜光栅化加起来会持续卡一段时间
   * （实测：卡片 419ms 就位，但卡顿一直拖到 ~700ms）。被子若在这段里就淡出，
   * 用户看到的就是「内容在被子后面一帧一帧长出来」。
   *
   * 判据见 `@/lib/render-settled`（连续 100ms 无 >24ms 的帧，最多 900ms 兜底）。
   */
  useEffect(() => {
    if (!t || page !== t.to || phase !== "expand") return;
    return whenRenderSettled(() => setPhase("fade"));
  }, [t, page, phase]);

  /**
   * ⚠️ 兜底时序：**不能只靠动画回调**。
   *
   * 正常路径是「共享布局动画跑完 → onLayoutAnimationComplete 切页面 → 等目标页画完 → 淡出 →
   * onAnimationComplete 撤纸」。但只要那个布局动画没跑完（环境差异 / 被其它动画打断），
   * 两个回调都不会触发 —— 结果是**页面永远不切、纸层永远留在最上层**
   * （`fixed` 盖住内容区，虽然 opacity 已经是 0，但照样吃掉点击，整个应用像死了一样）。
   * 所以按同一套时序加两条定时兜底：切换 320ms、撤纸 1500ms（比「展开 + 等就绪 + 淡出」的最坏情况还长）。
   * 正常时回调先跑，这两条只是幂等的空操作。
   */
  useEffect(() => {
    if (!t) return;
    const swap = window.setTimeout(() => setPage(t.to), 320);
    const done = window.setTimeout(() => clear(), 1500);
    return () => {
      window.clearTimeout(swap);
      window.clearTimeout(done);
    };
  }, [t, setPage, clear]);

  if (!t) return null;

  return (
    <motion.div
      key={`page-transition-${t.motif}`}
      layoutId={`entry-${t.motif}`}
      // 桌面端只盖**内容区**：顶部标题栏（拖动区 + 设置 / 最小化 / 关闭）必须始终露着。
      // `--titlebar-h` 由 Titlebar 挂在 <html> 上，网页 / 安卓端未设置，回退为 0。
      className="fixed inset-x-0 bottom-0 top-[var(--titlebar-h,0px)] z-40"
      style={{ willChange: "transform, opacity" }}
      initial={false}
      animate={{ opacity: phase === "fade" ? 0 : 1 }}
      transition={{
        opacity: { duration: 0.16, ease: [0.4, 0, 0.2, 1] },
        // 快速缓出（easeOutExpo），干脆无拖尾
        layout: { type: "tween", duration: 0.28, ease: [0.16, 1, 0.3, 1] },
      }}
      onLayoutAnimationComplete={() => {
        if (page !== t.to) setPage(t.to);
      }}
      onAnimationComplete={() => {
        if (phase === "fade") clear();
      }}
    >
      {/* 纸层：主题色（品牌红）整纸铺满，进场时圆角由柱子的圆角收平，
          配合尺寸形变营造「纸卡展开成整纸」—— 与最早那版全屏动效一致（只取主题色，不再分蓝/粉）。 */}
      <motion.div
        className="absolute inset-0"
        style={{ background: "linear-gradient(165deg, var(--brand-soft) 0%, var(--brand) 100%)" }}
        initial={{ borderRadius: 14 }}
        animate={{ borderRadius: 0 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      />
    </motion.div>
  );
}
