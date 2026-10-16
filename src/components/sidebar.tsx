'use client'

import {
  CalendarDays,
  ChartNoAxesColumn,
  CreditCard,
  Image as ImageIcon,
  Images,
  LogOut,
  MessageCircle,
  Palette,
  Settings,
  WandSparkles,
  type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { signOut } from '@/app/masuk/actions'
import { InstagramIcon } from './instagram-icon'

interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  isComingSoon?: boolean
}

const NAV_ITEMS: readonly NavItem[] = [
  { href: '/kalender', label: 'Kalender', icon: CalendarDays },
  { href: '/buat', label: 'Buat', icon: WandSparkles },
  { href: '/studio', label: 'Studio', icon: Images },
  { href: '/balasan', label: 'Balasan', icon: MessageCircle },
  { href: '/analitik', label: 'Analitik', icon: ChartNoAxesColumn, isComingSoon: true },
  { href: '/aset', label: 'Aset', icon: ImageIcon },
  { href: '/brand', label: 'Brand', icon: Palette },
  { href: '/pengaturan', label: 'Pengaturan', icon: Settings },
]

const ITEM_CLASS = 'flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-[15px] transition-colors'
const IDLE_CLASS = 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
const ICON_SIZE = 20
const ICON_STROKE = 1.75

interface SidebarProps {
  instagramStatus: ReactNode
  /** How much of the period's AI credits is spent. */
  subscriptionStatus: ReactNode
  /** The signed-in user's email. */
  account: ReactNode
}

export function Sidebar({ instagramStatus, subscriptionStatus, account }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside className="border-b border-zinc-200 bg-zinc-50 md:sticky md:top-0 md:flex md:h-screen md:w-60 md:shrink-0 md:flex-col md:border-r md:border-b-0">
      <p className="px-6 pt-5 pb-3 font-semibold tracking-tight text-zinc-900">Social Copilot</p>

      <nav aria-label="Navigasi utama" className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} isActive={pathname.startsWith(item.href)} />
        ))}
      </nav>

      <div className="px-3 pb-4 md:mt-6">
        <p className="px-3 pb-2 text-xs font-semibold tracking-[0.2em] text-zinc-500">CONNECT</p>
        <Link href="/pengaturan#instagram" className={`${ITEM_CLASS} ${IDLE_CLASS} items-start`}>
          <InstagramIcon className="mt-0.5 shrink-0 text-zinc-500" />
          <span className="min-w-0">
            <span className="block">Instagram</span>
            {instagramStatus}
          </span>
        </Link>
        <Link href="/langganan" className={`${ITEM_CLASS} ${IDLE_CLASS} items-start`}>
          <CreditCard size={ICON_SIZE} strokeWidth={ICON_STROKE} className="mt-0.5 shrink-0 text-zinc-500" />
          <span className="min-w-0">
            <span className="block">Langganan</span>
            {subscriptionStatus}
          </span>
        </Link>
      </div>

      <form action={signOut} className="flex items-center gap-2 border-t border-zinc-200 px-6 py-4 md:mt-auto">
        <span className="min-w-0 flex-1">{account}</span>
        <button
          type="submit"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
        >
          <LogOut size={16} strokeWidth={ICON_STROKE} aria-hidden="true" />
          Keluar
        </button>
      </form>
    </aside>
  )
}

interface NavLinkProps {
  item: NavItem
  isActive: boolean
}

function NavLink({ item, isActive }: NavLinkProps) {
  const Icon = item.icon

  if (item.isComingSoon) {
    return (
      <span aria-disabled="true" title="Segera hadir" className={`${ITEM_CLASS} cursor-not-allowed text-zinc-400`}>
        <Icon size={ICON_SIZE} strokeWidth={ICON_STROKE} />
        {item.label}
        <span className="ml-auto rounded-full bg-zinc-200/70 px-2 py-0.5 text-[11px] font-medium text-zinc-500">
          Segera
        </span>
      </span>
    )
  }

  return (
    <Link
      href={item.href}
      aria-current={isActive ? 'page' : undefined}
      className={`${ITEM_CLASS} ${isActive ? 'bg-zinc-200/70 font-medium text-zinc-900' : IDLE_CLASS}`}
    >
      <Icon size={ICON_SIZE} strokeWidth={ICON_STROKE} className={isActive ? 'text-zinc-900' : 'text-zinc-500'} />
      {item.label}
    </Link>
  )
}
