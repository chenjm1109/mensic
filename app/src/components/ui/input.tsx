import * as React from "react";
import { cn } from "@/lib/utils";
import { TYPO } from "@/core/typography";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = "text", ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        TYPO.body,
        "flex h-8 w-full rounded-md border border-input bg-transparent px-2.5 py-1 outline-none transition-colors",
        "placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
