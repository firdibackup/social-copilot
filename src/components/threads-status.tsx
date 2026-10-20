import { connection } from 'next/server'
import { requireUser } from '@/lib/auth'
import { getConnectedAccountId } from '@/lib/connection'
import { describeError } from '@/lib/errors'
import { getThreadsConnection } from '@/lib/threads-connection'
import { StatusLine } from './instagram-status'

async function loadStatus(): Promise<Parameters<typeof StatusLine>[0]> {
  // Read at request time, like the Instagram line.
  await connection()
  const userId = await requireUser()
  try {
    const accountId = await getConnectedAccountId(userId)
    if (!accountId) return { tone: 'muted', label: 'Butuh Instagram' }
    const current = await getThreadsConnection(userId, accountId)
    if (!current) return { tone: 'muted', label: 'Belum terhubung' }
    if (current.status === 'needs_reconnect') return { tone: 'warning', label: 'Perlu disambung ulang' }
    return { tone: 'ok', label: `@${current.username}` }
  } catch (error) {
    console.error('[threads] status sidebar gagal:', describeError(error))
    return { tone: 'muted', label: 'Status tidak tersedia' }
  }
}

/** Sidebar status from the database only. */
export async function ThreadsStatus() {
  return <StatusLine {...await loadStatus()} />
}
