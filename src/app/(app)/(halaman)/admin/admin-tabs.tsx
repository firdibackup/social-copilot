'use client'

import { useTranslations } from 'next-intl'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const activeTab = (href: string, pathname: string) => (href === '/admin' ? pathname === href : pathname.startsWith(href))

export function AdminTabs() {
  const t = useTranslations('admin')

  const TABS = [
  { href: '/admin', label: t('admin_tabs.overview') },
  { href: '/admin/pengguna', label: t('admin_tabs.users') },
  { href: '/admin/pembayaran', label: t('admin_tabs.payments') },
  { href: '/admin/kupon', label: t('admin_tabs.coupon') },
  { href: '/admin/template', label: t('admin_tabs.templates') },
  { href: '/admin/pengaturan', label: t('admin_tabs.settings') },
]

  const pathname = usePathname()
  return (
    <nav aria-label={t('admin_tabs.adminSections')} className="flex gap-1 border-b border-zinc-200">
      {TABS.map((tab) => {
        const active = activeTab(tab.href, pathname)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${active ? 'border-zinc-900 text-zinc-900' : 'border-transparent text-zinc-500 hover:text-zinc-900'}`}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
