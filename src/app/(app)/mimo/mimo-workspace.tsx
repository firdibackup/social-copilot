'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { LoadingState } from '@/components/loading-state'
import { Notice } from '@/components/notice'
import { isUuid } from '@/lib/params'
import { MimoChat } from './chat'
import { SessionList } from './session-list'
import { useMimoScope } from './mimo-provider'
import { conversationQuery, sessionsQuery, mimoSupportQuery } from './mimo-query'

export function MimoWorkspace() {
  const params = useSearchParams()
  const { scope } = useMimoScope()
  const id = params.get('sesi') ?? ''
  const valid = isUuid(id)
  const showList = params.get('riwayat') === '1'
  const sessions = useQuery(sessionsQuery(scope))
  const support = useQuery(mimoSupportQuery(scope))
  const conversation = useQuery({ ...conversationQuery(scope, id), enabled: valid })
  const detailError = support.error || (valid && conversation.error)
  const missing = id && (!valid || (conversation.data && !conversation.data.session))
  const retry = () => { void support.refetch(); if (valid) void conversation.refetch() }

  return (
    <div className="flex h-full min-h-0">
      <div className={`${showList ? 'flex' : 'hidden md:flex'} min-h-0 w-full shrink-0 flex-col md:w-[280px] md:border-r md:border-hairline`}>
        {sessions.error && <div className="p-4"><Notice tone="warning">Riwayat belum bisa diperbarui. <button className="underline" onClick={() => void sessions.refetch()}>Coba lagi</button></Notice></div>}
        {sessions.data ? <SessionList sessions={sessions.data} activeId={valid ? id : null} now={new Date()} className="flex" />
          : !sessions.error && <LoadingState variant="list" label="Memuat riwayat…" className="p-4" />}
      </div>
      <section aria-label="Percakapan" className={`${showList ? 'hidden md:flex' : 'flex'} min-h-0 min-w-0 flex-1 flex-col`}>
        {detailError && <div className="p-4"><Notice tone="warning">Percakapan belum bisa diperbarui. <button className="underline" onClick={retry}>Coba lagi</button></Notice></div>}
        {missing ? <div className="p-6"><Notice tone="error">Percakapan tidak ditemukan. Mungkin sudah dihapus. <Link href="/mimo" className="underline">Mulai chat baru</Link></Notice></div>
          : !support.data || (valid && !conversation.data) ? (!detailError && <LoadingState variant="list" className="p-6" label="Memuat percakapan…" />)
            : <MimoChat sessionId={valid ? id : null} messages={valid ? conversation.data!.messages : []} {...support.data} />}
      </section>
    </div>
  )
}
