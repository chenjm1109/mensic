import { useStore } from "@/store";
import { t, tAppName } from "./index";

/**
 * 组件里取文案：返回 `t`，但会订阅当前语言 —— 切换语言时组件自动重渲染。
 * 用法：`const t = useT(); … t("导出") …`
 */
export function useT() {
  useStore((s) => s.locale);
  return t;
}

/** 组件里取应用名（随语言变化） */
export function useAppName(): string {
  const locale = useStore((s) => s.locale);
  return tAppName(locale);
}
