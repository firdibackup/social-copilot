import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react'
import Link from 'next/link'
import { connection } from 'next/server'
import { MediaImage } from '@/components/media-image'
import { Notice } from '@/components/notice'
import { LateBadge, PostStatusBadge, STATUS_DOT_CLASS } from '@/components/post-status-badge'
import { requireActiveUser } from '@/lib/auth'
import { buildMonthGrid, formatDay, formatMonth, parseMonth, shiftMonth } from '@/lib/calendar'
import { describeError, loadErrorMessage } from '@/lib/errors'
import { formatDateTime, formatTime, parseWibInput, wibDateKey } from '@/lib/format'
import { firstValue, type SearchParams } from '@/lib/params'
import { isLate, isPostStatus, POST_STATUSES, STATUS_LABELS, type PostStatus } from '@/lib/post-status'
import { listPosts, type Post } from '@/lib/posts'

const DAY_MS = 24 * 60 * 60 * 1000
const WEEKDAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/

/** Start and end (exclusive) of WIB calendar days, or null for a malformed day. */
function wibDayRange(firstDay: string, lastDay = firstDay): { from: Date; to: Date } | null {
  if (!DAY_KEY.test(firstDay) || !DAY_KEY.test(lastDay)) return null
  const from = parseWibInput(`${firstDay}T00:00`)
  const lastStart = parseWibInput(`${lastDay}T00:00`)
  return from && lastStart ? { from, to: new Date(lastStart.getTime() + DAY_MS) } : null
}

const firstLine = (caption: string) => caption.split('\n', 1)[0]

function listHref(status?: PostStatus, day?: string): string {
  const params = new URLSearchParams({ tampilan: 'daftar' })
  if (status) params.set('status', status)
  if (day) params.set('tanggal', day)
  return `/kalender?${params}`
}

export async function CalendarView({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  await connection()
  const userId = await requireActiveUser()
  const now = new Date()
  const isList = firstValue(params.tampilan) === 'daftar'

  let body
  try {
    body = isList ? (
      await PostList({ userId, statusParam: firstValue(params.status), dayParam: firstValue(params.tanggal), now })
    ) : (
      await MonthView({ userId, month: parseMonth(firstValue(params.bulan)) ?? wibDateKey(now).slice(0, 7), now })
    )
  } catch (error) {
    console.error('[kalender] gagal memuat:', describeError(error))
    body = <Notice tone="warning">{loadErrorMessage(error)}</Notice>
  }

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Kalender</h1>
        <div className="flex items-center gap-2">
          <nav aria-label="Tampilan" className="inline-flex rounded-lg border border-zinc-200 p-0.5 text-sm">
            <ViewLink href="/kalender" active={!isList} label="Bulan" />
            <ViewLink href="/kalender?tampilan=daftar" active={isList} label="Daftar" />
          </nav>
          <Link
            href="/buat"
            className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            <Plus size={16} aria-hidden="true" />
            Post baru
          </Link>
        </div>
      </header>
      {firstValue(params.ok) === 'hapus' && (
        <Notice tone="success">Post dihapus dari aplikasi. Post yang sudah terbit tetap ada di Instagram.</Notice>
      )}
      {body}
    </>
  )
}

function ViewLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`rounded-md px-3 py-1.5 ${active ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:text-zinc-900'}`}
    >
      {label}
    </Link>
  )
}

async function MonthView({ userId, month, now }: { userId: string; month: string; now: Date }) {
  const weeks = buildMonthGrid(month)
  const range = wibDayRange(weeks[0][0], weeks.at(-1)!.at(-1)!)!
  const posts = await listPosts(userId, range)

  // listPosts returns newest first; each day reads top to bottom by time.
  const byDay = new Map<string, Post[]>()
  for (const post of [...posts].reverse()) {
    if (!post.scheduledAt) continue
    const key = wibDateKey(post.scheduledAt)
    byDay.set(key, [...(byDay.get(key) ?? []), post])
  }
  const today = wibDateKey(now)

  return (
    <section aria-label={formatMonth(month)} className="space-y-3">
      <div className="flex items-center gap-1">
        <Link href={`/kalender?bulan=${shiftMonth(month, -1)}`} aria-label="Bulan sebelumnya" className="rounded-md p-1.5 hover:bg-zinc-100">
          <ChevronLeft size={18} aria-hidden="true" />
        </Link>
        <h2 className="min-w-36 text-center font-medium text-zinc-900 capitalize">{formatMonth(month)}</h2>
        <Link href={`/kalender?bulan=${shiftMonth(month, 1)}`} aria-label="Bulan berikutnya" className="rounded-md p-1.5 hover:bg-zinc-100">
          <ChevronRight size={18} aria-hidden="true" />
        </Link>
        <Link href="/kalender" className="ml-2 text-sm text-zinc-600 hover:text-zinc-900">
          Hari ini
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <div className="grid grid-cols-7 border-b border-zinc-200 bg-zinc-50 text-center text-xs font-medium text-zinc-500">
          {WEEKDAYS.map((weekday) => (
            <div key={weekday} className="py-2">
              {weekday}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {weeks.flat().map((day) => (
            <DayCell
              key={day}
              day={day}
              posts={byDay.get(day) ?? []}
              inMonth={day.startsWith(month)}
              isToday={day === today}
              now={now}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

interface DayCellProps {
  day: string
  posts: Post[]
  inMonth: boolean
  isToday: boolean
  now: Date
}

function DayCell({ day, posts, inMonth, isToday, now }: DayCellProps) {
  return (
    <div
      className={`group relative min-h-16 border-r border-b border-zinc-100 p-1 md:min-h-28 md:p-1.5 [&:nth-child(7n)]:border-r-0 ${inMonth ? '' : 'bg-zinc-50/70'}`}
    >
      {/* On phones the whole cell opens that day's list; chips only fit on wider screens. */}
      <Link href={listHref(undefined, day)} aria-label={formatDay(day)} className="absolute inset-0 md:hidden" />
      <div className="flex items-center justify-between">
        <span
          className={`flex size-6 items-center justify-center rounded-full text-xs ${isToday ? 'bg-zinc-900 font-medium text-white' : inMonth ? 'text-zinc-700' : 'text-zinc-400'}`}
        >
          {Number(day.slice(8))}
        </span>
        <Link
          href={`/buat?tanggal=${day}`}
          aria-label={`Post baru ${formatDay(day)}`}
          className="hidden rounded p-0.5 text-zinc-400 opacity-0 group-hover:opacity-100 hover:bg-zinc-100 hover:text-zinc-900 focus:opacity-100 md:block"
        >
          <Plus size={14} aria-hidden="true" />
        </Link>
      </div>

      <ul className="mt-1 hidden space-y-1 md:block">
        {posts.map((post) => (
          <li key={post.id}>
            <Link
              href={`/buat?id=${post.id}`}
              title={STATUS_LABELS[post.status]}
              className="flex items-center gap-1.5 rounded-md px-1 py-0.5 text-xs hover:bg-zinc-100"
            >
              <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${STATUS_DOT_CLASS[post.status]}`} />
              {post.media[0] && <MediaImage src={post.media[0].url} className="size-5 shrink-0 rounded object-cover" />}
              <span className={`tabular-nums ${isLate(post, now) ? 'font-medium text-orange-700' : 'text-zinc-700'}`}>
                {post.scheduledAt && formatTime(post.scheduledAt)}
              </span>
              <span className="truncate text-zinc-500">{firstLine(post.caption)}</span>
            </Link>
          </li>
        ))}
      </ul>
      <div aria-hidden="true" className="mt-1 flex flex-wrap gap-0.5 md:hidden">
        {posts.map((post) => (
          <span key={post.id} className={`size-1.5 rounded-full ${STATUS_DOT_CLASS[post.status]}`} />
        ))}
      </div>
    </div>
  )
}

interface PostListProps {
  userId: string
  statusParam: string | undefined
  dayParam: string | undefined
  now: Date
}

async function PostList({ userId, statusParam, dayParam, now }: PostListProps) {
  const status = isPostStatus(statusParam) ? statusParam : undefined
  const range = dayParam ? wibDayRange(dayParam) : null
  const day = range ? dayParam : undefined
  const posts = await listPosts(userId, { status, ...range })

  return (
    <section className="space-y-4">
      <nav aria-label="Filter status" className="flex flex-wrap gap-2">
        <FilterLink href={listHref(undefined, day)} active={!status} label="Semua" />
        {POST_STATUSES.map((value) => (
          <FilterLink key={value} href={listHref(value, day)} active={status === value} label={STATUS_LABELS[value]} />
        ))}
        {day && (
          <Link
            href={listHref(status)}
            className="inline-flex items-center gap-1 rounded-full border border-zinc-300 px-3 py-1 text-sm text-zinc-700 hover:bg-zinc-50"
          >
            {formatDay(day)}
            <X size={14} aria-label="Hapus filter tanggal" />
          </Link>
        )}
      </nav>

      {posts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
          <p>Belum ada post di sini.</p>
          <Link href={day ? `/buat?tanggal=${day}` : '/buat'} className="mt-2 inline-block font-medium text-zinc-900 underline">
            Buat post
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white">
          {posts.map((post) => (
            <li key={post.id}>
              <Link href={`/buat?id=${post.id}`} className="flex items-center gap-3 p-3 hover:bg-zinc-50">
                {post.media[0] ? (
                  <MediaImage src={post.media[0].url} className="size-12 shrink-0 rounded-md object-cover" />
                ) : (
                  <span className="size-12 shrink-0 rounded-md bg-zinc-100" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-zinc-900">
                    {firstLine(post.caption) || <span className="text-zinc-400">Tanpa caption</span>}
                  </span>
                  <span className="block text-xs text-zinc-500">
                    {post.scheduledAt ? formatDateTime(post.scheduledAt) : 'Belum dijadwalkan'}
                    {post.mediaCount > 1 && ` · ${post.mediaCount} foto`}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center">
                  {isLate(post, now) && <LateBadge />}
                  <PostStatusBadge status={post.status} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function FilterLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`rounded-full px-3 py-1 text-sm ${active ? 'bg-zinc-900 text-white' : 'border border-zinc-200 text-zinc-600 hover:bg-zinc-50'}`}
    >
      {label}
    </Link>
  )
}
