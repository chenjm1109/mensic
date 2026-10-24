/**
 * 多语言运行时。
 *
 * 约定：**中文原文就是词条键**（key = 源码里的中文），其他语言是「中文 → 译文」的词典。
 * 这样新增语言不用改动界面代码，且词典缺条目时会自动回退到中文原文，不会出现空白。
 * 带变量的句子在源码里写成模板，如 t("删除 {n} 个项目", { n: 3 })。
 */

import en from "./en";
import { DEFAULT_LOCALE, LOCALES, isLocale, localeInfo, type Locale } from "./locales";

const DICTS: Partial<Record<Locale, Record<string, string>>> = { en };

let current: Locale = DEFAULT_LOCALE;

/** 应用当前语言（由 store 在初始化/切换时调用） */
export function setLocale(locale: Locale): void {
  current = isLocale(locale) ? locale : DEFAULT_LOCALE;
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("lang", localeInfo(current).htmlLang);
  }
}

export function getLocale(): Locale {
  return current;
}

/** 当前语言下的应用名（中文「涵数」/ 英文「mensic」） */
export function tAppName(locale: Locale = current): string {
  return localeInfo(locale).appName;
}

/** 取文案：缺条目时回退中文原文 */
export function t(text: string, vars?: Record<string, string | number>): string {
  const dict = DICTS[current];
  const raw = (dict && dict[text]) || text;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (m, key) => (key in vars ? String(vars[key]) : m));
}

declare global {
  /**
   * 全局 `t`：界面文案统一走它，省去逐组件 import。
   * 切换语言时的重渲染由 App 订阅 store.locale 完成（见 App.tsx）。
   */
  // eslint-disable-next-line no-var
  var t: (text: string, vars?: Record<string, string | number>) => string;
}

if (typeof globalThis !== "undefined") {
  (globalThis as unknown as { t: typeof t }).t = t;
}

export { LOCALES, DEFAULT_LOCALE, isLocale, localeInfo };
export type { Locale };
