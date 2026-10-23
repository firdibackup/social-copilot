import { getConnection, getConnectedAccountId } from '@/lib/connection'
import { hasFacebookConnection } from '@/lib/facebook-connection'
import { getThreadsConnection } from '@/lib/threads-connection'
import { firstValue, type SearchParams } from '@/lib/params'
import { Notice } from '@/components/notice'
import { disconnectFacebook, disconnectInstagram, disconnectThreads } from './actions'

/** Connection removal stays available even when paid features and onboarding are unavailable. */
export async function InactiveConnections({ userId, params }: { userId: string; params: SearchParams }) {
  const [instagram, facebook, accountId] = await Promise.all([getConnection(userId), hasFacebookConnection(userId), getConnectedAccountId(userId)])
  const threads = accountId ? await getThreadsConnection(userId, accountId) : null
  const disconnected = ['ig', 'fb', 'th'].some((key) => firstValue(params[key]) === 'disconnected')
  const failed = ['ig_error', 'fb_error', 'th_error'].some((key) => firstValue(params[key]) === 'gagal_putus')
  return <section className="space-y-4">
    {disconnected && <Notice tone="success">Koneksi akun sudah diputus.</Notice>}
    {failed && <Notice tone="error">Koneksi gagal diputus. Coba lagi.</Notice>}
    {(instagram || facebook || threads) && <><h2 className="text-lg font-semibold">Koneksi akun</h2><p className="text-sm text-ink-muted">Token akses tersimpan terenkripsi. Putuskan koneksi untuk menghapus token aksesnya.</p>
      <div className="flex flex-wrap gap-2">{[
        { show: instagram, label: `Putuskan Instagram @${instagram?.username}`, action: disconnectInstagram },
        { show: facebook, label: 'Putuskan Facebook', action: disconnectFacebook },
        { show: threads, label: 'Putuskan Threads', action: disconnectThreads },
      ].filter((item) => item.show).map((item) => <form key={item.label} action={item.action}><button className="min-h-11 rounded-lg border border-hairline px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50">{item.label}</button></form>)}</div></>}
  </section>
}
