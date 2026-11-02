'use client'

import { Earth } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { setLocale } from '@/i18n/actions'
import { LOCALES, type Locale } from '@/i18n/locale-config'
import { LEGAL_PAGES } from './legal-pages'

/** Privasi · Syarat · Refund · Hapus Data, with the current page marked, plus the language switch. */
export function LegalNav() {
  const t = useTranslations('common.site')
  const pathname = usePathname()
  return (
    <nav aria-label={t('legalNav')} className="flex items-center gap-0.5 text-[13px] sm:gap-1">
      <ul className="flex items-center gap-0.5 sm:gap-1">
        {LEGAL_PAGES.map(({ href, label }) => {
          const current = pathname === href
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={current ? 'page' : undefined}
                className={`relative inline-flex h-9 items-center rounded-md px-1.5 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-focus sm:px-2.5 ${
                  current
                    ? 'font-medium text-ink after:absolute after:inset-x-1.5 after:-bottom-[13px] after:h-0.5 after:rounded-full after:bg-primary sm:after:inset-x-2.5 sm:after:-bottom-[17px]'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                {t(label)}
              </Link>
            </li>
          )
        })}
      </ul>
      <LocaleSwitch />
    </nav>
  )
}

const LABEL_KEYS: Record<Locale, 'indonesian' | 'english'> = { id: 'indonesian', en: 'english' }

/** A compact globe button that flips between ID and EN; it shows the current language. */
function LocaleSwitch() {
  const locale = useLocale() as Locale
  const t = useTranslations('common')
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const next = LOCALES.find((option) => option !== locale) ?? 'id'
  return (
    <button
      type="button"
      disabled={pending}
      aria-busy={pending}
      aria-label={`${t('localeToggleLabel')}: ${t(LABEL_KEYS[next])}`}
      title={t(LABEL_KEYS[next])}
      onClick={() => startTransition(async () => { await setLocale(next); router.refresh() })}
      className="ml-1 inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-transparent px-2 text-ink-muted transition-colors duration-150 hover:border-hairline hover:bg-paper hover:text-ink focus-visible:outline-2 focus-visible:outline-focus disabled:cursor-wait disabled:opacity-60 sm:ml-2"
    >
      <Earth size={15} aria-hidden="true" />
      <span className="text-[11px] font-semibold tracking-[0.06em]">{locale.toUpperCase()}</span>
    </button>
  )
}
