import {
  CalendarDays,
  ChartNoAxesColumn,
  Image as ImageIcon,
  MessageCircle,
  Palette,
  Settings,
  WandSparkles,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  isComingSoon?: boolean
  /** Left out of the phone's bottom bar, which has room for six. */
  desktopOnly?: boolean
}

/** The app's pages, for the sidebar, the phone's bottom bar and the breadcrumb. */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/kalender', label: 'Kalender', icon: CalendarDays },
  { href: '/buat', label: 'Buat', icon: WandSparkles },
  { href: '/balasan', label: 'Balasan', icon: MessageCircle },
  { href: '/analitik', label: 'Analitik', icon: ChartNoAxesColumn, isComingSoon: true, desktopOnly: true },
  { href: '/aset', label: 'Aset', icon: ImageIcon },
  { href: '/brand', label: 'Brand', icon: Palette },
  { href: '/pengaturan', label: 'Pengaturan', icon: Settings },
]

export const isActive = (item: NavItem, pathname: string) => pathname.startsWith(item.href)
