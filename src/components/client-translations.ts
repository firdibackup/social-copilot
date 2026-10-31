'use client'

import { createTranslator } from 'next-intl'
import id from '../../messages/id/common.json'
import en from '../../messages/en/common.json'
import { resolveLocale, type Locale } from '@/i18n/locale-config'

/** Plain event-handler helpers also serve callers outside React hooks. */
export function commonTranslations(locale?: Locale) {
  const current = locale ?? resolveLocale(typeof document === 'undefined' ? undefined : document.documentElement.lang)
  return createTranslator({ locale: current, messages: { common: current === 'en' ? en : id }, namespace: 'common' })
}
