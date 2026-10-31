
import { getTranslations } from 'next-intl/server'
import { getConnection, getConnectedAccountId } from '@/lib/connection'
import { getThreadsConnection } from '@/lib/threads-connection'
import { firstValue, type SearchParams } from '@/lib/params'
import { Notice } from '@/components/notice'
import { disconnectInstagram, disconnectThreads } from './actions'

/** Connection removal stays available even when paid features and onboarding are unavailable. */
export async function InactiveConnections({ userId, params }: { userId: string; params: SearchParams }) {
  const t = await getTranslations('settings')

  const [instagram, accountId] = await Promise.all([getConnection(userId), getConnectedAccountId(userId)])
  const threads = accountId ? await getThreadsConnection(userId, accountId) : null
  const disconnected = ['ig', 'th'].some((key) => firstValue(params[key]) === 'disconnected')
  const failed = ['ig_error', 'th_error'].some((key) => firstValue(params[key]) === 'gagal_putus')
  return <section className="space-y-4">
    {disconnected && <Notice tone="success">{t('inactive_connections.accountDisconnected')}</Notice>}
    {failed && <Notice tone="error">{t('inactive_connections.couldnTDisconnectTryAgain')}</Notice>}
    {(instagram || threads) && <><h2 className="text-lg font-semibold">{t('inactive_connections.accountConnections')}</h2><p className="text-sm text-ink-muted">{t('inactive_connections.accessTokensAreStoredEncryptedDisconnectAn')}</p>
      <div className="flex flex-wrap gap-2">{[
        { show: instagram, label: t('inactive_connections.disconnectInstagram', { v0: instagram?.username ?? '' }), action: disconnectInstagram },
        { show: threads, label: t('inactive_connections.disconnectThreads'), action: disconnectThreads },
      ].filter((item) => item.show).map((item) => <form key={item.label} action={item.action}><button className="min-h-11 rounded-lg border border-hairline px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50">{item.label}</button></form>)}</div></>}
  </section>
}
