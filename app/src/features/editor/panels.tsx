import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import { ChevronRight, Database, Frame, List, RotateCcw, Ruler, SlidersHorizontal, Type } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Copy } from "@/components/animate-ui/icons/copy";
import { Download } from "@/components/animate-ui/icons/download";
import { Button } from "@/components/ui/button";
import { Cell, CellGroup } from "@/components/ui/cell";
import { ColorSwatch } from "@/components/ui/color-picker";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { TYPO } from "@/core/typography";
import { CodeBlock } from "@/components/CodeBlock";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ImportDialog } from "@/features/import/ImportDialog";
import type { TemplateDrift } from "@/gallery/template-ref";
import { ZoomPane } from "@/features/editor/ZoomPane";
import type { CaseParam, GalleryCase } from "@/gallery";
import { assetUrl } from "@/gallery";
import {
  enumLabel,
  legendLocLabel,
  PARAM_HINTS,
  paramLabel,
} from "@/features/editor/labels";
import type { Canvas, CaseCapabilities, CaseProject, CaseSchemaColumn, DataSet, ElementStyle, Presentation, ProjectSource, TokensOverride } from "@/core/types";
import { effectiveOpacity, effectiveSize, sameNumber, type ElementGroup } from "@/features/editor/elements";
import {
  DEFAULT_TOKEN_DEFAULTS,
  effectivePalette,
  parseTokenDefaults,
  type TokenDefaults,
} from "@/features/editor/chartStyle";
/** 中文字体 / 英文字体用可搜索下拉（本机字体上百个，见 components/ui/combobox.tsx） */
import { Combobox } from "@/components/ui/combobox";
import { useFontList, ensureFonts } from "@/features/editor/fonts";
import type { FontFamily } from "@/renderers/types";
import { ToolbarButton } from "@/components/ui/toolbar-button";
import { notify } from "@/components/ui/toast";
import { readClipboardText, writeClipboardText } from "@/core/clipboard";
import { parseHexColor } from "@/components/ui/color-picker";
import { Copy as CopyIcon } from "@/components/animate-ui/icons/copy";
import { ClipboardPaste } from "lucide-react";
import { saveFileAs } from "@/platform";
import { sfx } from "@/sound";

/* ---------------- 手风琴分区 ---------------- */

const AccordionCtx = createContext<{ open: string | null; setOpen: (id: string | null) => void } | null>(null);

/**
 * 手风琴容器：同一时刻只展开一个分区。
 * Section 也可以不放在其中单独使用（回退为各自独立展开/收起）。
 */
export function Accordion({ children, initial = null }: { children: React.ReactNode; initial?: string | null }) {
  const [open, setOpen] = useState<string | null>(initial);
  return <AccordionCtx.Provider value={{ open, setOpen }}>{children}</AccordionCtx.Provider>;
}

/**
 * 可折叠分区：点标题展开；放在 Accordion 里时，展开一个会自动收起其它。
 * ⚠️ 标题行**不放任何操作按钮**（例如「重置」）—— 分区标题只负责展开/收起。
 */
function Section({
  title,
  icon,
  children,
  defaultOpen = true,
}: {
  title: string;
  /** 标题前的小图标（手风琴每个分区都给一个，便于扫读） */
  icon?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const acc = useContext(AccordionCtx);
  const [looseOpen, setLooseOpen] = useState(defaultOpen);
  const open = acc ? acc.open === title : looseOpen;
  const sectionRef = useRef<HTMLElement>(null);

  const toggle = () => {
    if (!acc) {
      setLooseOpen((o) => !o);
      return;
    }
    const next = acc.open === title ? null : title;
    acc.setOpen(next);
    // 上面的分区收起会让标题上移，展开后把它滚回视野内
    if (next) requestAnimationFrame(() => sectionRef.current?.scrollIntoView({ block: "nearest" }));
  };

  return (
    <section ref={sectionRef} className="border-b border-border transition-colors duration-200 last:border-b-0">
      {/* 标题整条都可以点：内边距做在按钮里，所以整行（除右侧操作按钮外）都是点击热区 */}
      <div className="flex items-stretch">
        {/* ⚠️ 这里**不要**写 data-sfx：全站音效由 SoundProvider 的全局 pointerdown 处理器统一播，
            写了 none 就等于静音（之前手风琴没声音就是这个原因）。展开/收起按普通按钮处理 → tap。 */}
        <button
          type="button"
          aria-expanded={open}
          onClick={toggle}
          className="hover-sketch flex min-w-0 flex-1 items-center gap-1.5 px-4 py-3 text-left"
        >
          <ChevronRight
            className={cn(
              "size-3.5 shrink-0 transition-transform duration-200",
              open ? "rotate-90 text-[var(--brand-strong)]" : "text-muted-foreground",
            )}
          />
          {icon && (
            <span
              className={cn(
                "shrink-0 [&_svg]:size-3.5",
                open ? "text-[var(--brand-strong)]" : "text-muted-foreground",
              )}
              aria-hidden="true"
            >
              {icon}
            </span>
          )}
          <h3
            className={cn(
              TYPO.label,
              "truncate font-medium",
              open ? "text-[var(--brand-strong)]" : "text-foreground",
            )}
          >
            {title}
          </h3>
        </button>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            {/* 标题与内容之间的间距 = 这里 + 上面按钮的 pb（现在 2 + 12 = 14px，与改动前一致）。
                ⚠️ 底部**不要**再加 pb：最后那个 Cell 自己已有 py-2，再多一层 16px 就会在
                   「最后一个 Cell ↔ 下一个手风琴标题」之间多出一段空隙，看着不协调。 */}
            <div className="flex flex-col gap-3 px-4 pt-0.5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/** 参数区里数字输入框的统一样式（聚焦时用主题色描边）。
 *  设置项的行布局一律走 `Cell`（components/ui/cell.tsx），这里只管输入框本身。 */
const numberInputClass = cn(
  TYPO.label,
  "h-7 w-[72px] shrink-0 rounded-md border border-line bg-surface px-2 text-right tabular-nums text-foreground outline-none transition-colors focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20",
);

/**
 * 「恢复默认」——全应用**唯一**的一处恢复入口：
 * 放在控件**左侧**，只在「当前值 ≠ 默认值」时出现（不占位、不推挤右边的控件，
 * 因为右列是右对齐的：图标往左长出标题列，输入框自身不动）。
 *
 * 不要再用别的方式恢复：行内右侧小按钮、块级「已自定义 / 恢复默认」行、取色面板里的按钮，
 * 都统一到这里（见 AGENTS.md「恢复默认」一节）。
 */
export function RestoreButton({ show, onClick }: { show: boolean; onClick: () => void }) {
  if (!show) return null;
  return (
    <Button
      variant="ghost"
      size="iconSm"
      // ⚠️ `-ml-[38px]` = 自身 32px（iconSm）+ 控件列的 6px 间距：图标在布局上**不占宽度**。
      // 否则它一出现就把同一行的输入框 / 下拉压窄（数字显示不全，画布尺寸踩过）。
      // 图标因此会向左伸出控件列、盖到标题列靠右的空白处 —— 这正是「图标不占位」的做法。
      className="-ml-[38px] shrink-0 text-ink-4 hover:text-ink-2"
      title={t("恢复默认")}
      onClick={onClick}
    >
      <RotateCcw className="size-3.5" />
    </Button>
  );
}

/** 提交式输入：本地态，失焦/回车才提交 —— 减少输入过程中的重渲染 */
function CommitInput({
  value,
  type = "text",
  min,
  max,
  step,
  className,
  onCommit,
}: {
  value: unknown;
  type?: "text" | "number";
  min?: number;
  max?: number;
  step?: number;
  /** 额外样式：数字框传 `numberInputClass`（固定宽 + 右对齐），否则宽度会被「恢复默认」图标压扁 */
  className?: string;
  onCommit: (v: string | number) => void;
}) {
  const [local, setLocal] = useState(String(value ?? ""));
  useEffect(() => {
    setLocal(String(value ?? ""));
  }, [value]);

  const commit = () => {
    if (type === "number") {
      const n = Number(local);
      if (!Number.isNaN(n)) onCommit(n);
    } else {
      onCommit(local);
    }
  };

  return (
    <Input
      type={type}
      min={min}
      max={max}
      step={step}
      className={className}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          commit();
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

/* ---------------- 数据 ---------------- */

export function DataPanel({
  name,
  onRename,
  data,
  schema,
  mapping,
  source,
  onApply,
  drift,
  onAlignTemplate,
}: {
  /** 项目名称（可直接在「数据」分区顶部改） */
  name: string;
  onRename: (name: string) => void;
  data: DataSet;
  /** 当前案例的数据列定义：驱动导入向导的「字段匹配」步骤 */
  schema: CaseSchemaColumn[];
  /** 角色 → 列名（只用来体检：数据表格里删了某一列之后，这里要能提示） */
  mapping: Record<string, string>;
  /** 工程里存档的数据源：没有它「重选数据」就没得重选 */
  source?: ProjectSource;
  /** 导入 / 重选的结果：有效数据 + 角色映射 + 存档的数据源 */
  onApply: (data: DataSet, mapping: Record<string, string>, source: ProjectSource) => void;
  /** 模板对齐情况：模板改过就提醒（见 gallery/template-ref.ts） */
  drift?: TemplateDrift;
  /** 点「按当前模板对齐」：把这个项目的 templateRef 更新到当前模板版本 */
  onAlignTemplate?: () => void;
}) {
  const [importOpen, setImportOpen] = useState(false);

  // 体检：某个角色既没有映射到的列、也没有案例期望的同名列 → 图表会缺这一列
  const missing =
    data.columns.length === 0
      ? []
      : schema.filter((s) => {
          const mapped = mapping[s.role];
          return !(mapped && data.columns.includes(mapped)) && !data.columns.includes(s.name);
        });

  return (
    <Section title={t("数据")} icon={<Database />} defaultOpen={false}>
      {/* 换数据只有这一条路：打开后就是**上次选好的那份数据**（数据源 + 字段映射都在），
          改完映射点确认即覆盖；要换文件在弹窗里重新导入。所以「导入 / 重选」合并成一个入口。 */}
      <CellGroup
        variant="plain"
        footnote={
          <>
            {missing.length > 0 && (
              // 这是对**整组数据**的警告（不属于某一个格子），所以放组脚注；保留红色
              <span className="block text-destructive">
                {t("有 {v1} 个角色缺少对应数据列，图表可能无法渲染。", { v1: missing.length })}
              </span>
            )}
            {drift?.stale && (
              // 模板演进提醒：本项目是按模板的旧版本（或旧内容）创建的
              <span className="block">
                {drift.versionChanged
                  ? t("模板已更新（v{v1} → v{v2}）：这个项目是按 v{v1} 做的，观感对不上时请检查列与参数。", {
                      v1: drift.from ?? "?",
                      v2: drift.to ?? "?",
                    })
                  : t("模板内容有改动但版本没升（开发中）：这个项目可能对不上当前模板。")}
              </span>
            )}
          </>
        }
      >
        <Cell
          title={t("项目名称")}
          controlFill
          control={
            <CommitInput
              value={name}
              onCommit={(v) => {
                const next = String(v).trim() || t("未命名项目");
                // 没有实际改动就不要碰 updatedAt（否则点进输入框再点出来也会改排序）
                if (next !== name) onRename(next);
              }}
            />
          }
        />
        <Cell
          title={t("原始数据")}
          desc={
            source ? t("当前在用的数据源与字段映射") : t("还没有数据源；点「编辑」选择文件")
          }
          control={
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              {t("编辑")}
            </Button>
          }
        />
      </CellGroup>

      {/* 模板演进：这是一个可执行的对齐动作（不是一句话提醒） —— 确认后就按当前模板版本走 */}
      {drift?.stale && onAlignTemplate && (
        <CellGroup variant="plain">
          <Cell
            title={t("按当前模板对齐")}
            desc={
              drift.versionChanged
                ? t("模板已从 v{v1} 更新到 v{v2}", { v1: drift.from ?? "?", v2: drift.to ?? "?" })
                : t("模板内容有改动（开发中）")
            }
            control={
              <Button variant="outline" size="sm" onClick={onAlignTemplate}>
                {t("对齐")}
              </Button>
            }
          />
        </CellGroup>
      )}

      {/* 一个向导：带 source 打开 = 预填上次的数据 */}
      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        schema={schema}
        source={source ?? null}
        onImport={(d, m, src) => {
          onApply(d, m, src);
          sfx("drop");
        }}
      />
    </Section>
  );
}

/* ---------------- 案例参数 ---------------- */

/**
 * 带范围的数值参数：右列是可直接改的数值，下面整行铺滑块 —— 比纯数字框好拖也好改。
 * （「控件多的时候可以单独占一行」用 Cell 的 children 槽位实现，见 components/ui/cell.tsx。）
 *
 * `inline` = 紧凑档：滑块与数字框并排放在右列（不占第二行），
 * 用于「图形元素」这种要求所有行**等高**的清单（见 AGENTS.md 的图形元素一节）。
 */
function SliderCell({
  label,
  hint,
  value,
  min,
  max,
  integer,
  inline,
  restore,
  onRestore,
  onCommit,
}: {
  label: string;
  hint?: string;
  value: unknown;
  min: number;
  max: number;
  integer?: boolean;
  inline?: boolean;
  /** 显示「恢复默认」图标（当前值不等于默认值时由调用点传 true） */
  restore?: boolean;
  onRestore?: () => void;
  onCommit: (v: number) => void;
}) {
  const step = integer ? 1 : Math.max((max - min) / 100, 0.01);
  const decimals = step >= 1 ? 0 : Math.min(3, Math.max(1, String(step).split(".")[1]?.length ?? 2));
  const num = typeof value === "number" && Number.isFinite(value) ? value : min;
  const [local, setLocal] = useState(num.toFixed(decimals));
  useEffect(() => setLocal(num.toFixed(decimals)), [num, decimals]);

  const commit = () => {
    const n = Number(local);
    if (Number.isNaN(n)) {
      setLocal(num.toFixed(decimals));
      return;
    }
    const clamped = Math.min(max, Math.max(min, n));
    onCommit(integer ? Math.round(clamped) : clamped);
    setLocal(clamped.toFixed(decimals));
  };

  return (
    <Cell
      title={label}
      hint={hint}
      restore={onRestore && <RestoreButton show={restore === true} onClick={onRestore} />}
      control={
        <>
          {inline && (
            // 紧凑档：滑块 + 数值装进**一个和数字框同款的盒子**（同高 h-7、同边框、同圆角）。
            // 为什么不把滑块光秃秃放在行里：它只有 6px 高，眼睛会拿这条细线当基准，
            // 旁边 12px 的文字就显不出居中（换字体 / 换 DPI 更明显）。
            // 装成盒子后，这一行的控件和「大小」的数字框是同一个东西，行与行之间自然齐。
            <span
              className={cn(
                "flex h-7 w-[168px] shrink-0 items-center gap-1.5 self-center rounded-md border border-line bg-surface px-1.5",
                "focus-within:border-[var(--brand)] focus-within:ring-2 focus-within:ring-[var(--brand)]/20",
              )}
            >
              <Slider
                value={[num]}
                min={min}
                max={max}
                step={step}
                className="min-w-0 flex-1"
                onValueChange={([n]) => onCommit(n)}
              />
              <input
                value={local}
                inputMode="decimal"
                onChange={(e) => setLocal(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    commit();
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                className={cn(
                  TYPO.label,
                  "w-9 shrink-0 border-0 bg-transparent p-0 text-right tabular-nums text-foreground outline-none",
                )}
              />
            </span>
          )}
          {!inline && (
            <input
              value={local}
              inputMode="decimal"
              onChange={(e) => setLocal(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  commit();
                  (e.target as HTMLInputElement).blur();
                }
              }}
              className={numberInputClass}
            />
          )}
        </>
      }
    >
      {!inline && <Slider value={[num]} min={min} max={max} step={step} onValueChange={([n]) => onCommit(n)} />}
    </Cell>
  );
}

function renderControl(def: CaseParam, value: unknown, onParam: (k: string, v: unknown) => void) {
  switch (def.type) {
    case "bool":
      return <Switch checked={value === true} onCheckedChange={(v) => onParam(def.key, v)} />;
    case "select":
    case "enum": {
      // select 给的是 {value,label}；enum 给的是纯字符串（如 kernel: linear/rbf/poly）
      const raw = (def.options ?? []) as unknown[];
      const opts = raw.map((o) =>
        typeof o === "string" ? { value: o, label: enumLabel(def.key, o) } : (o as { value: string; label: string }),
      );
      return (
        <Select value={String(value ?? "")} onValueChange={(v) => onParam(def.key, v)}>
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {opts.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    case "number":
    case "integer":
      return (
        <CommitInput
          type="number"
          className={numberInputClass}
          value={value}
          min={def.min}
          max={def.max}
          step={def.type === "integer" ? 1 : undefined}
          onCommit={(v) => onParam(def.key, v)}
        />
      );
    default:
      return <CommitInput value={value} onCommit={(v) => onParam(def.key, v)} />;
  }
}

/* ---------------- 图形元素（颜色 / 大小 / 透明度） ---------------- */

/**
 * 一个图形元素的配置块：**颜色 / 大小 / 透明度**。
 *
 * 这是本分区唯一的一套实现 —— 分组图表里每个分组各挂一块（互不影响），
 * 单组图表（基本散点图）只有一块。所以这里只管「一块长什么样」，
 * 分组拆解在 `features/editor/elements.ts`（与调色板同一套分组口径）。
 *
 * 三条行规（都是为了「整列看起来是一套」）：
 *  1. **行高一致**：三行都在同一个 `CellGroup` 里，控件高度由 `Cell` 统一（见 cell.tsx 的 min-h-8）；
 *  2. **控件都贴右边缘**：颜色 / 大小 / 透明度 / 其余开关的右缘落在同一条竖线上；
 *     「恢复默认」走 `Cell` 的 `restore`（`RestoreButton` 自带负外边距、布局上不占宽度），
 *     不要另起一行、也不要塞进控件列；
 *  3. **改回默认就不留覆盖**：大小 / 透明度等于模板默认值时清除覆盖，颜色在取色面板里挑回默认色即可。
 */
export function ElementStyleGroup({
  title,
  group,
  fallbackColor,
  onChange,
}: {
  title: string;
  group: ElementGroup;
  /** 主题色板里这一组的颜色（没覆盖时显示它） */
  fallbackColor: string;
  onChange: (patch: ElementStyle) => void;
}) {
  // 模板没声明、用户也没改过的项不出现（模板说这张图没有这个配置项）
  const hasSize = group.defaultSize !== undefined || group.style.size !== undefined;
  const hasOpacity = group.defaultOpacity !== undefined || group.style.opacity !== undefined;
  if (!group.hasColor && !hasSize && !hasOpacity) return null;

  return (
    <CellGroup variant="plain" title={title}>
      {group.hasColor && (
        <ColorField
          label={t("颜色")}
          value={group.style.color}
          fallback={fallbackColor}
          onChange={(c) => onChange({ color: c })}
        />
      )}
      {hasSize && (
        <Cell
          title={t("大小")}
          restore={<RestoreButton show={group.style.size !== undefined} onClick={() => onChange({ size: undefined })} />}
          control={
            /* 大小不设上下限：显示真正在用的值，想填多大就填多大 */
            <OptNumber
              value={effectiveSize(group)}
              onCommit={(n) => onChange({ size: n === undefined || n === group.defaultSize ? undefined : n })}
            />
          }
        />
      )}
      {hasOpacity && (
        <SliderCell
          label={t("透明度")}
          inline
          value={effectiveOpacity(group) ?? 0}
          min={0}
          max={1}
          restore={group.style.opacity !== undefined}
          onRestore={() => onChange({ opacity: undefined })}
          onCommit={(n) => onChange({ opacity: sameNumber(n, group.defaultOpacity) ? undefined : n })}
        />
      )}
    </CellGroup>
  );
}

/** 图形元素分区：元素配置块（按分组展开）+ 其余与外观无关的案例参数 */
export function ElementsPanel({
  groups,
  params,
  values,
  onParam,
  onStyle,
  paletteOverride,
}: {
  groups: ElementGroup[];
  /** 其余的案例参数（被元素接管的那些不再单独出现） */
  params: CaseParam[];
  values: Record<string, unknown>;
  onParam: (k: string, v: unknown) => void;
  onStyle: (elementKey: string, groupKey: string, patch: ElementStyle) => void;
  /** 主题覆盖：算元素颜色的默认值（色板）用 */
  paletteOverride: TokensOverride | undefined;
}) {
  const defs = useTokenDefaults();
  if (groups.length === 0 && params.length === 0) return null;
  const elementCount = new Set(groups.map((g) => g.elementKey)).size;
  const multiElement = elementCount > 1;
  const count = Math.max(groups.length, 1);
  const palette = effectivePalette(paletteOverride, defs.palette, count);

  return (
    <Section title={t("图形元素")} icon={<SlidersHorizontal />}>
      {/* ⚠️ 元素块与「其余参数」是**同一个清单的两段**：分区级的 gap（gap-3）不能插在它们之间，
          否则参数行会和上面的行差出一截，看着像贴错了地方（只用一条发丝分隔线就够）。
          多个元素块（分组图表）之间仍然保留分区级间距。 */}
      <div className="flex flex-col">
        <div className="flex flex-col gap-3">
          {groups.map((g) => (
            <ElementStyleGroup
              key={`${g.elementKey}:${g.groupKey}`}
              // 多个元素都分组时，标题必须带上元素名，否则「数据点 A」和「边际分布 A」会重名。
              // 单元素分组只显示组名（与散点图的既有观感一致）。
              title={
                multiElement
                  ? g.groupKey === "*"
                    ? g.elementLabel
                    : `${g.elementLabel} · ${g.label}`
                  : g.label
              }
              group={g}
              fallbackColor={palette[g.paletteIndex] ?? "#888888"}
              onChange={(patch) => onStyle(g.elementKey, g.groupKey, patch)}
            />
          ))}
        </div>
        {params.length > 0 && (
          // 接在元素块下面：补一条同样的分隔线（两个 plain 组之间本来没有）
          <CellGroup
            variant="plain"
            controlWidth="168px"
            boxClassName="[&>*:first-child]:border-t [&>*:first-child]:border-line-2"
          >
          {params.map((def) => {
            const v = values[def.key];
            const label = paramLabel(def.key);
            const changed = v !== def.default;
            if ((def.type === "number" || def.type === "integer") && typeof def.min === "number" && typeof def.max === "number") {
              return (
                <SliderCell
                  key={def.key}
                  label={label}
                  hint={PARAM_HINTS[def.key]}
                  value={v}
                  min={def.min}
                  max={def.max}
                  integer={def.type === "integer"}
                  restore={changed}
                  onRestore={() => onParam(def.key, def.default)}
                  onCommit={(n) => onParam(def.key, n)}
                />
              );
            }
            return (
              <Cell
                key={def.key}
                title={label}
                restore={<RestoreButton show={changed} onClick={() => onParam(def.key, def.default)} />}
                control={renderControl(def, v, onParam)}
              />
            );
          })}
          </CellGroup>
        )}
      </div>
    </Section>
  );
}

/** 网格线：可选的线型，以及样式默认值 */
const GRID_STYLES = [
  { value: "-", label: "实线" },
  { value: "--", label: "虚线" },
  { value: ":", label: "点线" },
  { value: "-.", label: "点划线" },
];
/** 线型 / 线宽的「模板默认」（tokens.yaml 里 grid.width = 0.5；线型用 matplotlib 默认的实线） */
const GRID_STYLE_DEFAULT = "-";
const gridWidthDefault = (defs: TokenDefaults) => defs.gridWidth ?? 0.5;

/**
 * 绘图区边框的四条边（顺序固定：上 / 下 / 左 / 右）。
 *
 * `pos` 只决定按钮在 2 行网格里的位置 —— 按钮**按边的实际方位摆放**：
 * 上在第一行、下在第二行；左 / 右分别跨两行，做成竖排按钮放在两侧。
 */
const FRAME_SIDES = [
  { key: "top" as const, label: "上", pos: "col-start-2 row-start-1" },
  { key: "bottom" as const, label: "下", pos: "col-start-2 row-start-2" },
  { key: "left" as const, label: "左", pos: "col-start-1 row-start-1 row-span-2" },
  { key: "right" as const, label: "右", pos: "col-start-3 row-start-1 row-span-2" },
];

/**
 * 四条边现在各自显示吗（没写过 = 显示，和渲染器一致）。
 *
 * ⚠️ 界面已撤掉「整圈开关」（`frame.on`），改成直接控制四条边；但旧项目里可能还写着它，
 * 所以这里仍要算进来：`on: false` = 四边全藏。
 */
function frameSideState(ov: TokensOverride | undefined): Record<"top" | "bottom" | "left" | "right", boolean> {
  const master = ov?.frame?.on ?? true;
  const spines = ov?.frame?.spines ?? {};
  return {
    top: master && (spines.top ?? true),
    bottom: master && (spines.bottom ?? true),
    left: master && (spines.left ?? true),
    right: master && (spines.right ?? true),
  };
}

/* ---------------- 页面尺寸（统一参数） ---------------- */
export function PageSizePanel({
  canvas,
  onChange,
  override,
  onPatch,
  defaultSize,
  theme,
}: {
  canvas: Canvas;
  onChange: (patch: Partial<Canvas>) => void;
  /** 主题覆盖（页面背景用的就是 tokens 里的 `color.figure`，即 matplotlib 的 figure.facecolor） */
  override: TokensOverride | undefined;
  onPatch: (patch: TokensOverride) => void;
  /** 案例自带的画布尺寸（「恢复默认」回到它） */
  defaultSize?: Canvas;
  /** 当前主题预设：算「默认是什么颜色」要按它解析 */
  theme?: string;
}) {
  const clamp = (v: number) => Math.min(4000, Math.max(200, Math.round(v)));
  const defs = useTokenDefaults(theme);
  const color = override?.color ?? {};
  const ov = override;
  const sizeChanged = !!defaultSize && (canvas.width !== defaultSize.width || canvas.height !== defaultSize.height);
  // 边框是「逐边直接控制」（没有整圈开关了），网格默认是「不接管」（很多模板自己画网格，见 AGENTS.md）
  const sides = frameSideState(ov);
  const gridOn = ov?.grid?.on ?? false;

  /**
   * 点某条边：显示 = 不写覆盖，隐藏 = 写 false（和别处一样不留「和默认一样」的脏数据）。
   * 顺带把旧的整圈开关（`frame.on`）展开成四条边的明确值 —— 界面已没有它，留着会一直压住边线。
   */
  const toggleFrameSide = (side: "top" | "bottom" | "left" | "right", visible: boolean) => {
    const spines: NonNullable<NonNullable<TokensOverride["frame"]>["spines"]> = {};
    for (const s of FRAME_SIDES) {
      const on = s.key === side ? visible : sides[s.key];
      if (!on) spines[s.key] = false;
    }
    onPatch({
      frame: {
        on: undefined,
        spines: Object.keys(spines).length > 0 ? spines : undefined,
      },
    });
  };
  return (
    <Section title={t("页面")} icon={<Frame />} defaultOpen={false}>
      {/* 画布 = 整张图（matplotlib 的 figure.facecolor，存 PNG/SVG 也用它） */}
      <CellGroup variant="plain" title={t("画布")} controlWidth="168px">
        <Cell
          title={t("画布尺寸")}
          restore={defaultSize && <RestoreButton show={sizeChanged} onClick={() => onChange({ width: defaultSize.width, height: defaultSize.height })} />}
          control={
            <>
              <CommitInput
                type="number"
                className={numberInputClass}
                value={canvas.width}
                min={200}
                max={4000}
                step={10}
                onCommit={(v) => onChange({ width: clamp(Number(v)) })}
              />
              <span className={cn(TYPO.label, "shrink-0 text-muted-foreground")}>×</span>
              <CommitInput
                type="number"
                className={numberInputClass}
                value={canvas.height}
                min={200}
                max={4000}
                step={10}
                onCommit={(v) => onChange({ height: clamp(Number(v)) })}
              />
            </>
          }
        />
        <ColorField
          label={t("画布背景色")}
          value={color.figure}
          fallback={defs.color.figure ?? "#ffffff"}
          onChange={(v) => onPatch({ color: { figure: v } })}
        />
      </CellGroup>

      {/* 绘图区 = 坐标轴里那块（axes.facecolor） + 它那圈边框。
          边框**没有整圈开关**：四条边各自显示 / 隐藏，「全显示」就是不写覆盖。 */}
      <CellGroup variant="plain" title={t("绘图区")} controlWidth="168px">
        <ColorField
          label={t("绘图区背景色")}
          value={color.axes}
          fallback={defs.color.axes ?? "#fefaf9"}
          onChange={(v) => onPatch({ color: { axes: v } })}
        />
        <ColorField
          label={t("边框颜色")}
          value={color.edge}
          fallback={defs.color.edge ?? "#ffffff"}
          onChange={(v) => onPatch({ color: { edge: v } })}
        />
        <Cell
          title={t("绘图区边框")}
          restore={
            <RestoreButton show={ov?.frame !== undefined} onClick={() => onPatch({ frame: { on: undefined, spines: undefined } })} />
          }
          control={
            // 四条边各自显示 / 隐藏：独立开关，所以 glide={false}（不共用一块会滑动的墨迹）。
            // 控件放在右列并占**两行高**（h-20 + Cell 上下内边距 ≈ 两个普通 Cell）：
            // 上 / 下各占一行，左 / 右跨两行做竖排按钮，整组和同列其它控件右对齐。
            <div role="group" aria-label={t("绘图区边框")} className="grid h-20 w-full grid-cols-3 grid-rows-2 gap-1">
              {FRAME_SIDES.map((side) => (
                <ToolbarButton
                  key={side.key}
                  compact
                  glide={false}
                  active={sides[side.key]}
                  aria-pressed={sides[side.key]}
                  label={t(side.label)}
                  className={cn("h-full w-full justify-center px-0", side.pos)}
                  onClick={() => toggleFrameSide(side.key, !sides[side.key])}
                />
              ))}
            </div>
          }
        />
      </CellGroup>

      {/* 网格线单独一组：开关 + 颜色 + 样式 / 线宽 / 透明度（后四项只在开启时可配） */}
      <CellGroup variant="plain" title={t("网格线")} controlWidth="168px">
        <Cell
          title={t("启用网格")}
          restore={<RestoreButton show={ov?.grid !== undefined} onClick={() => onPatch({ grid: { on: undefined } })} />}
          control={<Switch checked={gridOn} onCheckedChange={(v) => onPatch({ grid: { on: v } })} />}
        />
        {gridOn && (
          <>
            <ColorField
              label={t("颜色")}
              value={color.grid}
              fallback={defs.color.grid ?? "#d3dce8"}
              onChange={(v) => onPatch({ color: { grid: v } })}
            />
            <Cell
              title={t("样式")}
              restore={<RestoreButton show={ov?.grid?.style !== undefined} onClick={() => onPatch({ grid: { style: undefined } })} />}
              control={
                <Select
                  value={ov?.grid?.style ?? GRID_STYLE_DEFAULT}
                  onValueChange={(v) => onPatch({ grid: { style: v === GRID_STYLE_DEFAULT ? undefined : v } })}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GRID_STYLES.map((g) => (
                      <SelectItem key={g.value} value={g.value}>
                        {t(g.label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              }
            />
            <Cell
              title={t("线宽")}
              restore={
                <RestoreButton show={ov?.grid?.width !== undefined} onClick={() => onPatch({ grid: { width: undefined } })} />
              }
              control={
                <OptNumber
                  value={ov?.grid?.width ?? gridWidthDefault(defs)}
                  min={0.1}
                  max={4}
                  step={0.1}
                  onCommit={(v) =>
                    onPatch({ grid: { width: v === undefined || v === gridWidthDefault(defs) ? undefined : v } })
                  }
                />
              }
            />
            <Cell
              title={t("透明度")}
              restore={
                <RestoreButton show={ov?.grid?.alpha !== undefined} onClick={() => onPatch({ grid: { alpha: undefined } })} />
              }
              control={
                <OptNumber
                  value={ov?.grid?.alpha ?? 1}
                  min={0.05}
                  max={1}
                  step={0.05}
                  onCommit={(v) => onPatch({ grid: { alpha: v === undefined || v === 1 ? undefined : v } })}
                />
              }
            />
          </>
        )}
      </CellGroup>
    </Section>
  );
}

/* ---------------- 主题配色 / 文字与字体 ---------------- */

/** tokens.yaml 的基础值只读一次：界面要显示「默认是什么颜色」 */
let tokenDefaultsCache: TokenDefaults | null = null;

/**
 * 模板默认值。传了 `theme` 就**按主题预设解析**（base ⊕ `themes.<theme>.color`）。
 *
 * ⚠️ 必须解析主题：面板显示的是「默认是什么颜色」，而实际渲染用的是
 * `tokens.yaml 基础值 < 案例主题 < 项目覆盖`。只读基础块的话，显示的默认值会和图上对不上
 * （刻度色、轴标签色都踩过这个坑）。
 */
function useTokenDefaults(theme?: string): TokenDefaults {
  const [defs, setDefs] = useState<TokenDefaults>(tokenDefaultsCache ?? DEFAULT_TOKEN_DEFAULTS);
  useEffect(() => {
    if (tokenDefaultsCache) return;
    const url = assetUrl("design/tokens.yaml");
    if (!url) return;
    fetch(url)
      .then((r) => r.text())
      .then((text) => {
        const parsed = parseTokenDefaults(text);
        if (parsed.themes.length === 0) parsed.themes = ["rose", "slate"];
        tokenDefaultsCache = parsed;
        setDefs(parsed);
      })
      .catch(() => {});
  }, []);
  return useMemo(() => {
    if (!theme) return defs;
    const over = defs.themeColors?.[theme];
    return over ? { ...defs, color: { ...defs.color, ...over } } : defs;
  }, [defs, theme]);
}

/**
 * 颜色槽：色块（点开取色面板）+ 当前值 + **复制 / 粘贴**。
 *
 * 「回到默认（跟随主题色板）」在**取色面板里**（不在行内）；
 * 复制 / 粘贴做成行内按钮是因为它们是**常驻**的：所有颜色行宽度一致，右边缘仍然齐。
 * （⚠️ 行内按钮必须是「每行都有」的；像「恢复默认」那种**有时才出现**的按钮放行内会把控件顶左。）
 */
function ColorField({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string;
  /** 用户覆盖值；undefined = 跟随主题（此时显示主题色本身） */
  value: string | undefined;
  /** 主题默认值（仅用于显示） */
  fallback: string;
  onChange: (color: string | undefined) => void;
}) {
  const shown = value ?? fallback;

  const copy = async () => {
    try {
      await writeClipboardText(shown);
      sfx("hover");
      notify(t("已复制 {v1}", { v1: shown.toUpperCase() }));
    } catch {
      sfx("error", 0.7);
      notify(t("复制失败，剪贴板不可用"), { tone: "info" });
    }
  };

  const paste = async () => {
    let text = "";
    try {
      text = await readClipboardText();
    } catch {
      sfx("error", 0.7);
      notify(t("读取剪贴板失败"), { tone: "info" });
      return;
    }
    const color = parseHexColor(text);
    if (!color) {
      sfx("error", 0.7);
      notify(t("剪贴板里不是颜色"), { tone: "info" });
      return;
    }
    onChange(color);
    sfx("notify");
    notify(t("已粘贴 {v1}", { v1: color.toUpperCase() }));
  };

  return (
    <Cell
      title={label}
      restore={<RestoreButton show={value !== undefined} onClick={() => onChange(undefined)} />}
      control={
        <>
          <ColorSwatch
            label={label}
            color={shown}
            onChange={onChange}
            className="size-7"
          />
          {/* 永远显示**真正在用的颜色**（不然「默认」两个字既不告诉你是什么色，又和色块重复） */}
          <span className={cn(TYPO.caption, "w-[56px] shrink-0 truncate text-right tabular-nums text-ink-3")}>
            {shown.toUpperCase()}
          </span>
          <Button
            variant="ghost"
            size="iconSm"
            className="text-ink-4 hover:text-ink-2"
            title={t("复制颜色")}
            onClick={() => void copy()}
          >
            <CopyIcon size={13} />
          </Button>
          <Button
            variant="ghost"
            size="iconSm"
            className="text-ink-4 hover:text-ink-2"
            title={t("粘贴颜色")}
            onClick={() => void paste()}
          >
            <ClipboardPaste className="size-3.5" />
          </Button>
        </>
      }
    />
  );
}

/** 可选数字：留空 = 跟随主题 */
function OptNumber({
  value,
  min,
  max,
  step,
  placeholder,
  onCommit,
}: {
  value: number | undefined;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  onCommit: (v: number | undefined) => void;
}) {
  const [local, setLocal] = useState(value == null ? "" : String(value));
  useEffect(() => setLocal(value == null ? "" : String(value)), [value]);
  const commit = () => {
    const s = local.trim();
    if (s === "") {
      onCommit(undefined);
      return;
    }
    const n = Number(s);
    if (Number.isNaN(n)) {
      setLocal(value == null ? "" : String(value));
      return;
    }
    onCommit(n);
  };
  return (
    <input
      value={local}
      inputMode="decimal"
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          commit();
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={numberInputClass}
    />
  );
}

/* ---------------- 字体 ---------------- */

/** 字重选项（matplotlib 认这些名字）。另有「跟随全局」= 不写覆盖（见 `WeightField`）。 */
const WEIGHTS = [
  { value: "normal", label: "常规" },
  { value: "medium", label: "中黑" },
  { value: "semibold", label: "半粗" },
  { value: "bold", label: "粗体" },
];

/** Select 不能用空字符串当值，用这个哨兵表示「跟随全局」（写回项目时转成 undefined） */
const FOLLOW_GLOBAL = "__global__";

/** 全局字号的模板默认值：见 scripts/probe-font-defaults.py 实测（各模板渲染出来就是 10） */
const DEFAULT_FONT_SIZE = 10;

function WeightField({
  value,
  fallback,
  onChange,
}: {
  /** 用户覆盖值；undefined = 用 `fallback`（全局字重）*/
  value: string | undefined;
  /** 传了 = 这是「全局字重」本身：显示真正在用的值，不出现「跟随全局」；
   *  不传 = 轴标签 / 刻度：`undefined` 表示跟随全局。 */
  fallback?: string;
  onChange: (v: string | undefined) => void;
}) {
  // 「恢复默认」由调用点通过 `Cell` 的 `restore` 传进来（不能塞进控件列，否则会压窄下拉）
  const current = value ?? fallback ?? FOLLOW_GLOBAL;
  return (
    <Select
      value={current}
      onValueChange={(v) => {
        if (v === FOLLOW_GLOBAL || v === fallback) onChange(undefined);
        else onChange(v);
      }}
    >
      <SelectTrigger className="h-8">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {fallback === undefined && <SelectItem value={FOLLOW_GLOBAL}>{t("跟随全局")}</SelectItem>}
        {WEIGHTS.map((w) => (
          <SelectItem key={w.value} value={w.value}>
            {t(w.label)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * 「字体」分区（一级分区，排在「图形元素」之后、「导出」之前）：
 * 里面只有 `FontGroup` 一个组 —— 中文 / 英文 / 全局字号 / 全局字重。
 *
 * 分区标题已经写了「字体」，所以组本身**不再带组标题**（否则「字体」会出现两次）。
 */
export function FontPanel({
  override,
  onPatch,
}: {
  override: TokensOverride | undefined;
  onPatch: (patch: TokensOverride) => void;
}) {
  return (
    <Section title={t("字体")} icon={<Type />}>
      <FontGroup override={override} onPatch={onPatch} />
    </Section>
  );
}

/** 「字体」组：中文字体 / 英文字体 / 全局字号 / 全局字重（由 `FontPanel` 包在那个分区里） */
const BUILTIN_FONT = "__builtin__";

export function FontGroup({
  override,
  onPatch,
}: {
  override: TokensOverride | undefined;
  onPatch: (patch: TokensOverride) => void;
}) {
  const defs = useTokenDefaults();
  const { fonts } = useFontList();
  const f = override?.font ?? {};
  /** tokens.yaml 里的全局字号（界面显示「真正在用的值」，没读到就用 matplotlib 默认的 10） */
  const globalSize = Number(defs.font.size ?? DEFAULT_FONT_SIZE) || DEFAULT_FONT_SIZE;

  // 启动时后台已经扫过一次；这里再兜一次（那一次可能撞上渲染后端还没就绪，扫回空列表）
  useEffect(() => {
    void ensureFonts();
  }, []);

  // 两个列表**各自过滤**（覆盖信息是渲染后端实测的，见 `renderers/fonts.ts`）：
  // - 中文字体：只留真能排中文的族 —— 日文 / 韩文字体只有一部分汉字字形，不列在这里；
  // - 英文字体：筛掉图标字体（Wingdings / Symbol / Segoe MDL2 …），它们排不了字母数字。
  // ⚠️ tokens 里的设计默认族**不参与过滤**：它们未必装在本机（也就扫不到覆盖信息），
  //    万一被筛掉，用户会在列表里找不到它 —— 只有扫到的族才按实测结果过滤。
  // 行上显示字体自带的**中文名**（「宋体」「微软雅黑」，见 render.py 的 `font_list`），
  // 选中的值仍是 matplotlib 认的族名 —— 两者别混（渲染只认族名）。
  const labels = useMemo(() => new Map(fonts.map((x) => [x.name, x.label || x.name])), [fonts]);
  const displayOf = (name: string) => labels.get(name) ?? name;

  const [cjkOptions, latinOptions] = useMemo(() => {
    const scanned = new Set(fonts.map((x) => x.name));
    const build = (has: (x: FontFamily) => boolean) => {
      const names = new Set<string>();
      for (const x of fonts) if (has(x)) names.add(x.name);
      for (const name of defs.families) if (!scanned.has(name)) names.add(name);
      // 按**显示名**排序（中文按拼音、英文按字母），用户扫一眼就能找到；
      // 英文族名放进 keywords：显示「宋体」时搜 SimSun 也还能搜到。
      return [...names]
        .map((value) => ({ value, label: labels.get(value) ?? value, keywords: value }))
        .sort((a, b) => a.label.localeCompare(b.label, "zh-Hans") || a.value.localeCompare(b.value));
    };
    return [build((x) => x.cjk), build((x) => x.latin)] as const;
  }, [defs.families, fonts, labels]);

  const builtin = { value: BUILTIN_FONT, label: t("内置中文字体（默认）") };
  const pick = (key: "cjk" | "latin") => (v: string) => onPatch({ font: { [key]: v === BUILTIN_FONT ? undefined : v } });

  return (
    <CellGroup variant="plain" controlWidth="168px">
      {/* 中英分开选：拉丁字母与数字用「英文字体」，中文用「中文字体」。
          渲染时按这个顺序排给 matplotlib，它逐字回退（缺字再落到内置中文字体）。 */}
      <Cell
        title={t("中文字体")}
        restore={<RestoreButton show={f.cjk !== undefined} onClick={() => onPatch({ font: { cjk: undefined } })} />}
        control={
          <Combobox
            value={f.cjk}
            display={f.cjk ? displayOf(f.cjk) : t("内置中文字体（默认）")}
            options={[builtin, ...cjkOptions]}
            onSelect={pick("cjk")}
            searchPlaceholder={t("搜索字体")}
            emptyText={t("没有匹配的字体")}
          />
        }
      />
      <Cell
        title={t("英文字体")}
        restore={<RestoreButton show={f.latin !== undefined} onClick={() => onPatch({ font: { latin: undefined } })} />}
        control={
          <Combobox
            value={f.latin}
            display={f.latin ? displayOf(f.latin) : t("跟随中文字体")}
            options={[{ value: BUILTIN_FONT, label: t("跟随中文字体") }, ...latinOptions]}
            onSelect={pick("latin")}
            searchPlaceholder={t("搜索字体")}
            emptyText={t("没有匹配的字体")}
          />
        }
      />
      <Cell
        title={t("全局字号")}
        restore={<RestoreButton show={f.size !== undefined} onClick={() => onPatch({ font: { size: undefined } })} />}
        control={
          <OptNumber
            value={f.size ?? globalSize}
            min={4}
            max={40}
            step={0.5}
            onCommit={(v) => onPatch({ font: { size: v === undefined || v === globalSize ? undefined : v } })}
          />
        }
      />
      <Cell
        title={t("全局字重")}
        restore={<RestoreButton show={f.weight !== undefined} onClick={() => onPatch({ font: { weight: undefined } })} />}
        control={
          <WeightField
            value={f.weight}
            fallback={defs.font.weight ?? "normal"}
            onChange={(v) => onPatch({ font: { weight: v } })}
          />
        }
      />
    </CellGroup>
  );
}

/**
 * 「坐标轴」里的两组：**轴标签**（轴名 + 颜色/字号/字重）与**刻度**（轴刻度范围 + 颜色/字号/字重）。
 * 字号**留空 = 跟随全局字号**（输入框显示「跟随全局」占位）；字重选「跟随全局」= 跟随全局字重。
 * 各组的具体设置行从 `children` 传进来（轴名 / 刻度范围），保持一组的行排在一起。
 */
export function TextGroups({
  title,
  color,
  sizeValue,
  onColor,
  onSize,
  weightValue,
  onWeight,
  fallbackColor,
  footnote,
  children,
}: {
  title: string;
  color: string | undefined;
  sizeValue: number | undefined;
  onColor: (v: string | undefined) => void;
  onSize: (v: number | undefined) => void;
  weightValue: string | undefined;
  onWeight: (v: string | undefined) => void;
  fallbackColor: string;
  footnote?: string;
  /** 这一组里排在样式行前面的设置行（轴名 / 刻度范围） */
  children?: React.ReactNode;
}) {
  return (
    <CellGroup variant="plain" title={title} controlWidth="168px" footnote={footnote}>
      {children}
      <ColorField label={t("颜色")} value={color} fallback={fallbackColor} onChange={onColor} />
      <Cell
        title={t("字号")}
        restore={<RestoreButton show={sizeValue !== undefined} onClick={() => onSize(undefined)} />}
        control={
          <OptNumber
            value={sizeValue}
            placeholder={t("跟随全局")}
            min={4}
            max={40}
            step={0.5}
            onCommit={onSize}
          />
        }
      />
      <Cell
        title={t("字重")}
        restore={<RestoreButton show={weightValue !== undefined} onClick={() => onWeight(undefined)} />}
        control={<WeightField value={weightValue} onChange={onWeight} />}
      />
    </CellGroup>
  );
}

/** ---------------- 坐标轴 / 图例 ---------------- */
function NumOpt({ value, onCommit, placeholder }: { value: number | null; onCommit: (v: number | null) => void; placeholder?: string }) {
  const [local, setLocal] = useState(value == null ? "" : String(value));
  useEffect(() => setLocal(value == null ? "" : String(value)), [value]);
  const commit = () => {
    const t = local.trim();
    if (t === "") return onCommit(null);
    const n = Number(t);
    if (!Number.isNaN(n)) onCommit(n);
  };
  return (
    <Input
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          commit();
          (e.target as HTMLInputElement).blur();
        }
      }}
      placeholder={placeholder}
      className="h-8"
    />
  );
}

const LEGEND_LOCS = ["best", "upper right", "upper left", "lower right", "lower left", "center right", "upper center", "lower center"];

export function AxesPanel({
  presentation,
  base,
  onChange,
  capabilities,
  override,
  onPatch,
  theme,
}: {
  presentation: Presentation;
  /** 案例自带的呈现规格（案例里是自由 JSON）：输入框要显示「真正在用的值」，就得拿它当默认 */
  base?: Record<string, unknown>;
  onChange: (patch: Partial<Presentation>) => void;
  /** 能力清单：这张图有没有轴、能不能配范围 / 图例（饼图、3D 图就没有） */
  capabilities: CaseCapabilities;
  /** 主题覆盖：轴标签 / 刻度的颜色、字号、字重都在这里 */
  override: TokensOverride | undefined;
  onPatch: (patch: TokensOverride) => void;
  /** 当前主题预设：算「默认是什么颜色」要按它解析 */
  theme?: string;
}) {
  const axes = capabilities.axes;
  const showAxes = axes.x || axes.y;
  const showLimits = axes.limits && showAxes;
  const defs = useTokenDefaults(theme);
  const f = override?.font ?? {};
  const c = override?.color ?? {};

  const baseText = (key: "xlabel" | "ylabel") => {
    const v = base?.[key];
    return v == null ? "" : String(v);
  };

  /**
   * 轴名显示「真正在用的值」：项目没覆盖就用案例自带的。
   * 改回案例默认值时不写覆盖，免得留一层和默认值一样的脏数据。
   * （之前留空 → 用户点一下再点出去就把轴名清掉了，正是因为初始值和实际用的值不一致。）
   */
  const commitText = (key: "xlabel" | "ylabel") => (v: string | number) => {
    const val = String(v);
    onChange(val === baseText(key) ? ({ [key]: undefined } as Partial<Presentation>) : ({ [key]: val } as Partial<Presentation>));
  };

  /**
   * 刻度朝向：`in` = 朝里、`out` = 朝外，**不写 = 外**（matplotlib 的默认，也是所有案例的现状）。
   * 打开（朝外）就删掉这个键；关掉才写 `"in"` —— 和别处一样，不留「和默认一样」的脏数据。
   * ⚠️ 案例自己若写过 `direction: "in"`，打开开关要**显式写 `"out"`**：删键会回落到案例的 `in`。
   */
  const baseTicks = (base?.ticks ?? {}) as NonNullable<Presentation["ticks"]>;
  const tickOutward = (presentation.ticks?.direction ?? baseTicks.direction ?? "out") !== "in";
  const commitTickDirection = (v: "in" | "out" | undefined) => {
    const direction = v ?? (baseTicks.direction === "in" ? "out" : undefined);
    const next = { ...(presentation.ticks ?? {}) };
    if (direction === undefined) delete next.direction;
    else next.direction = direction;
    onChange({ ticks: Object.keys(next).length > 0 ? next : undefined });
  };

  /**
   * 轴范围是「最小 ~ 最大」一对，可以**只填一侧**：
   *  · 只填最小 → 下界固定，上界仍由这张图自己决定（数据范围）；
   *  · 只填最大 → 反之；
   *  · 两侧都填 → 固定上下界；
   *  · 两侧都清空 → 这个轴不设范围（案例自带的话就显式取消）。
   * 每改一次只动**当前这个轴**，另一个轴的设置原样保留。
   */
  const baseLimits = (base?.limits ?? {}) as NonNullable<Presentation["limits"]>;
  /** 某个轴「真正在用的范围」：项目写过就用项目的（`null` = 已取消），否则用案例自带的 */
  const effAxis = (a: "x" | "y"): [number | null, number | null] => {
    const own = (presentation.limits as Record<string, unknown> | undefined)?.[a] as
      | [number | null, number | null]
      | null
      | undefined;
    if (own === null) return [null, null];
    if (own) return [own[0] ?? null, own[1] ?? null];
    const b = baseLimits[a];
    return b ? [b[0] ?? null, b[1] ?? null] : [null, null];
  };
  const [pending, setPending] = useState<{ x: [number | null, number | null]; y: [number | null, number | null] }>(() => ({
    x: effAxis("x"),
    y: effAxis("y"),
  }));
  const lv = (axis: "x" | "y", i: 0 | 1) => pending[axis][i];
  const setLimit = (axis: "x" | "y", i: 0 | 1, v: number | null) => {
    const arr: [number | null, number | null] = [pending[axis][0], pending[axis][1]];
    arr[i] = v; // v === null → 这一侧不约束
    setPending({ ...pending, [axis]: arr });
    const lim = { ...((presentation.limits ?? {}) as Record<string, unknown>) };
    const [lo, hi] = arr;
    if (lo === null && hi === null) {
      // 两侧都空：案例自带范围 → 显式写 null 取消；否则不留痕迹
      if (baseLimits[axis]) lim[axis] = null;
      else delete lim[axis];
    } else {
      lim[axis] = [lo, hi];
    }
    onChange({ limits: Object.keys(lim).length > 0 ? (lim as Presentation["limits"]) : undefined });
  };
  const partial = (["x", "y"] as const).some((a) => (pending[a][0] === null) !== (pending[a][1] === null));

  // 这张图没有可配的轴 → 整个分区不显示（饼图、3D 图就是这种情况；图例见 LegendPanel）
  if (!showAxes && !showLimits) return null;

  /** 一个轴的刻度范围行：最小 ~ 最大（留空的一侧不设限） */
  const rangeCell = (axis: "x" | "y") =>
    showLimits && axes[axis] ? (
      <Cell
        title={axis === "x" ? t("X 轴刻度范围") : t("Y 轴刻度范围")}
        restore={
          <RestoreButton
            show={presentation.limits?.[axis] !== undefined}
            onClick={() => {
              setPending({ ...pending, [axis]: [null, null] });
              const lim = { ...((presentation.limits ?? {}) as Record<string, unknown>) };
              if (baseLimits[axis]) lim[axis] = null;
              else delete lim[axis];
              onChange({ limits: Object.keys(lim).length > 0 ? (lim as Presentation["limits"]) : undefined });
            }}
          />
        }
        control={
          <>
            <NumOpt value={lv(axis, 0)} onCommit={(v) => setLimit(axis, 0, v)} placeholder={t("最小")} />
            <span className={cn(TYPO.caption, "shrink-0 text-ink-3")}>~</span>
            <NumOpt value={lv(axis, 1)} onCommit={(v) => setLimit(axis, 1, v)} placeholder={t("最大")} />
          </>
        }
      />
    ) : null;

  return (
    <Section title={t("坐标轴")} icon={<Ruler />}>
      {/* 轴名放进「轴标签」组、轴范围放进「刻度」组：它们是同一件事的两半
          （这个轴叫什么 / 这条轴从哪到哪），拆成两个标题反而要来回对。 */}
      {showAxes && (
        <TextGroups
          title={t("轴标签")}
          color={c.label}
          sizeValue={f.axis_label_size}
          onColor={(v) => onPatch({ color: { label: v } })}
          onSize={(v) => onPatch({ font: { axis_label_size: v } })}
          weightValue={f.axis_label_weight}
          onWeight={(v) => onPatch({ font: { axis_label_weight: v } })}
          fallbackColor={defs.color.label ?? "#c0627a"}
        >
          {axes.x && (
            <Cell
              title={t("X 轴标签名")}
              restore={<RestoreButton show={presentation.xlabel !== undefined} onClick={() => onChange({ xlabel: undefined })} />}
              control={
                <CommitInput value={String(presentation.xlabel ?? baseText("xlabel"))} onCommit={commitText("xlabel")} />
              }
            />
          )}
          {axes.y && (
            <Cell
              title={t("Y 轴标签名")}
              restore={<RestoreButton show={presentation.ylabel !== undefined} onClick={() => onChange({ ylabel: undefined })} />}
              control={
                <CommitInput value={String(presentation.ylabel ?? baseText("ylabel"))} onCommit={commitText("ylabel")} />
              }
            />
          )}
        </TextGroups>
      )}
      {axes.ticks && (
        <TextGroups
          title={t("刻度")}
          color={c.tick}
          sizeValue={f.tick_label_size}
          onColor={(v) => onPatch({ color: { tick: v } })}
          onSize={(v) => onPatch({ font: { tick_label_size: v } })}
          weightValue={f.tick_label_weight}
          onWeight={(v) => onPatch({ font: { tick_label_weight: v } })}
          fallbackColor={defs.color.tick ?? defs.color.text ?? defs.color.label ?? "#c0627a"}
          footnote={partial ? t("留空的一侧不设限，按数据自动") : undefined}
        >
          {rangeCell("x")}
          {rangeCell("y")}
          {/* 朝向：开关打开 = 外刻度（默认），关掉 = 内刻度 */}
          <Cell
            title={t("刻度朝外")}
            restore={<RestoreButton show={presentation.ticks?.direction !== undefined} onClick={() => commitTickDirection(undefined)} />}
            control={<Switch checked={tickOutward} onCheckedChange={(v) => commitTickDirection(v ? undefined : "in")} />}
          />
        </TextGroups>
      )}
    </Section>
  );
}

/**
 * 图例自己的手风琴分区（在「坐标轴」下方）。
 *
 * 为什么单独拆出来：图例与坐标轴是两件事 —— 饼图没有坐标轴但**一定**有图例，
 * 基本散点图只有一种点，**根本不需要**图例。以前两者挤在「坐标轴与图例」里，
 * 于是「没有轴的图看不到图例」「不需要图例的图却显示图例配置」两个毛病同时存在。
 * 是否显示这个分区由模板自己决定：`capabilities.legend` = `presentation.legend` 是对象。
 */
export function LegendPanel({
  presentation,
  base,
  onChange,
  capabilities,
}: {
  presentation: Presentation;
  /** 案例自带的呈现规格：项目没覆盖图例时，用它当显示默认值 */
  base?: Record<string, unknown>;
  onChange: (patch: Partial<Presentation>) => void;
  capabilities: CaseCapabilities;
}) {
  if (!capabilities.legend) return null;

  const legend = presentation.legend;
  const baseLegend = typeof base?.legend === "object" && base.legend ? (base.legend as { loc?: string; ncols?: number }) : undefined;
  const legendMode: "auto" | "show" | "hide" = legend === false ? "hide" : legend && typeof legend === "object" ? "show" : "auto";
  const legendObj = typeof legend === "object" && legend ? legend : baseLegend ?? { loc: "best", ncols: 1 };

  return (
    <Section title={t("图例")} icon={<List />}>
      <CellGroup variant="plain" controlWidth="168px">
        <Cell
          title={t("显示图例")}
          restore={<RestoreButton show={legend !== undefined} onClick={() => onChange({ legend: undefined })} />}
          control={
            <Select
              value={legendMode}
              onValueChange={(v) => onChange({ legend: v === "hide" ? false : v === "show" ? { loc: legendObj.loc ?? "best", ncols: legendObj.ncols ?? 1, frameon: true } : undefined })}
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">{t("跟随图表")}</SelectItem>
                <SelectItem value="show">{t("显示")}</SelectItem>
                <SelectItem value="hide">{t("隐藏")}</SelectItem>
              </SelectContent>
            </Select>
          }
        />
        {legendMode === "show" && (
          <>
            <Cell
              title={t("图例位置")}
              restore={
                <RestoreButton
                  show={baseLegend !== undefined && legendObj.loc !== baseLegend.loc}
                  onClick={() => onChange({ legend: { ...legendObj, loc: baseLegend?.loc ?? "best" } })}
                />
              }
              control={
                <Select value={legendObj.loc ?? "best"} onValueChange={(v) => onChange({ legend: { ...legendObj, loc: v } })}>
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEGEND_LOCS.map((l) => (
                      <SelectItem key={l} value={l}>
                        {legendLocLabel(l)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              }
            />
            <Cell
              title={t("图例列数")}
              restore={
                <RestoreButton
                  show={baseLegend !== undefined && legendObj.ncols !== baseLegend.ncols}
                  onClick={() => onChange({ legend: { ...legendObj, ncols: baseLegend?.ncols ?? 1 } })}
                />
              }
              control={
                <CommitInput
                  type="number"
                  className={numberInputClass}
                  value={legendObj.ncols ?? 1}
                  min={1}
                  max={6}
                  onCommit={(v) => onChange({ legend: { ...legendObj, ncols: Math.max(1, Math.min(6, Number(v))) } })}
                />
              }
            />
          </>
        )}
      </CellGroup>
    </Section>
  );
}

/* ---------------- 导出可运行包 ---------------- */
function CodeDialog({
  open,
  onOpenChange,
  onGetScript,
  onExportPackage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGetScript: () => Promise<string>;
  onExportPackage: () => Promise<boolean>;
}) {
  const [script, setScript] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pkgBusy, setPkgBusy] = useState(false);
  const [pkgDone, setPkgDone] = useState(false);
  /**
   * 入场动画结束前先不挂载高亮代码块。
   *
   * run.py 有上万字符、几百个高亮 span，第一次挂载要一次性排版（实测约 300ms 主线程），
   * 正好撞在弹窗的 spring 入场动画上 → 打开瞬间明显顿一下。等入场基本落位（260ms）再挂，
   * 用户看到的仍是「生成脚本中…」，没有额外感知；脚本本来就晚到的话不受影响。
   */
  const [entranceDone, setEntranceDone] = useState(false);

  useEffect(() => {
    if (!open) {
      setEntranceDone(false);
      return;
    }
    const timer = window.setTimeout(() => setEntranceDone(true), 260);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    onGetScript()
      .then((s) => {
        if (!cancelled) setScript(s);
      })
      .catch(() => {
        if (!cancelled) setScript("");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const copy = async () => {
    try {
      await writeClipboardText(script);
      setCopied(true);
      sfx("notify");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const exportPkg = async () => {
    setPkgBusy(true);
    try {
      const ok = await onExportPackage();
      if (ok) {
        setPkgDone(true);
        sfx("export");
        window.setTimeout(() => setPkgDone(false), 1600);
      }
    } finally {
      setPkgBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <DialogContent className="w-[min(900px,94vw)] pt-10 sm:max-w-none">
          {/* 窗口顶部不要标题 / 说明（只留给读屏）：直接就是代码预览 */}
          <DialogTitle className="sr-only">{t("导出可运行包")}</DialogTitle>
          <DialogDescription className="sr-only">
            {t("自包含脚本 + 数据。安装依赖后执行")} <code className="font-mono">python run.py</code> {t("即可出图。")}
          </DialogDescription>
          <div className="max-h-[58vh] overflow-auto rounded-md border border-border bg-muted/30 p-4">
            {loading || !entranceDone ? (
              <div className={cn(TYPO.label, "text-ink-3")}>{t("生成脚本中…")}</div>
            ) : (
              <CodeBlock code={script} />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" data-sfx="none" onClick={copy} disabled={loading}>
              <Copy size={14} animateOnHover /> {copied ? t("已复制") : t("复制")}
            </Button>
            <Button onClick={exportPkg} disabled={pkgBusy || loading}>
              <Download size={14} animateOnHover /> {pkgBusy ? t("打包中…") : pkgDone ? t("已导出") : t("导出完整包 (ZIP)")}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}

/* ---------------- 导出 ---------------- */

/** 数据导出的表格预览最多渲染多少行 */
const CSV_PREVIEW_ROWS = 12;
export function ExportPanel({
  project,
  caseInfo,
  pngUrl,
  onGetSvg,
  onGetPng,
  onGetScript,
  onExportPackage,
}: {
  project: CaseProject;
  caseInfo: GalleryCase;
  pngUrl: string | null;
  /** matplotlib 的 SVG 由渲染器出；Plotly（3D）由 Plotly 自己出 */
  onGetSvg: () => Promise<string>;
  /** 没有现成 PNG 时（Plotly 3D）按需取一张 data URL */
  onGetPng?: () => Promise<string>;
  onGetScript: () => Promise<string>;
  onExportPackage: () => Promise<boolean>;
}) {
  const [svgBusy, setSvgBusy] = useState(false);
  const [pngBusy, setPngBusy] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [img, setImg] = useState<{ kind: "png" | "svg"; src: string; text?: string } | null>(null);
  /** 数据导出：先弹预览（表格），确认后再选保存位置 */
  const [csv, setCsv] = useState<string | null>(null);
  const openCsv = () => setCsv(Papa.unparse({ fields: project.data.columns, data: project.data.rows }));
  /** 出错时把真正的原因带出来 —— 只显示「失败」等于什么都没说 */
  const fail = (label: string, e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[mensic] ${label}：`, e);
    sfx("error", 0.7);
    notify(t("{v1}失败：{v2}", { v1: label, v2: msg.slice(0, 120) }), { tone: "info" });
  };

  const closeImg = () => {
    setImg((cur) => {
      if (cur && cur.kind === "svg") URL.revokeObjectURL(cur.src);
      return null;
    });
  };

  // 导出图片：先弹预览（与界面预览一致），确认后再下载
  const openPng = async () => {
    if (pngUrl) {
      setImg({ kind: "png", src: pngUrl });
      return;
    }
    if (!onGetPng) return;
    setPngBusy(true);
    try {
      setImg({ kind: "png", src: await onGetPng() });
    } catch (e) {
      fail(t("PNG 图片"), e);
    } finally {
      setPngBusy(false);
    }
  };
  const openSvg = async () => {
    setSvgBusy(true);
    try {
      const svg = await onGetSvg();
      const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
      setImg({ kind: "svg", src: url, text: svg });
    } catch (e) {
      fail(t("SVG 图片"), e);
    } finally {
      setSvgBusy(false);
    }
  };
  const downloadImg = async () => {
    if (!img) return;
    const label = img.kind.toUpperCase();
    try {
      let ok = false;
      if (img.kind === "png") {
        const blob = await (await fetch(img.src)).blob();
        ok = await saveFileAs(`${project.name}.png`, blob, [{ name: "PNG", extensions: ["png"] }]);
      } else if (img.text) {
        ok = await saveFileAs(`${project.name}.svg`, img.text, [{ name: "SVG", extensions: ["svg"] }]);
      }
      if (ok) {
        sfx("export");
        notify(t("已导出 {v1}", { v1: label }));
      }
    } catch (e) {
      // 保存/分享失败（移动端分享面板出错、桌面写文件失败）：必须说出来，不能静默
      fail(label, e);
    }
    closeImg();
  };
  const exportData = async () => {
    if (!csv) return;
    try {
      const ok = await saveFileAs(`${project.name}.csv`, csv, [{ name: "CSV", extensions: ["csv"] }]);
      if (ok) {
        sfx("export");
        notify(t("已导出 {v1}", { v1: "CSV" }));
      }
    } catch (e) {
      fail("CSV", e);
    }
    setCsv(null);
  };

  return (
    <>
      <Section title={t("导出")} icon={<Download />}>
        <CellGroup variant="plain">
          <Cell
            title={t("PNG 图片")}
            desc={t("与界面预览同一张图，确认后下载。")}
            control={
              <Button
                variant="outline"
                size="sm"
                disabled={(!pngUrl && !onGetPng) || pngBusy}
                onClick={() => void openPng()}
              >
                {t("导出")}
              </Button>
            }
          />
          <Cell
            title={t("SVG 图片")}
            desc={t("矢量格式，适合再编辑或印刷。")}
            control={
              <Button variant="outline" size="sm" disabled={svgBusy} onClick={() => void openSvg()}>
                {t("导出")}
              </Button>
            }
          />
          <Cell
            title={t("Python 工程")}
            desc={t("出图用的 Python 脚本，可复制或导出完整包。")}
            control={
              <Button
                variant="outline"
                size="sm"
                disabled={caseInfo.engine !== "matplotlib"}
                onClick={() => setCodeOpen(true)}
              >
                {t("导出")}
              </Button>
            }
          />
          <Cell
            title={t("CSV 数据集")}
            desc={t("预览后导出整张数据表。")}
            control={
              <Button variant="outline" size="sm" onClick={openCsv}>
                {t("导出")}
              </Button>
            }
          />
        </CellGroup>
      </Section>

      {/* 图片导出预览（与界面预览同一张图 / 同一套渲染） */}
      <Dialog open={img !== null} onOpenChange={(o) => !o && closeImg()}>
        {img && (
          <DialogContent className="w-[min(880px,94vw)] sm:max-w-none" showCloseButton={false} aria-describedby={undefined}>
            {/* 顶部不放标题：直接给预览 */}
            <DialogTitle className="sr-only">{t("导出 {v1}", { v1: img.kind.toUpperCase() })}</DialogTitle>
            {/* 图片导出预览：与界面预览同一套缩放交互（按钮 / Ctrl+滚轮 / 双指捏合） */}
            <div className="h-[54vh] max-h-[560px] overflow-hidden rounded-md border border-border">
              <ZoomPane
                width={project.canvas.width}
                height={project.canvas.height}
                workspaceClassName="bg-muted/25"
              >
                <img
                  src={img.src}
                  alt={t("导出预览")}
                  className="absolute inset-0 h-full w-full object-contain"
                  draggable={false}
                />
              </ZoomPane>
            </div>
            <DialogFooter>
              <Button variant="outline" data-sfx="none" onClick={closeImg}>
                {t("取消")}
              </Button>
              <Button onClick={downloadImg}>
                <Download size={14} animateOnHover /> {t("下载 {v1}", { v1: img.kind.toUpperCase() })}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* 数据导出预览：与图片导出同一套流程 —— 先看数据，确认后再选保存位置 */}
      <Dialog open={csv !== null} onOpenChange={(o) => !o && setCsv(null)}>
        {csv !== null && (
          <DialogContent className="w-[min(880px,94vw)] sm:max-w-none" showCloseButton={false} aria-describedby={undefined}>
            {/* 顶部不放标题：直接给表格预览 */}
            <DialogTitle className="sr-only">{t("导出 {v1}", { v1: "CSV" })}</DialogTitle>
            {/* 表格预览：只渲染前若干行，避免几百行全塞进 DOM */}
            <div className="max-h-[52vh] overflow-auto rounded-md border border-border">
              <table className={cn(TYPO.label, "w-full border-collapse")}>
                <thead className="sticky top-0 bg-surface-2">
                  <tr>
                    {project.data.columns.map((c, i) => (
                      <th key={i} className="whitespace-nowrap border-b border-line px-3 py-2 text-left font-semibold text-ink">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {project.data.rows.slice(0, CSV_PREVIEW_ROWS).map((row, r) => (
                    <tr key={r} className="even:bg-surface-2/40">
                      {project.data.columns.map((_, ci) => (
                        <td
                          key={ci}
                          className="max-w-[280px] truncate whitespace-nowrap border-b border-line/60 px-3 py-1.5 tabular-nums text-ink-2"
                        >
                          {String(row[ci] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {project.data.rows.length > CSV_PREVIEW_ROWS && (
              <div className={cn(TYPO.label, "text-ink-3")}>
                {t("仅预览前 {v1} 行，导出的是完整数据。", { v1: CSV_PREVIEW_ROWS })}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" data-sfx="none" onClick={() => setCsv(null)}>
                {t("取消")}
              </Button>
              <Button onClick={exportData}>
                <Download size={14} animateOnHover /> {t("下载 {v1}", { v1: "CSV" })}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <CodeDialog
        open={codeOpen}
        onOpenChange={setCodeOpen}
        onGetScript={onGetScript}
        onExportPackage={onExportPackage}
      />
    </>
  );
}
