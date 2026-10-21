import {
  CalendarDays,
  ChartNoAxesColumn,
  Image as ImageIcon,
  MessageCircle,
  Palette,
  Settings,
  ShieldCheck,
  Sparkles,
  WandSparkles,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  /** Left out of the phone's bottom bar, which has room for six. */
  desktopOnly?: boolean
}

/** The app's pages, for the sidebar, the phone's bottom bar and the breadcrumb. */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/kalender', label: 'Kalender', icon: CalendarDays },
  { href: '/sigap', label: 'Sigap', icon: Sparkles },
  { href: '/buat', label: 'Buat', icon: WandSparkles },
  { href: '/balasan', label: 'Balasan', icon: MessageCircle },
  { href: '/analitik', label: 'Analitik', icon: ChartNoAxesColumn, desktopOnly: true },
  { href: '/aset', label: 'Aset', icon: ImageIcon, desktopOnly: true },
  { href: '/brand', label: 'Brand', icon: Palette },
  { href: '/pengaturan', label: 'Pengaturan', icon: Settings },
]

/** Shown only to admins (ADMIN_EMAILS), in the sidebar under its own heading. */
export const ADMIN_ITEM: NavItem = { href: '/admin', label: 'Admin', icon: ShieldCheck }

export const isActive = (item: NavItem, pathname: string) => pathname.startsWith(item.href)
