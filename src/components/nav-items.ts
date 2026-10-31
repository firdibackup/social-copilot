import type { ComponentType } from 'react'
import {
  PiCalendarDots,
  PiCalendarDotsDuotone,
  PiChartLineUp,
  PiChartLineUpDuotone,
  PiChatsCircle,
  PiChatsCircleDuotone,
  PiGearSix,
  PiGearSixDuotone,
  PiImages,
  PiImagesDuotone,
  PiShieldCheck,
  PiShieldCheckDuotone,
  PiSlideshow,
  PiSlideshowDuotone,
  PiSwatches,
  PiSwatchesDuotone,
} from 'react-icons/pi'
import { MimoIcon } from './mimo-mascot-icon'

/** What the menus pass an icon; Phosphor icons (react-icons/pi) take these, and so does MimoIcon. */
export interface NavIconProps {
  size?: number
  strokeWidth?: number
  className?: string
  'aria-hidden'?: boolean | 'true' | 'false'
}

export type NavIcon = ComponentType<NavIconProps>

export interface NavItem {
  href: string
  labelKey: 'calendar' | 'mimo' | 'create' | 'inbox' | 'analytics' | 'assets' | 'brand' | 'settings' | 'admin'
  /** Optional compact label for the phone's six-slot bottom bar. */
  shortLabelKey?: 'mimoShort'
  /** Regular weight, for every page but the current one. */
  icon: NavIcon
  /** Duotone weight, for the current page; MimoIcon colours itself instead. */
  activeIcon?: NavIcon
  /** Left out of the phone's bottom bar, which has room for six. */
  desktopOnly?: boolean
}

/** The app's pages, for the sidebar, the phone's bottom bar and the breadcrumb. */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/kalender', labelKey: 'calendar', icon: PiCalendarDots, activeIcon: PiCalendarDotsDuotone },
  { href: '/mimo', labelKey: 'mimo', shortLabelKey: 'mimoShort', icon: MimoIcon },
  { href: '/buat', labelKey: 'create', icon: PiSlideshow, activeIcon: PiSlideshowDuotone },
  { href: '/balasan', labelKey: 'inbox', icon: PiChatsCircle, activeIcon: PiChatsCircleDuotone },
  { href: '/analitik', labelKey: 'analytics', icon: PiChartLineUp, activeIcon: PiChartLineUpDuotone, desktopOnly: true },
  { href: '/aset', labelKey: 'assets', icon: PiImages, activeIcon: PiImagesDuotone, desktopOnly: true },
  { href: '/brand', labelKey: 'brand', icon: PiSwatches, activeIcon: PiSwatchesDuotone },
  { href: '/pengaturan', labelKey: 'settings', icon: PiGearSix, activeIcon: PiGearSixDuotone },
]

/** Shown only to admins (ADMIN_EMAILS), in the sidebar under its own heading. */
export const ADMIN_ITEM: NavItem = { href: '/admin', labelKey: 'admin', icon: PiShieldCheck, activeIcon: PiShieldCheckDuotone }

export const isActive = (item: NavItem, pathname: string) => pathname.startsWith(item.href)
