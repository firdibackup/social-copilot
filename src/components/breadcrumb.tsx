'use client'

import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { PiCaretRight, PiHouse } from 'react-icons/pi'
import { ADMIN_ITEM, isActive, NAV_ITEMS } from './nav-items'

/** Home › the current page, at the top of the main card. */
export function Breadcrumb() {
  const t = useTranslations('shell')
  const pathname = usePathname()
  const page = [...NAV_ITEMS, ADMIN_ITEM].find((item) => isActive(item, pathname))

  return (
    <nav aria-label={t('breadcrumb')} className="flex min-w-0 items-center gap-2 text-sm">
      <Link href="/kalender" aria-label={t('home')} className="-m-2 grid size-10 shrink-0 place-items-center rounded-lg text-ink-muted transition-colors duration-150 hover:bg-zinc-100 hover:text-ink">
        <PiHouse size={18} aria-hidden="true" />
      </Link>
      {page && (
        <>
          <PiCaretRight size={13} className="shrink-0 text-ink-soft" aria-hidden="true" />
          <span aria-current="page" className="truncate font-semibold text-ink">
            {t(`nav.${page.labelKey}`)}
          </span>
        </>
      )}
    </nav>
  )
}
