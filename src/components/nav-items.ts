import {
  CalendarDays,
  ChartNoAxesColumn,
  Image as ImageIcon,
  MessageCircle,
  Palette,
  Settings,
  ShieldCheck,
  WandSparkles,
} from 'lucide-react'
import type { ComponentType } from 'react'
import { MimoIcon } from './mimo-mascot-icon'

/** What the menus pass an icon; lucide icons take these, and so does MimoIcon. */
export interface NavIconProps {
  size?: number
  strokeWidth?: number
  className?: string
  'aria-hidden'?: boolean | 'true' | 'false'
}

export type NavIcon = ComponentType<NavIconProps>

export interface NavItem {
  href: string
  label: string
  /** Optional compact label for the phone's six-slot bottom bar. */
  shortLabel?: string
  icon: NavIcon
  /** Left out of the phone's bottom bar, which has room for six. */
  desktopOnly?: boolean
}

/** The app's pages, for the sidebar, the phone's bottom bar and the breadcrumb. */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/kalender', label: 'Kalender', icon: CalendarDays },
  { href: '/mimo', label: 'Mimo Chat', shortLabel: 'Mimo', icon: MimoIcon },
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
