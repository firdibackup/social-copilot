import { getTranslations } from 'next-intl/server'
import { IntlMessages } from '@/i18n/client-messages'
import { Suspense, type ReactNode } from 'react'
import { LoadingState } from '@/components/loading-state'
import { requireAccount } from '@/lib/auth'
import { MimoProvider } from './mimo-provider'

export default async function MimoLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations('mimo.page')
  return <Suspense fallback={<LoadingState variant="chat" className="h-full" label={t('loading')} />}><AuthenticatedWorkspace>{children}</AuthenticatedWorkspace></Suspense>
}

async function AuthenticatedWorkspace({ children }: { children: ReactNode }) {
  const { userId, accountId } = await requireAccount()
  const scope = `${userId}:${accountId}`
  return <IntlMessages namespaces={['common', 'mimo']}><MimoProvider key={scope} scope={scope} revision={new Date().getTime()}>{children}</MimoProvider></IntlMessages>
}
