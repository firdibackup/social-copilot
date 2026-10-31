'use client'

import { useTranslations, useLocale } from 'next-intl'

import { CalendarClock, LoaderCircle, RotateCw } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState, useTransition } from 'react'
import { useStorageFull } from '@/components/storage-full'
import { formatCreditShare } from '@/lib/billing-options'
import type { ScheduleData, ScheduleItem, ScheduleResult } from '@/lib/chat-schedule-options'
import { formatDateTime } from '@/lib/format'
import { makeScheduleImagesAction, scheduleFromMimoAction } from './schedule-actions'

const BUTTON = 'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60'
const PRIMARY = `${BUTTON} bg-accent text-white hover:bg-accent-deep`
const SECONDARY = `${BUTTON} border border-hairline text-ink hover:bg-zinc-50`
const FIELD = 'min-h-9 w-full min-w-0 rounded-lg border border-hairline bg-paper px-2 py-1.5 text-sm text-ink focus-visible:outline-2 focus-visible:outline-accent'

/** Operate: the chat's existing paper frame, a readable status per draft, then one partial-batch action. */
export function ScheduleCard({ sessionId, messageId, cardId }: { sessionId: string | null; messageId: string; cardId: string }) {
  const t = useTranslations('mimo.scheduleCard')
  const locale = useLocale()
  const [data, setData] = useState<ScheduleData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const [times, setTimes] = useState<Record<string, string>>({})
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [results, setResults] = useState<ScheduleResult[]>([])
  const [actionError, setActionError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const storageFull = useStorageFull()
  const [making, setMaking] = useState<string | null>(null)

  useEffect(() => {
    if (!sessionId) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let running = false
    const query = new URLSearchParams({ session: sessionId, message: messageId, card: cardId })
    async function load() {
      if (running || controller.signal.aborted || document.visibilityState !== 'visible') return
      running = true
      if (timer) clearTimeout(timer)
      try {
        const response = await fetch(`/api/sigap/schedule?${query}`, { cache: 'no-store', signal: controller.signal })
        if (!response.ok || response.redirected) throw new Error('load')
        const next: ScheduleData = await response.json()
        if (controller.signal.aborted) return
        setData(next)
        setLoadError(null)
        setTimes((current) => {
          const updated = { ...current }
          const used = new Set(Object.values(current))
          const available = next.slots.filter((slot) => !used.has(slot))
          for (const item of next.items) {
            if (item.stage === 'ready' && item.postId && updated[item.postId] === undefined) updated[item.postId] = available.shift() ?? ''
          }
          return updated
        })
        if (next.items.some((item) => item.stage === 'processing')) timer = setTimeout(() => void load(), 4000)
      } catch {
        if (!controller.signal.aborted) setLoadError(t('loadError'))
      } finally { running = false }
    }
    const visible = () => { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', visible)
    void load()
    return () => {
      controller.abort()
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [sessionId, messageId, cardId, nonce, t])

  const selected = data?.items.filter((item) => item.stage === 'ready' && item.postId && !excluded.has(item.postId)) ?? []
  const waiting = data?.items.filter((item) => item.stage === 'processing').length ?? 0
  const submit = () => {
    if (!sessionId || pending) return
    setActionError(null)
    setResults([])
    startTransition(async () => {
      try {
        const result = await scheduleFromMimoAction(sessionId, messageId, cardId,
          selected.map((item) => ({ postId: item.postId!, at: times[item.postId!] ?? '' })))
        setResults(result.results)
        setActionError(result.error ?? null)
      } catch { setActionError(t('failed')) }
      setNonce((n) => n + 1)
    })
  }
  const makeImages = (item: ScheduleItem) => {
    if (!sessionId || pending) return
    setActionError(null)
    setMaking(item.id)
    startTransition(async () => {
      try {
        const failure = await makeScheduleImagesAction(sessionId, messageId, cardId, item.id)
        setActionError(storageFull(failure) ? null : failure)
      }
      catch { setActionError(t('failed')) }
      setMaking(null)
      setNonce((n) => n + 1)
    })
  }
  const toggle = (postId: string) => setExcluded((current) => {
    const next = new Set(current)
    if (next.has(postId)) next.delete(postId)
    else next.add(postId)
    return next
  })
  const success = results.filter((result) => !result.error).length

  return (
    <section className="min-w-0 rounded-2xl border border-hairline bg-paper" aria-label={t('label')}>
      <h3 className="flex items-center gap-2 border-b border-hairline px-4 py-2.5 text-xs font-medium text-ink-muted">
        <CalendarClock size={14} aria-hidden="true" /> {t('title')}
      </h3>
      <div className="space-y-3 px-4 py-3">
        <p className="text-xs leading-relaxed text-ink-muted">{t('intro')}</p>
        {!data && !loadError && <p role="status" className="text-sm text-ink-muted">{t('loading')}</p>}
        {data?.items.length === 0 && <p className="text-sm text-ink">{t('empty')}</p>}
        <ul className="divide-y divide-hairline">
          {data?.items.map((item) => {
            const postId = item.postId
            const error = results.find((result) => result.postId === postId)?.error
            return (
              <li key={`${item.kind}:${item.id}`} className="space-y-2 py-3 first:pt-0">
                <div className="flex items-start gap-2">
                  {item.stage === 'ready' && postId && <input type="checkbox" aria-label={t('select', { title: item.title })} checked={!excluded.has(postId)} disabled={pending || Boolean(loadError)} onChange={() => toggle(postId)} className="mt-1 size-4 shrink-0 accent-accent" />}
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-medium text-ink">{item.title}</p>
                    <p className={`mt-0.5 text-xs leading-relaxed ${item.stage === 'scheduled' ? 'text-emerald-700' : 'text-ink-muted'}`}>
                      {item.stage === 'processing' && <LoaderCircle size={12} className="mr-1 inline animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                      {item.reason}{item.stage === 'scheduled' && item.scheduledAt ? ` · ${formatDateTime(new Date(item.scheduledAt), locale)}` : ''}
                    </p>
                  </div>
                </div>
                {item.stage === 'ready' && postId && (
                  <label className="block space-y-1 text-xs text-ink-muted">
                    <span>{t('time')}</span>
                    <input type="datetime-local" aria-label={t('publishTime', { title: item.title })} value={times[postId] ?? ''} disabled={pending || excluded.has(postId) || Boolean(loadError)} onChange={(event) => setTimes((current) => ({ ...current, [postId]: event.target.value }))} className={FIELD} />
                  </label>
                )}
                {item.stage === 'script' && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" disabled={pending || Boolean(loadError)} onClick={() => makeImages(item)} className={SECONDARY}>
                      {making === item.id && <LoaderCircle size={12} className="animate-spin" aria-hidden="true" />}
                      {making === item.id ? t('queuing') : t('images')}
                    </button>
                    {item.imageCost !== null && <span className="text-xs text-ink-muted">{t('cost', { share: formatCreditShare(item.imageCost, data!.planCredits, locale) })}</span>}
                  </div>
                )}
                {item.stage === 'blocked' && <Link href={postId ? `/buat?id=${postId}` : `/buat?ide=${item.id}`} className="text-xs font-medium text-accent hover:underline">{t('fix')}</Link>}
                {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
              </li>
            )
          })}
        </ul>
        <div aria-live="polite" className="space-y-1 text-xs">
          {waiting > 0 && <p className="text-ink-muted">{t('waiting', { count: waiting })}</p>}
          {success > 0 && <p className="text-emerald-700">{t('success', { count: success })} <Link href="/kalender" className="underline">{t('calendar')}</Link></p>}
        </div>
        {loadError && <p role="alert" className="text-xs text-red-700">{loadError}</p>}
        {actionError && <p role="alert" className="text-xs text-red-700">{actionError}</p>}
        <div className="flex flex-wrap items-center gap-2">
          {Boolean(data?.items.length) && <button type="button" onClick={submit} disabled={pending || !sessionId || Boolean(loadError) || selected.length === 0 || selected.some((item) => !times[item.postId!])} className={PRIMARY}>
            {pending && !making && <LoaderCircle size={12} className="animate-spin" aria-hidden="true" />}
            {pending && !making ? t('scheduling') : t('scheduleReady', { count: selected.length ? ` (${selected.length})` : '' })}
          </button>}
          <button type="button" disabled={pending || !sessionId} onClick={() => setNonce((n) => n + 1)} className={SECONDARY}><RotateCw size={12} aria-hidden="true" /> {t('refresh')}</button>
        </div>
      </div>
    </section>
  )
}
