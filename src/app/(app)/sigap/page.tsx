import type { Metadata } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { Notice } from '@/components/notice'
import { requireAccount } from '@/lib/auth'
import { getSession, listMessages, listSessions } from '@/lib/chat'
import { describeError, loadErrorMessage } from '@/lib/errors'
import { firstValue, isUuid, type SearchParams } from '@/lib/params'
import { SigapChat } from './chat'
import { SessionList } from './session-list'

export const metadata: Metadata = { title: 'Sigap' }

interface SigapPageProps {
  searchParams: Promise<SearchParams>
}

export default function SigapPage({ searchParams }: SigapPageProps) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-ink-muted">Memuat…</p>}>
      <Workspace searchParams={searchParams} />
    </Suspense>
  )
}

/**
 * Two columns: the conversations and the open one. `?sesi=` opens a conversation; without it the chat is empty and
 * the first message starts one. On a phone only the chat shows, and `?riwayat=1` shows the list instead.
 */
async function Workspace({ searchParams }: SigapPageProps) {
  const params = await searchParams
  await connection()
  const { userId, accountId } = await requireAccount()
  const sesi = firstValue(params.sesi)
  const showList = firstValue(params.riwayat) === '1'

  let data
  try {
    const [sessions, session] = await Promise.all([
      listSessions(userId, accountId),
      isUuid(sesi) ? getSession(userId, accountId, sesi) : null,
    ])
    data = { sessions, session, messages: session ? await listMessages(userId, session.id) : [] }
  } catch (error) {
    console.error('[sigap] gagal memuat:', describeError(error))
    return (
      <div className="p-6">
        <Notice tone="warning">{loadErrorMessage(error)}</Notice>
      </div>
    )
  }

  const { sessions, session, messages } = data
  return (
    <div className="flex h-full min-h-0">
      <SessionList
        sessions={sessions}
        activeId={session?.id ?? null}
        now={new Date()}
        className={showList ? 'flex' : 'hidden md:flex'}
      />
      <section aria-label="Percakapan" className={`min-h-0 min-w-0 flex-1 flex-col ${showList ? 'hidden md:flex' : 'flex'}`}>
        {sesi && !session ? (
          <div className="p-6">
            <Notice tone="error">
              Percakapan tidak ditemukan. Mungkin sudah dihapus.{' '}
              <Link href="/sigap" className="underline">
                Mulai chat baru
              </Link>
            </Notice>
          </div>
        ) : (
          <SigapChat sessionId={session?.id ?? null} messages={messages} />
        )}
      </section>
    </div>
  )
}
