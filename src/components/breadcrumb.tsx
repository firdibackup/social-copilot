'use client'

import { ChevronRight, House } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ADMIN_ITEM, isActive, NAV_ITEMS } from './nav-items'

/** Home › the current page, at the top of the main card. */
export function Breadcrumb() {
  const pathname = usePathname()
  const page = [...NAV_ITEMS, ADMIN_ITEM].find((item) => isActive(item, pathname))

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-sm">
      <Link href="/kalender" aria-label="Beranda" className="text-ink-muted transition-colors hover:text-ink">
        <House size={18} strokeWidth={1.75} aria-hidden="true" />
      </Link>
      {page && (
        <>
          <ChevronRight size={16} className="shrink-0 text-ink-soft" aria-hidden="true" />
          <span aria-current="page" className="truncate font-semibold text-ink">
            {page.label}
          </span>
        </>
      )}
    </nav>
  )
}
