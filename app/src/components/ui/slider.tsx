import * as React from "react";
import { Slider as SliderPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

/**
 * 滑块：与 Switch / Select / Dialog 同属一套交互语言
 * （主题色 + 短促缓动 + 悬停/按下的即时反馈）。
 * 说明：换算成整数或任意步长都能用；键盘方向键同样会走这里。
 */
export const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn("group/slider relative flex w-full touch-none select-none items-center", className)}
    {...props}
  >
    {/* 轨道用主题浅色，已滑动区用主题色 */}
    <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-[var(--brand-soft)] transition-colors">
      <SliderPrimitive.Range className="absolute h-full bg-[var(--brand)]" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb
      className={cn(
        "block size-3.5 rounded-full border-2 border-[var(--brand)] bg-surface shadow-[0_1px_3px_rgba(0,0,0,0.12)]",
        "transition-[transform,box-shadow] duration-150 ease-out",
        "hover:scale-110 group-hover/slider:scale-105",
        "active:scale-[1.25] active:shadow-[0_0_0_5px_var(--brand-soft)]",
        "focus-visible:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/40",
      )}
    />
  </SliderPrimitive.Root>
));
Slider.displayName = "Slider";
