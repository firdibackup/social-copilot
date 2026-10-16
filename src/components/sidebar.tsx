'use client'

import { LogOut } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { signOut } from '@/app/masuk/actions'
import { InstagramIcon } from './instagram-icon'
import { isActive, NAV_ITEMS, type NavItem } from './nav-items'

const SECTION_LABEL = 'px-3 pb-1.5 text-[11px] font-medium tracking-wide text-ink-muted uppercase'
const ITEM_CLASS =
  'group relative flex h-9 items-center gap-3 rounded-lg px-3 text-[14px] font-medium tracking-[-0.01em] transition-colors'
const ICON_SIZE = 18
const ICON_STROKE = 1.75

interface SidebarProps {
  /** Brand logo and name. */
  workspace: ReactNode
  instagramStatus: ReactNode
  /** How much of the period's AI credits is spent. */
  credits: ReactNode
  /** The signed-in user's email. */
  account: ReactNode
}

/** Desktop only; phones get MobileNav at the bottom instead. */
export function Sidebar({ workspace, instagramStatus, credits, account }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside className="hidden h-dvh w-[228px] shrink-0 flex-col gap-6 overflow-y-auto p-4 md:flex">
      {workspace}

      <nav aria-label="Navigasi utama">
        <p className={SECTION_LABEL}>Menu</p>
        <ul>
          {NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <NavLink item={item} active={isActive(item, pathname)} />
            </li>
          ))}
        </ul>
      </nav>

      <section aria-label="Akun terhubung">
        <p className={SECTION_LABEL}>Connect</p>
        <Link href="/pengaturan#instagram" className={`${ITEM_CLASS} h-auto items-start py-2 text-ink-muted hover:text-ink`}>
          <InstagramIcon className="mt-0.5 shrink-0" />
          <span className="min-w-0">
            <span className="block text-ink">Instagram</span>
            {instagramStatus}
          </span>
        </Link>
      </section>

      <section aria-label="Kredit AI">
        <p className={SECTION_LABEL}>Kredit</p>
        {credits}
      </section>

      <form action={signOut} className="mt-auto flex items-center gap-2 border-t border-hairline px-1 pt-4">
        <span className="min-w-0 flex-1">{account}</span>
        <button
          type="submit"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-ink-muted transition-colors hover:bg-white hover:text-ink"
        >
          <LogOut size={16} strokeWidth={ICON_STROKE} aria-hidden="true" />
          Keluar
        </button>
      </form>
    </aside>
  )
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon
  if (item.isComingSoon) {
    return (
      <span aria-disabled="true" title="Segera hadir" className={`${ITEM_CLASS} cursor-not-allowed text-ink-soft`}>
        <Icon size={ICON_SIZE} strokeWidth={ICON_STROKE} />
        {item.label}
        <span className="ml-auto rounded-full bg-zinc-200/70 px-2 py-0.5 text-[11px] font-medium text-zinc-500">Segera</span>
      </span>
    )
  }
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={`${ITEM_CLASS} ${active ? 'font-semibold text-ink' : 'text-ink-muted hover:text-ink'}`}
    >
      {/* The active page gets a dot, not a highlighted row. */}
      <span
        aria-hidden="true"
        className={`absolute top-1/2 -left-0.5 size-1.5 -translate-y-1/2 rounded-full ${active ? 'bg-accent' : 'bg-transparent'}`}
      />
      <Icon size={ICON_SIZE} strokeWidth={ICON_STROKE} className={active ? 'text-ink' : 'text-ink-soft group-hover:text-ink'} />
      {item.label}
    </Link>
  )
}
