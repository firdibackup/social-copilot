'use client'

import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { isActive, NAV_ITEMS } from './nav-items'

/** The phone's bottom bar, in place of the sidebar. Pages leave 56 px (plus the home indicator) free for it. */
export function MobileNav() {
  const t = useTranslations('shell')
  const pathname = usePathname()
  const items = NAV_ITEMS.filter((item) => !item.desktopOnly)

  return (
    <nav
      aria-label={t('navigation')}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
    >
      <ul className="flex h-14">
        {items.map((item) => {
          const active = isActive(item, pathname)
          const Icon = (active && item.activeIcon) || item.icon
          return (
            <li key={item.href} className="min-w-0 flex-1">
              <Link
                href={item.href}
                prefetch={true}
                aria-current={active ? 'page' : undefined}
                className={`relative flex h-full flex-col items-center justify-center gap-0.5 px-0.5 text-[10px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-[-4px] ${active ? 'text-accent-deep' : 'text-ink-muted active:text-ink'}`}
              >
                {/* The current page: the logo's three slides, in its gradient, along the top edge. */}
                {active && (
                  <span aria-hidden="true" className="absolute top-0 left-1/2 flex -translate-x-1/2 items-start gap-[2px]">
                    <span className="bg-signature h-[3px] w-4 rounded-b-full" />
                    <span className="bg-signature h-[3px] w-2.5 rounded-b-full opacity-70" />
                    <span className="bg-signature h-[3px] w-1.5 rounded-b-full opacity-45" />
                  </span>
                )}
                <Icon size={21} aria-hidden="true" />
                <span className="max-w-full truncate">{t(`nav.${item.shortLabelKey ?? item.labelKey}`)}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
