import { MessageSquare, Plus } from 'lucide-react'
import Link from 'next/link'
import { formatListTime } from '@/lib/format'
import type { ChatSessionView } from '@/lib/chat-options'
import { DeleteSessionButton } from './session-buttons'

/** Hover and focus reach past the text, like Buat's list. */
const ITEM =
  '-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 py-2 pr-9 text-left transition-colors hover:bg-[#f7f7f8] focus-visible:ring-2 focus-visible:ring-ink/20 focus-visible:outline-none'
const ACTIVE = 'bg-[#f4f4f5] hover:bg-[#f4f4f5]'

interface SessionListProps {
  sessions: ChatSessionView[]
  activeId: string | null
  now: Date
  className: string
}

/** Sigap's left column: Chat baru and the earlier conversations, most recently used first. */
export function SessionList({ sessions, activeId, now, className }: SessionListProps) {
  return (
    <aside aria-label="Riwayat chat" className={`${className} min-h-0 w-full shrink-0 flex-col md:w-[280px] md:border-r md:border-hairline`}>
      <div className="px-4 pt-3 pb-2">
        <Link
          href="/sigap"
          className="flex h-10 items-center justify-center gap-2 rounded-xl bg-accent text-sm font-semibold text-white transition-colors hover:bg-accent-deep"
        >
          <Plus size={16} aria-hidden="true" />
          Chat baru
        </Link>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-1 pb-5">
        <div className="flex items-center gap-2 border-b border-hairline pt-2 pb-2">
          <h2 className="text-[11px] font-medium tracking-wide text-ink-muted uppercase">Riwayat</h2>
          <span className="text-[11px] text-ink-muted">{sessions.length}</span>
        </div>
        {sessions.length === 0 ? (
          <p className="py-3 text-sm text-ink-muted">Belum ada percakapan. Tanyakan apa saja ke Sigap di kanan.</p>
        ) : (
          <ul className="pt-1">
            {sessions.map((session) => (
              <li key={session.id} className="group relative">
                <Link
                  href={`/sigap?sesi=${session.id}`}
                  aria-current={session.id === activeId ? 'page' : undefined}
                  className={`${ITEM} ${session.id === activeId ? ACTIVE : ''}`}
                >
                  <MessageSquare size={16} strokeWidth={1.75} className="shrink-0 text-ink-soft" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] leading-snug font-medium text-ink">{session.title}</span>
                    <span className="block text-xs text-ink-muted">{formatListTime(new Date(session.updatedAt), now)}</span>
                  </span>
                </Link>
                <DeleteSessionButton id={session.id} title={session.title} active={session.id === activeId} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}
