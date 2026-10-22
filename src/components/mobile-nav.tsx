'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { isActive, NAV_ITEMS } from './nav-items'

/** The phone's bottom bar, in place of the sidebar. Pages leave 56 px (plus the home indicator) free for it. */
export function MobileNav() {
  const pathname = usePathname()
  const items = NAV_ITEMS.filter((item) => !item.desktopOnly)

  return (
    <nav
      aria-label="Navigasi utama"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
    >
      <ul className="flex h-14">
        {items.map((item) => {
          const active = isActive(item, pathname)
          const Icon = item.icon
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                prefetch={true}
                aria-current={active ? 'page' : undefined}
                className={`flex h-full flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${active ? 'text-accent' : 'text-ink-muted'}`}
              >
                <Icon size={20} strokeWidth={active ? 2 : 1.75} aria-hidden="true" />
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
