import { createTranslator } from 'next-intl'
import type { Locale } from '@/i18n/locale-config'
import id from '../../../../../messages/id/brand.json'
import en from '../../../../../messages/en/brand.json'

/** Translate known legacy library messages at the UI boundary without changing stored data or logs. */
export function localizeLibraryMessage(message: string, locale: Locale): string {
  if (locale === 'id') return message
  const t = createTranslator({ locale, messages: en })
  for (const key of Object.keys(id.libraryErrors) as (keyof typeof id.libraryErrors)[]) {
    const source = id.libraryErrors[key]
    const variables: string[] = []
    const pattern = source.split(/(\{\w+\})/).map((part) => {
      if (/^\{\w+\}$/.test(part)) {
        variables.push(part.slice(1, -1))
        return '([\\s\\S]*?)'
      }
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }).join('')
    const match = message.match(new RegExp(`^${pattern}$`))
    if (match) return t(`libraryErrors.${key}`, Object.fromEntries(variables.map((name, index) => [name, match[index + 1]])))
  }
  // Unknown upstream messages may be provider text or owner content, not application copy.
  return message
}
