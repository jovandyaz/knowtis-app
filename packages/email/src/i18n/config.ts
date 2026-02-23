export const SUPPORTED_LOCALES = ['en', 'es'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

const HTML_LANG_MAP: Record<Locale, string> = { en: 'en', es: 'es' };
export const getHtmlLang = (locale: Locale): string => HTML_LANG_MAP[locale];
