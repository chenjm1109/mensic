import {
  Button as AnimateButton,
  buttonVariants,
  type ButtonProps as AnimateButtonProps,
} from "@/components/animate-ui/components/buttons/button";

type ButtonSize = "default" | "sm" | "lg" | "icon" | "iconSm" | "icon-sm" | "icon-lg";

export interface ButtonProps extends Omit<AnimateButtonProps, "size"> {
  size?: ButtonSize;
  asChild?: boolean;
}

/** 基于 Animate UI 的动画按钮（保留原 variant/size 名称，iconSm → icon-sm） */
export function Button({ size = "default", ...props }: ButtonProps) {
  const mapped = (size === "iconSm" ? "icon-sm" : size) as AnimateButtonProps["size"];
  return <AnimateButton {...(props as AnimateButtonProps)} size={mapped} />;
}

export { buttonVariants };
