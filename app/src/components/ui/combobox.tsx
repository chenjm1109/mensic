import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { TYPO } from "@/core/typography";

/**
 * 可搜索下拉（combobox）：选项特别多时的选择器（字体就是这个场景，本机动辄上百个族）。
 *
 * 为什么不用 `Select`：Select 会把**全部选项**渲染出来、靠键盘漫游高亮，
 * 几百个字体时列表又长又慢（鼠标划过每一项都要动一次高亮动画）。
 * 这里加一层「输入即过滤」，列表通常缩到个位数；行高亮用**主题色浅底**
 * （`bg-brand-soft`，与 DropdownMenu / Select 的选项高亮同一套），**不做基于测量的滑动墨迹** ——
 * 那是长列表卡顿的主因（见 AGENTS.md 的「长列表」一条）。
 *
 * 行为：输入过滤 → ↑/↓ 移动 → Enter 选中 / Esc 关闭；打开时自动聚焦输入框并高亮当前项。
 */

export interface ComboboxOption {
  value: string;
  label: string;
  /** 行尾的次要说明（例如「系统字体」） */
  hint?: string;
  /** 不在行上显示、但能搜到的词（例如字体中文名对应的英文族名） */
  keywords?: string;
}

/** 行：memo 掉，光标在长列表里移动时只重渲染受影响的两行 */
const Row = React.memo(function Row({
  option,
  active,
  selected,
  onHover,
  onPick,
}: {
  option: ComboboxOption;
  active: boolean;
  selected: boolean;
  onHover: (value: string) => void;
  onPick: (value: string) => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      data-sfx="none"
      // 触摸没有「悬停」：手指按下 / 滑动列表时不要留下一条高亮（否则会卡在起始行，
      // 看起来像「选中了」，和参数栏标题的悬停残留是同一类问题）
      onPointerEnter={(e) => {
        if (e.pointerType === "touch") return;
        onHover(option.value);
      }}
      onClick={() => onPick(option.value)}
      className={cn(
        TYPO.body,
        "flex w-full items-center gap-2 rounded-sm py-1.5 pr-2 pl-7 text-left outline-hidden",
        // 高亮条 = **主题色浅底**（与 DropdownMenu / Select 同一套，见 AGENTS.md）
        active && "bg-brand-soft",
      )}
    >
      <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
        {selected && <Check className="size-3.5 text-[var(--brand-strong)]" />}
      </span>
      <span className="min-w-0 flex-1 truncate">{option.label}</span>
      {option.hint && <span className={cn(TYPO.caption, "shrink-0 text-ink-4")}>{option.hint}</span>}
    </button>
  );
});

export function Combobox({
  value,
  /** 触发器上的文案；不传就用当前项的 label */
  display,
  options,
  onSelect,
  searchPlaceholder,
  emptyText,
  className,
}: {
  value: string | undefined;
  display?: string;
  options: ComboboxOption[];
  onSelect: (value: string) => void;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState<string | null>(null);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => `${o.label}\n${o.keywords ?? ""}`.toLowerCase().includes(q));
  }, [options, query]);

  const current = options.find((o) => o.value === value);
  const shown = display ?? current?.label ?? value ?? "";

  // 每次展开都重置搜索词，并把高亮放到当前项上
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setQuery("");
      // 当前值可能**不在**列表里（例如字体按字形覆盖过滤后，老项目存的字体被筛掉了）：
      // 那就把高亮放到第一项，别留一个指向不存在行的「幽灵高亮」（回车会选回旧值）。
      const inList = value !== undefined && options.some((o) => o.value === value);
      setActive(inList ? (value as string) : (options[0]?.value ?? null));
    }
  };

  const pick = (v: string) => {
    onSelect(v);
    setOpen(false);
  };

  const move = (delta: number) => {
    if (filtered.length === 0) return;
    const i = Math.max(0, filtered.findIndex((o) => o.value === active));
    const next = filtered[Math.min(filtered.length - 1, Math.max(0, i + delta))];
    if (next) {
      setActive(next.value);
      // 让键盘移动时高亮项始终在可视区内
      requestAnimationFrame(() => {
        document.querySelector(`[data-combobox-row="${CSS.escape(next.value)}"]`)?.scrollIntoView({ block: "nearest" });
      });
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-sfx="none"
          className={cn(
            "group/select flex h-8 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-2.5 py-1 outline-none transition-colors",
            TYPO.body,
            "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25",
            className,
          )}
        >
          <span className="truncate">{shown}</span>
          <ChevronDown className="size-3.5 shrink-0 opacity-50 transition-transform duration-200 group-data-[state=open]/select:rotate-180" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={4} className="w-[248px] overflow-hidden p-2">
        <Input
          autoFocus
          value={query}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              move(1);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              move(-1);
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (active) pick(active);
              else if (filtered[0]) pick(filtered[0].value);
            }
          }}
          className="mb-1.5 h-7"
        />
        <div
          role="listbox"
          className="relative -mr-1 max-h-[min(264px,calc(var(--radix-popover-content-available-height,100vh)-72px))] overflow-y-auto pr-1"
        >
          {filtered.length === 0 ? (
            <div className={cn(TYPO.caption, "px-2 py-3 text-center text-ink-4")}>{emptyText}</div>
          ) : (
            filtered.map((o) => (
              <div key={o.value} data-combobox-row={o.value} className="relative">
                <Row
                  option={o}
                  active={o.value === active}
                  selected={o.value === value}
                  onHover={setActive}
                  onPick={pick}
                />
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
