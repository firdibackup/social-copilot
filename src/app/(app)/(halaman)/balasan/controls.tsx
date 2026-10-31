'use client'

import { useTranslations } from 'next-intl'

import { RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { NOTIFICATIONS_CHANGED } from '@/components/notification-bell'
import type { SyncState } from './action-utils'
import { markConversationSeenAction, syncDmsAction, syncProfilesAction } from './actions'
import { markPostSeenAction, syncCommentsAction } from './comment-actions'
import { markThreadsPostSeenAction, syncThreadsRepliesAction } from './threads-actions'

const BUTTON =
  'inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50'

/** What the tab pulls from Instagram; null when the connection can't. */
export type Pull = 'dm' | 'komentar' | 'threads' | null

/**
 * New DMs arrive through the webhook while the page is open; this fetches them. It also pulls the tab's DMs or
 * comments from Instagram (at most every 10 minutes), and does so once as the tab opens.
 */
export function RefreshButton({ pull }: { pull: Pull }) {
  const t = useTranslations('inbox.controls')
  const PULLS = {
  dm: { run: syncDmsAction, pendingText: t('fetchingDmsFromInstagram') },
  komentar: { run: syncCommentsAction, pendingText: t('fetchingCommentsFromInstagram') },
  threads: { run: syncThreadsRepliesAction, pendingText: t('fetchingRepliesFromThreads') },
} as const
  const UNREACHABLE: SyncState = { status: 'error', message: t('couldnTReachTheServerTryAgain') }
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<SyncState | null>(null)
  const hasPulled = useRef(false)

  function reload(isAuto: boolean) {
    startTransition(async () => {
      if (!pull) {
        router.refresh()
        return
      }
      const next = await PULLS[pull].run().catch(() => UNREACHABLE)
      // The tab's own pull stays quiet when another one just ran; the action refreshed the page otherwise.
      if (next.status === 'cooldown') router.refresh()
      if (!(isAuto && next.status !== 'error')) setResult(next)
    })
  }

  useEffect(() => {
    if (!pull || hasPulled.current) return
    hasPulled.current = true
    reload(true)
    // Once per mount of the tab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pull])

  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" onClick={() => reload(false)} disabled={pending} className={BUTTON}>
        <RefreshCw size={16} aria-hidden="true" className={pending ? 'animate-spin' : undefined} />
        {t('refresh')}
        </button>
      {pending && pull ? (
        <p role="status" className="text-xs text-zinc-500">
          {PULLS[pull].pendingText}
        </p>
      ) : (
        result && (
          <p
            role={result.status === 'error' ? 'alert' : 'status'}
            className={`max-w-xs text-right text-xs ${result.status === 'error' ? 'text-red-700' : 'text-zinc-500'}`}
          >
            {result.message}
          </p>
        )
      )}
    </div>
  )
}

type FilterValue = 'belum' | 'semua' | 'otomatis'

interface FilterSelectProps {
  value: FilterValue
  /**
   * Where each offered choice leads, in this order; the selected item and post stay out, since they may not be in
   * the new list.
   */
  hrefs: Partial<Record<FilterValue, string>>
}

export function FilterSelect({ value, hrefs }: FilterSelectProps) {
  const t = useTranslations('inbox.controls')
  const FILTER_LABELS = { belum: t('unanswered'), semua: t('all'), otomatis: t('automatic') } as const
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const choices = Object.entries(hrefs) as [FilterValue, string][]
  return (
    <label className="relative">
      <span className="sr-only">Filter</span>
      <select
        aria-label="Filter"
        aria-busy={pending}
        disabled={pending}
        value={value}
        onChange={(event) => {
          const href = choices.find(([choice]) => choice === event.target.value)?.[1]
          if (href) startTransition(() => router.push(href))
        }}
        className="rounded-lg border border-zinc-200 bg-white py-1.5 pr-8 pl-3 text-sm font-medium text-zinc-800 focus:border-zinc-400 focus:outline-none disabled:cursor-wait disabled:opacity-60"
      >
        {choices.map(([choice]) => (
          <option key={choice} value={choice}>
            {FILTER_LABELS[choice]}
          </option>
        ))}
      </select>
      {pending && <span className="sr-only" role="status">{t('loadingReplies')}</span>}
    </label>
  )
}

/** Marks the open DM thread read once it shows: an action from the browser, never a write during render. */
const notifyBell = () => window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED))

export function MarkConversationSeen({ igsid }: { igsid: string }) {
  useEffect(() => {
    void markConversationSeenAction(igsid).then(notifyBell, () => {})
  }, [igsid])
  return null
}

export function SyncProfiles({ igsids }: { igsids: string[] }) {
  const key = igsids.join(',')
  useEffect(() => {
    if (key) void syncProfilesAction(key.split(',')).catch(() => {})
  }, [key])
  return null
}

export function MarkPostSeen({ mediaId }: { mediaId: string }) {
  useEffect(() => {
    void markPostSeenAction(mediaId).then(notifyBell, () => {})
  }, [mediaId])
  return null
}

/** The same for a Threads post's replies. */
export function MarkThreadsPostSeen({ mediaId }: { mediaId: string }) {
  useEffect(() => {
    void markThreadsPostSeenAction(mediaId).catch(() => {})
  }, [mediaId])
  return null
}
