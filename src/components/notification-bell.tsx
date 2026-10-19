'use client'

import {
  AtSign,
  Bell,
  CheckCheck,
  CreditCard,
  Camera,
  LoaderCircle,
  Mail,
  MailOpen,
  MessageCircle,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { formatListTime } from '@/lib/format'
import type { Notification, NotificationFeed } from '@/lib/inbox-rules'
import { markAllSeenAction, setNotificationReadAction } from './notification-actions'
import { ProfileAvatar } from './profile-avatar'

// ponytail: polling (5 queries a poll per open tab); push through Supabase Realtime or SSE when users grow.
const POLL_MS = 10_000
/** Sent when Balasan marks a thread or post read: opening one only changes the query, which the pathname misses. */
export const NOTIFICATIONS_CHANGED = 'notifikasi:berubah'
const BADGE_MAX = 99
const EMPTY: NotificationFeed = { status: 'active', count: 0, items: [] }

type Filter = 'all' | 'unread'

async function fetchFeed(): Promise<NotificationFeed | null> {
  try {
    const response = await fetch('/api/notifikasi', { cache: 'no-store' })
    return response.ok ? ((await response.json()) as NotificationFeed) : null
  } catch {
    return null
  }
}

export function NotificationBell() {
  const pathname = usePathname()
  const [feed, setFeed] = useState<NotificationFeed>(EMPTY)
  const [filter, setFilter] = useState<Filter>('all')
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [actionError, setActionError] = useState(false)
  const [markingAll, setMarkingAll] = useState(false)
  const [markingItems, setMarkingItems] = useState<Set<string>>(new Set())
  const root = useRef<HTMLDivElement>(null)

  const load = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true)
    const next = await fetchFeed()
    if (next) {
      setFeed(next)
      setLoaded(true)
      setLoadError(false)
    } else {
      setLoadError(true)
    }
    if (showLoading) setLoading(false)
  }, [])

  useEffect(() => {
    const first = window.setTimeout(load, 1500)
    const poll = () => {
      if (document.visibilityState === 'visible') void load()
    }
    const timer = window.setInterval(poll, POLL_MS)
    // Coming back to the tab shows what arrived meanwhile at once, not at the next tick.
    document.addEventListener('visibilitychange', poll)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', poll)
    }
  }, [load, pathname])

  useEffect(() => {
    const reload = () => void load()
    window.addEventListener(NOTIFICATIONS_CHANGED, reload)
    return () => window.removeEventListener(NOTIFICATIONS_CHANGED, reload)
  }, [load])

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !root.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  async function markOne(item: Notification) {
    const read = item.unread
    setActionError(false)
    setMarkingItems((current) => new Set(current).add(item.key))
    setFeed((current) => ({
      ...current,
      count: Math.max(0, current.count + (read ? -1 : 1)),
      items: current.items.map((candidate) =>
        candidate.key === item.key ? { ...candidate, unread: !read } : candidate,
      ),
    }))
    const saved = await setNotificationReadAction(item.kind, item.id, read).catch(() => false)
    if (!saved) {
      setFeed((current) => ({
        ...current,
        count: Math.max(0, current.count + (read ? 1 : -1)),
        items: current.items.map((candidate) =>
          candidate.key === item.key ? { ...candidate, unread: read } : candidate,
        ),
      }))
      setActionError(true)
    }
    setMarkingItems((current) => {
      const next = new Set(current)
      next.delete(item.key)
      return next
    })
  }

  async function markAll() {
    const previous = feed
    setActionError(false)
    setMarkingAll(true)
    setFeed({ ...feed, count: 0, items: feed.items.map((item) => ({ ...item, unread: false })) })
    if (!(await markAllSeenAction().catch(() => false))) {
      setFeed(previous)
      setActionError(true)
    }
    setMarkingAll(false)
  }

  const label = feed.count > 0 ? `Notifikasi, ${feed.count} belum dibaca` : 'Notifikasi'
  const visibleItems = filter === 'unread' ? feed.items.filter((item) => item.unread) : feed.items

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          const next = !open
          setOpen(next)
          if (next) void load(true)
        }}
        className={`relative inline-flex size-9 items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${
          open ? 'bg-accent-soft text-accent-deep' : 'text-ink-muted hover:bg-zinc-100 hover:text-ink'
        }`}
      >
        <Bell size={18} strokeWidth={1.75} aria-hidden="true" />
        {feed.count > 0 && (
          <span className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] leading-none font-semibold text-white tabular-nums ring-2 ring-paper">
            {feed.count > BADGE_MAX ? `${BADGE_MAX}+` : feed.count}
          </span>
        )}
      </button>

      {open && (
        <section
          role="dialog"
          aria-label="Notifikasi"
          className="absolute top-full right-0 z-30 mt-2 w-[min(23rem,calc(100vw-1.5rem))] animate-modal-in overflow-hidden rounded-2xl border border-hairline bg-paper shadow-[0_16px_40px_rgba(23,24,39,0.14)]"
        >
          <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3">
            <div className="flex min-w-0 items-baseline gap-2">
              <h2 className="text-base font-semibold text-ink">Notifikasi</h2>
              {feed.status === 'active' && feed.count > 0 && (
                <span className="text-xs font-medium text-accent tabular-nums">{feed.count} baru</span>
              )}
            </div>
            {feed.status === 'active' && feed.count > 0 && (
              <button
                type="button"
                onClick={markAll}
                disabled={markingAll}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-accent transition-colors hover:bg-accent-soft hover:text-accent-deep disabled:opacity-50"
              >
                {markingAll ? (
                  <LoaderCircle size={13} className="animate-spin" aria-hidden="true" />
                ) : (
                  <CheckCheck size={13} aria-hidden="true" />
                )}
                Tandai semua dibaca
              </button>
            )}
          </div>

          {feed.status === 'active' && (
            <div className="flex gap-1 border-b border-hairline px-3">
              {(['all', 'unread'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  className={`relative min-h-9 px-2 text-xs font-medium transition-colors ${
                    filter === value ? 'text-ink' : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  {value === 'all' ? 'Semua' : `Belum dibaca${feed.count > 0 ? ` (${feed.count})` : ''}`}
                  {filter === value && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-accent" />}
                </button>
              ))}
            </div>
          )}

          {loadError && loaded && (
            <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
              <span>Daftar terbaru belum bisa dimuat.</span>
              <button type="button" onClick={() => void load(true)} className="shrink-0 font-semibold hover:underline">
                Coba lagi
              </button>
            </div>
          )}

          {loading && !loaded ? (
            <LoadingState />
          ) : loadError && !loaded ? (
            <ErrorState retry={() => void load(true)} />
          ) : feed.status === 'instagram_required' ? (
            <UnavailableState
              icon={<Camera size={20} aria-hidden="true" />}
              title="Hubungkan Instagram"
              body="Notifikasi DM dan komentar akan muncul setelah akun Instagram terhubung."
              href="/pengaturan#instagram"
              action="Buka Pengaturan"
            />
          ) : feed.status === 'subscription_required' ? (
            <UnavailableState
              icon={<CreditCard size={20} aria-hidden="true" />}
              title="Aktifkan langganan"
              body="Notifikasi tersedia selama langganan aktif."
              href="/langganan"
              action="Lihat Langganan"
            />
          ) : visibleItems.length === 0 ? (
            <EmptyState filter={filter} />
          ) : (
            <NotificationList items={visibleItems} markingItems={markingItems} markOne={markOne} close={() => setOpen(false)} />
          )}

          {actionError && (
            <p role="status" className="border-t border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
              Perubahan belum tersimpan. Coba lagi.
            </p>
          )}

          {feed.status === 'active' && (
            <Link
              href="/balasan"
              onClick={() => setOpen(false)}
              className="block border-t border-hairline px-4 py-3 text-center text-xs font-medium text-ink-muted transition-colors hover:bg-zinc-50 hover:text-ink"
            >
              Buka semua di Balasan
            </Link>
          )}
        </section>
      )}
    </div>
  )
}

function NotificationList({
  items,
  markingItems,
  markOne,
  close,
}: {
  items: Notification[]
  markingItems: Set<string>
  markOne: (item: Notification) => Promise<void>
  close: () => void
}) {
  const now = new Date()
  return (
    <ul className="max-h-[25rem] divide-y divide-hairline overflow-y-auto overscroll-contain">
      {items.map((item) => {
        const marking = markingItems.has(item.key)
        return (
          <li key={item.key} className={`group relative ${item.unread ? 'bg-accent-soft/35' : 'bg-paper'}`}>
            <Link
              href={item.href}
              onClick={() => {
                if (item.unread) void markOne(item)
                close()
              }}
              className="flex min-h-24 items-start gap-3 px-4 py-3 pr-12 hover:bg-zinc-50/80"
            >
              <span className="relative">
                <ProfileAvatar src={item.avatarUrl} name={item.name} className="size-10" />
                {item.unread && (
                  <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-accent ring-2 ring-paper" />
                )}
              </span>
              <span className="min-w-0 flex-1 space-y-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={`truncate text-sm text-ink ${item.unread ? 'font-semibold' : 'font-medium'}`}>{item.name}</span>
                  <time dateTime={item.at} className="shrink-0 text-[11px] text-ink-muted tabular-nums">
                    {formatListTime(new Date(item.at), now)}
                  </time>
                </span>
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-ink-muted">
                  {item.kind === 'dm' ? <MessageCircle size={12} aria-hidden="true" /> : <AtSign size={12} aria-hidden="true" />}
                  {item.kind === 'dm' ? 'Pesan langsung' : 'Komentar'}
                </span>
                <span className="line-clamp-2 block text-sm leading-5 text-zinc-600">{item.text || '(kosong)'}</span>
              </span>
            </Link>
            <button
              type="button"
              onClick={() => void markOne(item)}
              disabled={marking}
              title={item.unread ? 'Tandai dibaca' : 'Tandai belum dibaca'}
              aria-label={`${item.unread ? 'Tandai dibaca' : 'Tandai belum dibaca'}: ${item.name}`}
              className="absolute right-3 bottom-3 inline-flex size-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-paper hover:text-accent focus-visible:bg-paper disabled:opacity-50"
            >
              {marking ? (
                <LoaderCircle size={15} className="animate-spin" aria-hidden="true" />
              ) : item.unread ? (
                <MailOpen size={15} aria-hidden="true" />
              ) : (
                <Mail size={15} aria-hidden="true" />
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function LoadingState() {
  return (
    <div role="status" className="flex min-h-44 flex-col items-center justify-center gap-2 text-sm text-ink-muted">
      <LoaderCircle size={20} className="animate-spin text-accent" aria-hidden="true" />
      Memuat notifikasi…
    </div>
  )
}

function ErrorState({ retry }: { retry: () => void }) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center gap-3 px-6 text-center">
      <div>
        <p className="text-sm font-semibold text-ink">Notifikasi belum bisa dimuat</p>
        <p className="mt-1 text-xs leading-5 text-ink-muted">Periksa koneksi lalu coba lagi.</p>
      </div>
      <button type="button" onClick={retry} className="min-h-9 rounded-lg bg-ink px-3 text-xs font-semibold text-white hover:bg-zinc-800">
        Coba lagi
      </button>
    </div>
  )
}

function EmptyState({ filter }: { filter: Filter }) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center px-6 text-center">
      <span className="mb-3 flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
        <CheckCheck size={19} aria-hidden="true" />
      </span>
      <p className="text-sm font-semibold text-ink">{filter === 'unread' ? 'Semua sudah dibaca' : 'Belum ada notifikasi'}</p>
      <p className="mt-1 max-w-56 text-xs leading-5 text-ink-muted">
        {filter === 'unread' ? 'Notifikasi baru akan muncul di sini.' : 'DM dan komentar terbaru akan muncul di sini.'}
      </p>
    </div>
  )
}

function UnavailableState({
  icon,
  title,
  body,
  href,
  action,
}: {
  icon: ReactNode
  title: string
  body: string
  href: string
  action: string
}) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center px-6 text-center">
      <span className="mb-3 flex size-11 items-center justify-center rounded-xl bg-accent-soft text-accent">{icon}</span>
      <p className="text-sm font-semibold text-ink">{title}</p>
      <p className="mt-1 max-w-64 text-xs leading-5 text-ink-muted">{body}</p>
      <Link href={href} className="mt-4 inline-flex min-h-9 items-center rounded-lg bg-ink px-3 text-xs font-semibold text-white hover:bg-zinc-800">
        {action}
      </Link>
    </div>
  )
}
