'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/admin', label: 'Ringkasan' },
  { href: '/admin/pengguna', label: 'Pengguna' },
  { href: '/admin/template', label: 'Template' },
  { href: '/admin/pengaturan', label: 'Pengaturan' },
]

const activeTab = (href: string, pathname: string) => (href === '/admin' ? pathname === href : pathname.startsWith(href))

export function AdminTabs() {
  const pathname = usePathname()
  return (
    <nav aria-label="Bagian admin" className="flex gap-1 border-b border-zinc-200">
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
