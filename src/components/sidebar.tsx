'use client'

import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { PiSignOut } from 'react-icons/pi'
import { signOut } from '@/app/masuk/actions'
import { InstagramIcon } from './instagram-icon'
import { LocaleToggle } from './locale-toggle'
import { ADMIN_ITEM, isActive, NAV_ITEMS, type NavItem } from './nav-items'
import { ThreadsIcon } from './threads-icon'

const SECTION_LABEL = 'px-3 pb-1 text-[12px] font-medium text-ink-muted'
const ITEM_CLASS =
  'group relative flex items-center gap-3 rounded-[10px] px-3 text-[14px] font-medium tracking-[-0.01em] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-[-2px]'
const ICON_SIZE = 19

interface SidebarProps {
  /** Brand logo and name. */
  workspace: ReactNode
  instagramStatus: ReactNode
  threadsStatus: ReactNode
  /** How much of the period's AI credits is spent. */
  credits: ReactNode
  /** The signed-in user's email. */
  account: ReactNode
  /** AdminSection for admins; renders nothing for everyone else. */
  admin: ReactNode
}

/** Desktop only; phones get MobileNav at the bottom instead. */
export function Sidebar({ workspace, instagramStatus, threadsStatus, credits, account, admin }: SidebarProps) {
  const t = useTranslations('shell')
  const pathname = usePathname()

  return (
    <aside className="bg-sidebar hidden h-dvh w-[236px] shrink-0 flex-col gap-6 overflow-y-auto p-4 md:flex">
      {workspace}

      <nav aria-label={t('navigation')}>
        <p className={SECTION_LABEL}>{t('menu')}</p>
        <ul className="space-y-0.5">
          {NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <NavLink item={item} active={isActive(item, pathname)} />
            </li>
          ))}
        </ul>
      </nav>

      {admin}

      <section aria-label={t('connectedAccounts')}>
        <p className={SECTION_LABEL}>{t('connect')}</p>
        <Link href="/pengaturan#instagram" className={`${ITEM_CLASS} min-h-10 items-start py-2 text-ink-muted hover:bg-white/70 hover:text-ink`}>
          <InstagramIcon className="mt-0.5 shrink-0" />
          <span className="min-w-0">
            <span className="block text-ink">{t('platforms.instagram')}</span>
            {instagramStatus}
          </span>
        </Link>
        <Link href="/pengaturan#threads" className={`${ITEM_CLASS} min-h-10 items-start py-2 text-ink-muted hover:bg-white/70 hover:text-ink`}>
          <ThreadsIcon className="mt-0.5 shrink-0" />
          <span className="min-w-0">
            <span className="block text-ink">{t('platforms.threads')}</span>
            {threadsStatus}
          </span>
        </Link>
      </section>

      <section aria-label={t('aiCredits')}>
        <p className={SECTION_LABEL}>{t('credits')}</p>
        {credits}
      </section>

      <div className="mt-auto border-t border-[#e3e0f5] px-1 pt-4">
        <LocaleToggle variant="app" className="mb-3" />
        <form action={signOut} className="flex items-center gap-2">
          <span className="min-w-0 flex-1">{account}</span>
          <button
            type="submit"
            data-logout
            className="inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-sm text-ink-muted transition-colors duration-150 hover:bg-white hover:text-ink"
          >
            <PiSignOut size={17} aria-hidden="true" />
            {t('signOut')}
          </button>
        </form>
      </div>
    </aside>
  )
}

/** The Admin link; the layout renders it only for admins. */
export function AdminSection() {
  const t = useTranslations('shell')
  const pathname = usePathname()
  return (
    <nav aria-label={t('admin')}>
      <p className={SECTION_LABEL}>{t('admin')}</p>
      <NavLink item={ADMIN_ITEM} active={isActive(ADMIN_ITEM, pathname)} />
    </nav>
  )
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const t = useTranslations('shell')
  const Icon = (active && item.activeIcon) || item.icon
  return (
    <Link
      href={item.href}
      prefetch={true}
      aria-current={active ? 'page' : undefined}
      className={`${ITEM_CLASS} min-h-11 ${active ? 'bg-white font-semibold text-ink shadow-[0_1px_2px_rgb(43_33_160/0.08)]' : 'text-ink-muted hover:bg-white/70 hover:text-ink'}`}
    >
      {/* The current page: three shrinking slides, the logo's carousel, in its gradient. */}
      {active && (
        <span aria-hidden="true" className="absolute top-1/2 left-1 flex -translate-y-1/2 items-center gap-[2px]">
          <span className="bg-signature h-4 w-[3px] rounded-full" />
          <span className="bg-signature h-2.5 w-[3px] rounded-full opacity-70" />
          <span className="bg-signature h-1.5 w-[3px] rounded-full opacity-45" />
        </span>
      )}
      <Icon
        size={ICON_SIZE}
        aria-hidden="true"
        className={`shrink-0 ${active ? 'ml-2 text-accent-deep' : 'text-ink-muted group-hover:text-ink'} transition-[margin] duration-150 motion-reduce:transition-none`}
      />
      <span className="min-w-0 truncate">{t(`nav.${item.labelKey}`)}</span>
    </Link>
  )
}
