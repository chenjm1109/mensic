/**
 * 语言清单。
 *
 * 新增一门语言 = 在 `locales/` 下加一个词典文件（键是中文原文，值是译文）
 * + 在这里加一条 LOCALES 记录，别处不用改。
 */

export type Locale = "zh" | "en";

export interface LocaleInfo {
  id: Locale;
  /** 该语言自己的写法（语言切换器里显示） */
  nativeLabel: string;
  /** 应用名（首页字标、标题栏、窗口标题随语言变化） */
  appName: string;
  /** <html lang> 的值 */
  htmlLang: string;
}

export const LOCALES: readonly LocaleInfo[] = [
  { id: "zh", nativeLabel: "中文", appName: "涵数", htmlLang: "zh-CN" },
  { id: "en", nativeLabel: "English", appName: "mensic", htmlLang: "en" },
];

export const DEFAULT_LOCALE: Locale = "zh";

export function isLocale(value: unknown): value is Locale {
  return LOCALES.some((l) => l.id === value);
}

export function localeInfo(locale: Locale): LocaleInfo {
  return LOCALES.find((l) => l.id === locale) ?? LOCALES[0];
}
