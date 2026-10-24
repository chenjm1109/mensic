import { Check, Lock, Palette, RotateCcw } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useAppName } from "@/core/i18n/useT";
import markUrl from "@/assets/mensic-mark.svg";
import { LOCALES } from "@/core/i18n";
import { PageTopBar } from "@/components/ui/page-top-bar";
import { Cell, CellGroup } from "@/components/ui/cell";
import { ColorPicker } from "@/components/ui/color-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TYPO } from "@/core/typography";
import { BRAND_PRESETS, brandLabel, isDefaultBrand } from "@/core/brand";
import { SP } from "@/core/spacing";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { sfx } from "@/sound";
import { useStore } from "@/store";

export function Settings() {
  const soundEnabled = useStore((s) => s.soundEnabled);
  const setSoundEnabled = useStore((s) => s.setSoundEnabled);
  const soundVolume = useStore((s) => s.soundVolume);
  const setSoundVolume = useStore((s) => s.setSoundVolume);
  const accent = useStore((s) => s.accent);
  const setAccent = useStore((s) => s.setAccent);
  const resetAccent = useStore((s) => s.resetAccent);
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  const locale = useStore((s) => s.locale);
  const setLocale = useStore((s) => s.setLocale);
  const appName = useAppName();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageTopBar>
        <h1 className={cn(TYPO.title, "font-bold leading-none tracking-tight")}>{t("设置")}</h1>
      </PageTopBar>

      {/* 只有内容区滚动：PageTopBar（返回按钮 + 标题）留在**不滚动的那一层**，
          否则往下滚时返回按钮会被一起带走。结构对齐 Gallery / Projects。 */}
      <div className="min-h-0 flex-1 overflow-auto [scrollbar-gutter:stable]">
        {/* ⚠️ 滚动容器必须**全宽**：滚动条要贴在**窗口**右边，而不是贴着内容。
            限宽居中与内边距都放在这一层里（max-w 千万不要挂到滚动容器上，
            否则滚动条会跑到 680 那条边上）。内边距放进来还有一个作用：
            内容仍然相对「窗口 − 边距」居中，位置与改动前完全一致。 */}
        <div className={cn("mx-auto w-full max-w-[680px]", SP.gutterX, SP.gutterBottom)}>
        {/* 外观：主题色 / 黑暗模式 / 界面语言 —— 都属于「看和说」的一类，编成一个 CellGroup */}
        <CellGroup size="md" title={t("外观")} className={SP.section}>
          <Cell
            title={
              <span className="inline-flex items-center gap-2">
                <span
                  className="grid size-5 place-items-center rounded-full border"
                  style={{ borderColor: "var(--brand-line)", background: "var(--brand-soft)" }}
                >
                  <span className="size-2.5 rounded-full" style={{ background: "var(--brand)" }} />
                </span>
                {t("主题色")}
              </span>
            }
            desc={
              <>
                {t("当前：")}
                <span className="font-medium" style={{ color: "var(--brand-strong)" }}>
                  {brandLabel(accent)}
                </span>
              </>
            }
            control={
              <button
                type="button"
                onClick={() => {
                  resetAccent();
                  sfx("notify");
                }}
                disabled={isDefaultBrand(accent)}
                className={cn(
                  TYPO.body,
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink disabled:pointer-events-none disabled:opacity-40",
                )}
              >
                <RotateCcw className="size-3.5" /> {t("恢复默认")}
              </button>
            }
          >
            <div className="mt-1 flex flex-wrap items-center gap-2.5">
              {BRAND_PRESETS.map((p) => {
                const active = accent.toLowerCase() === p.hex.toLowerCase();
                const isDefault = isDefaultBrand(p.hex);
                return (
                  <button
                    key={p.hex}
                    type="button"
                    title={isDefault ? t("{v1}（默认色，不可修改）", { v1: p.name }) : p.name}
                    onClick={() => {
                      setAccent(p.hex);
                      sfx("select");
                    }}
                    className={cn(
                      "group/sw relative grid size-9 place-items-center rounded-full border transition-all",
                      active ? "border-transparent ring-2 ring-offset-2 ring-offset-background" : "border-line hover:scale-105",
                    )}
                    style={
                      active
                        ? { boxShadow: `inset 0 0 0 3px var(--surface)`, background: p.hex, ["--tw-ring-color" as string]: p.hex }
                        : { background: p.hex }
                    }
                  >
                    <AnimatePresence initial={false}>
                      {active && (
                        <motion.span
                          key="check"
                          initial={{ opacity: 0, scale: 0.5 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.6 }}
                          transition={{ type: "spring", stiffness: 420, damping: 28 }}
                          className="grid place-items-center"
                        >
                          <Check className="size-4 text-white" strokeWidth={3} />
                        </motion.span>
                      )}
                    </AnimatePresence>
                    {isDefault && !active && (
                      <span className="absolute -bottom-0.5 -right-0.5 grid size-3.5 place-items-center rounded-full bg-surface text-muted-foreground shadow-[0_1px_2px_rgba(0,0,0,0.15)]">
                        <Lock className="size-2" />
                      </span>
                    )}
                  </button>
                );
              })}

              {/* 自定义颜色：与参数栏同一套取色面板（不再用系统的原生取色器） */}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    data-sfx="none"
                    className="grid size-9 place-items-center rounded-full border border-dashed border-black/15 text-ink-3 transition-colors hover:border-[var(--brand)] hover:text-[var(--brand-strong)]"
                    title={t("自定义颜色")}
                    aria-label={t("自定义颜色")}
                  >
                    <Palette className="size-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="center" sideOffset={8} className="color-popover w-[248px] p-3">
                  <ColorPicker
                    value={accent}
                    onChange={(c) => {
                      setAccent(c);
                      sfx("notify");
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </Cell>

          <Cell
            title={t("黑暗模式")}
            control={<Switch checked={mode === "dark"} onCheckedChange={(v) => setMode(v ? "dark" : "light")} />}
          />

          <Cell
            title={t("界面语言")}
            control={
              <div className="flex items-center gap-1 rounded-full border border-line bg-surface p-1">
                {LOCALES.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => {
                      setLocale(l.id);
                      sfx("notify");
                    }}
                    className={cn(
                      TYPO.body,
                      "rounded-full px-3.5 py-1 transition-colors",
                      locale === l.id
                        ? "bg-[var(--brand-soft)] font-medium text-[var(--brand-deep)]"
                        : "text-ink-3 hover-sketch",
                    )}
                  >
                    {l.nativeLabel}
                  </button>
                ))}
              </div>
            }
          />
        </CellGroup>

        {/* 声音：开关 / 音量 —— 同一个功能的两项 */}
        <CellGroup size="md" title={t("声音")} className={SP.section}>
          <Cell
            title={t("界面音效")}
            control={<Switch checked={soundEnabled} onCheckedChange={setSoundEnabled} />}
          />
          <Cell
            title={t("音量")}
            control={<span className={cn(TYPO.body, "tabular-nums text-ink-3")}>{soundVolume}%</span>}
          >
            <Slider
              className={cn("mt-1", !soundEnabled && "pointer-events-none opacity-40")}
              value={[soundVolume]}
              min={0}
              max={100}
              step={1}
              onValueChange={(v) => setSoundVolume(v[0])}
              onValueCommit={() => sfx("select")}
            />
          </Cell>
        </CellGroup>

        {/* 关于：应用名 + 版本 */}
        <CellGroup size="md" title={t("关于")} className={SP.section}>
          <Cell
            icon={<img src={markUrl} alt="" aria-hidden="true" className="size-4" />}
            title={appName}
            desc={t("数据可视化笔记本")}
          />
          <Cell
            title={t("版本")}
            control={<span className={cn(TYPO.body, "px-1.5 font-medium text-ink-2")}>v0.1.0</span>}
          />
        </CellGroup>
        </div>
      </div>
    </div>
  );
}
