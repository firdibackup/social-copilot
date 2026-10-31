'use server';

import {cookies} from 'next/headers';
import {isLocale, LOCALE_COOKIE, type Locale} from './locale';

const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

export async function setLocale(locale: Locale): Promise<void> {
  if (!isLocale(locale)) {
    throw new Error('Unsupported locale');
  }

  (await cookies()).set(LOCALE_COOKIE, locale, {
    maxAge: ONE_YEAR_IN_SECONDS,
    path: '/',
    sameSite: 'lax'
  });
}
