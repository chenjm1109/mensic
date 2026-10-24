import * as React from "react";
import { HexColorPicker } from "react-colorful";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * 取色控件（全应用唯一一套）。
 *
 * 社区里 shadcn 生态的标准搭法是 **Popover + react-colorful**（shadcn 官方没有 color picker 组件，
 * 各家 registry 都是这套组合），这里照做：色块是触发器，点开是「饱和度面板 + 色相条 + 十六进制输入」。
 * 原来用的是隐藏的原生 `<input type="color">` —— 点开会弹系统取色器，跟本应用的观感完全不是一回事。
 */

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * 把一段文本解析成 `#rrggbb`（供「粘贴颜色」用）：接受 `#abc` / `abc` / `#AABBCC`，前后空白忽略。
 * 不是颜色就返回 `null`（调用点据此提示用户「剪贴板里不是颜色」）。
 */
export function parseHexColor(text: string): string | null {
  const s = text.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(s)) {
    return `#${s.split("").map((c) => c + c).join("")}`.toLowerCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(s)) return `#${s.toLowerCase()}`;
  return null;
}

/** 取色面板本体（也可单独用，不一定要包在 Popover 里） */
export function ColorPicker({
  value,
  onChange,
  className,
}: {
  /** 当前色值（#rrggbb） */
  value: string;
  onChange: (color: string) => void;
  className?: string;
}) {
  const safe = HEX.test(value) ? value : "#ffffff";
  const [text, setText] = React.useState(safe);
  React.useEffect(() => setText(safe), [safe]);

  const commit = () => {
    const v = text.trim();
    if (HEX.test(v)) {
      const next = v.toLowerCase();
      setText(next);
      if (next !== safe) onChange(next);
    } else {
      setText(safe); // 非法就退回当前值，不留脏输入
    }
  };

  return (
    <div className={cn("flex w-full flex-col gap-2.5", className)}>
      <HexColorPicker color={safe} onChange={onChange} />
      <Input
        value={text}
        spellCheck={false}
        aria-label={t("色值")}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit();
            e.currentTarget.blur();
          }
        }}
        className="h-8 text-center font-mono uppercase tabular-nums"
      />
    </div>
  );
}

/**
 * 色块触发器：点开取色面板。
 * 传 `className` 控制尺寸（参数栏里是 size-7 / size-6 两种）。
 *
 * ⚠️ 「回到默认」这类动作一律放进**面板里**（`onReset`），不要做成行内按钮 ——
 * 行内按钮会占掉一截宽度，把色块从右边缘顶左，同一个组里的行就对不齐了。
 */
export function ColorSwatch({
  color,
  onChange,
  className,
  label,
}: {
  color: string;
  onChange: (color: string) => void;
  className?: string;
  /** 无障碍名（一般是这一行的标题） */
  label?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-sfx="none"
          aria-label={label ?? t("选择颜色")}
          title={color}
          style={{ background: color }}
          className={cn(
            "shrink-0 cursor-pointer rounded-md border border-line transition-[border-color,box-shadow] duration-150",
            "hover:border-[var(--brand-line)] focus-visible:border-[var(--brand)] focus-visible:ring-2 focus-visible:ring-[var(--brand)]/20 focus-visible:outline-none",
            className,
          )}
        />
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="color-popover w-[248px] p-3">
        <ColorPicker value={color} onChange={onChange} />
      </PopoverContent>
    </Popover>
  );
}
