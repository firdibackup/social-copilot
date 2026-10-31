import { getTranslations } from 'next-intl/server'
import { connection } from 'next/server'
import { requireUser } from '@/lib/auth'
import { getConnectedAccountId } from '@/lib/connection'
import { describeError } from '@/lib/errors'
import { getThreadsConnection } from '@/lib/threads-connection'
import { StatusLine } from './instagram-status'

async function loadStatus(): Promise<Parameters<typeof StatusLine>[0]> {
  // Read at request time, like the Instagram line.
  await connection()
  const t = await getTranslations('shell')
  const userId = await requireUser()
  try {
    const accountId = await getConnectedAccountId(userId)
    if (!accountId) return { tone: 'muted', label: t('connection.instagramRequired') }
    const current = await getThreadsConnection(userId, accountId)
    if (!current) return { tone: 'muted', label: t('connection.disconnected') }
    if (current.status === 'needs_reconnect') return { tone: 'warning', label: t('connection.reconnect') }
    return { tone: 'ok', label: `@${current.username}` }
  } catch (error) {
    console.error('[threads] status sidebar gagal:', describeError(error))
    return { tone: 'muted', label: t('connection.unavailable') }
  }
}

/** Sidebar status from the database only. */
export async function ThreadsStatus() {
  return <StatusLine {...await loadStatus()} />
}
