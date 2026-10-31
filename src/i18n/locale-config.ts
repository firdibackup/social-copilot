/** Client-safe locale constants. Server callers can import these from ./locale too. */
export const LOCALES = ['id', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'id';
export const LOCALE_COOKIE = 'locale';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && LOCALES.includes(value as Locale);
}

export function resolveLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export function intlLocale(locale: Locale): 'id-ID' | 'en-US' {
  return locale === 'id' ? 'id-ID' : 'en-US';
}
