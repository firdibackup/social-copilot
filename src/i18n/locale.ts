import {cookies} from 'next/headers';
import {LOCALE_COOKIE, resolveLocale, type Locale} from './locale-config';

export {LOCALES, DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, resolveLocale, intlLocale, type Locale} from './locale-config';

/** Requires a request context; worker callers should resolve this before enqueueing work. */
export async function getUserLocale(): Promise<Locale> {
  return resolveLocale((await cookies()).get(LOCALE_COOKIE)?.value);
}
