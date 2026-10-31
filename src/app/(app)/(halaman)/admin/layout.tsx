import { IntlMessages } from '@/i18n/client-messages'

import { getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'
import { AdminTabs } from './admin-tabs'

/** Every admin page checks requireAdmin() itself; this only frames them. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations('admin')

  return (
    <IntlMessages namespaces={['common', 'admin']}><div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Admin</h1>
        <p className="text-zinc-500">{t('layout.usersSubscriptionsAiCreditsAndTheModels')}</p>
      </header>
      <AdminTabs />
      {children}
    </div></IntlMessages>
  )
}
