import { connection } from 'next/server'
import { requireUser } from '@/lib/auth'
import { getConnection } from '@/lib/connection'
import { describeError } from '@/lib/errors'

type Tone = 'ok' | 'warning' | 'muted'

interface Status {
  tone: Tone
  label: string
}

const DOT_CLASS: Record<Tone, string> = {
  ok: 'bg-emerald-500',
  warning: 'bg-amber-500',
  muted: 'bg-zinc-300',
}

export function StatusLine({ tone, label }: Status) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-zinc-500">
      <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${DOT_CLASS[tone]}`} />
      <span className="truncate">{label}</span>
    </span>
  )
}

async function loadStatus(): Promise<Status> {
  // Always read at request time; otherwise a failure before the query gets prerendered into the static shell.
  await connection()
  const userId = await requireUser()
  try {
    const current = await getConnection(userId)
    if (!current) return { tone: 'muted', label: 'Belum terhubung' }
    if (current.status === 'needs_reconnect') return { tone: 'warning', label: 'Perlu disambung ulang' }
    return { tone: 'ok', label: `@${current.username}` }
  } catch (error) {
    console.error('[instagram] status sidebar gagal:', describeError(error))
    return { tone: 'muted', label: 'Status tidak tersedia' }
  }
}

/** Sidebar status from the database only; the live check against Instagram runs on the settings page. */
export async function InstagramStatus() {
  return <StatusLine {...await loadStatus()} />
}
