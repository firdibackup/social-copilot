import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react'
import Link from 'next/link'
import { connection } from 'next/server'
import { InstagramIcon } from '@/components/instagram-icon'
import { CalendarPeriodLink } from './calendar-period-link'
import { MediaImage } from '@/components/media-image'
import { Notice } from '@/components/notice'
import { LateBadge, PostStatusBadge, STATUS_DOT_CLASS } from '@/components/post-status-badge'
import { ThreadsIcon } from '@/components/threads-icon'
import { requireAccount } from '@/lib/auth'
import { getStrategy } from '@/lib/brand'
import {
  addDays,
  buildMonthGrid,
  formatDay,
  formatMonth,
  formatShortDay,
  parseMonth,
  shiftMonth,
  weekCounts,
} from '@/lib/calendar'
import { describeError, loadErrorMessage } from '@/lib/errors'
import { formatDateTime, formatLongDay, formatTime, parseWibInput, toWibInput, wibDateKey } from '@/lib/format'
import { firstValue, type SearchParams } from '@/lib/params'
import { isLate, isPostStatus, POST_STATUSES, STATUS_LABELS, type PostStatus } from '@/lib/post-status'
import type { ThreadsTargetStatus } from '@/lib/post-threads'
import { listContentPosts, listPosts, postLabel, type Post } from '@/lib/posts'
import { getScheduleSettings } from '@/lib/schedule'
import { dayKeys, emptySlotsOn, isoWeekday, WEEKDAY_SHORT, type PostingSlot } from '@/lib/schedule-slots'
import { SlotChip, SlotPicker, SlotsButton, type DraftCard, type OpenSlot } from './slots'

const DAY_MS = 24 * 60 * 60 * 1000
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/
const WEEKLY_POST_STATUSES = new Set<PostStatus>(['scheduled', 'publishing', 'published'])

const THREADS_TONE: Record<ThreadsTargetStatus, string> = {
  pending: 'text-zinc-400',
  publishing: 'text-amber-600',
  published: 'text-emerald-600',
  failed: 'text-red-600',
}
const THREADS_STATUS: Record<ThreadsTargetStatus, string> = {
  pending: 'menunggu',
  publishing: 'sedang terbit',
  published: 'terbit',
  failed: 'gagal',
}

type View = 'bulan' | 'minggu' | 'daftar'

/** Start and end (exclusive) of WIB calendar days, or null for a malformed day. */
function wibDayRange(firstDay: string, lastDay = firstDay): { from: Date; to: Date } | null {
  if (!DAY_KEY.test(firstDay) || !DAY_KEY.test(lastDay)) return null
  const from = parseWibInput(`${firstDay}T00:00`)
  const lastStart = parseWibInput(`${lastDay}T00:00`)
  return from && lastStart ? { from, to: new Date(lastStart.getTime() + DAY_MS) } : null
}

function listHref(status?: PostStatus, day?: string): string {
  const params = new URLSearchParams({ tampilan: 'daftar' })
  if (status) params.set('status', status)
  if (day) params.set('tanggal', day)
  return `/kalender?${params}`
}

const weekHref = (start: string) => `/kalender?tampilan=minggu&mulai=${start}`

/** Posts with a time, grouped by WIB day; each day reads top to bottom by time. */
function postsByDay(posts: Post[]): Map<string, Post[]> {
  const byDay = new Map<string, Post[]>()
  // listPosts returns newest first.
  for (const post of [...posts].reverse()) {
    if (!post.scheduledAt) continue
    const key = wibDateKey(post.scheduledAt)
    byDay.set(key, [...(byDay.get(key) ?? []), post])
  }
  return byDay
}

/** The times posts sit at: a slot at exactly one of them is taken. */
const takenTimes = (posts: Post[]) =>
  posts.flatMap((post) => (post.scheduledAt && WEEKLY_POST_STATUSES.has(post.status) ? [post.scheduledAt] : []))

/** The empty slots on these days, grouped by WIB day. Slots are offered from today on. */
function openSlotsByDay(slots: PostingSlot[], days: string[], posts: Post[], now: Date): Map<string, OpenSlot[]> {
  const today = wibDateKey(now)
  const byDay = new Map<string, OpenSlot[]>()
  for (const at of emptySlotsOn(slots, days.filter((day) => day >= today), takenTimes(posts), now)) {
    const day = wibDateKey(at)
    byDay.set(day, [...(byDay.get(day) ?? []), { value: toWibInput(at), day: formatLongDay(day), time: formatTime(at) }])
  }
  return byDay
}

export async function CalendarView({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  await connection()
  const { userId, accountId } = await requireAccount()
  const now = new Date()
  const tampilan = firstValue(params.tampilan)
  const view: View = tampilan === 'daftar' ? 'daftar' : tampilan === 'minggu' ? 'minggu' : 'bulan'
  const [strategy, schedule] = await Promise.all([
    getStrategy(userId).catch((error) => {
      console.error('[kalender] gagal memuat strategi:', describeError(error))
      return null
    }),
    // Without slots the calendar still shows every post.
    getScheduleSettings(userId, accountId).catch((error) => {
      console.error('[kalender] gagal memuat slot:', describeError(error))
      return null
    }),
  ])

  let body
  // Pilih's drafts, for the month and week views.
  let drafts: DraftCard[] | null = null
  let failure: unknown = null
  try {
    if (view === 'daftar') {
      body = await PostList({
        userId,
        accountId,
        statusParam: firstValue(params.status),
        dayParam: firstValue(params.tanggal),
        now,
      })
    } else {
      const slots = schedule?.slots ?? []
      const start = firstValue(params.mulai)
      ;[body, drafts] = await Promise.all([
        view === 'minggu'
          ? WeekView({ userId, accountId, start: start && DAY_KEY.test(start) ? start : wibDateKey(now), now, slots })
          : MonthView({
              userId,
              accountId,
              month: parseMonth(firstValue(params.bulan)) ?? wibDateKey(now).slice(0, 7),
              now,
              postsPerWeek: strategy?.postsPerWeek ?? null,
              slots,
            }),
        loadDrafts(userId, accountId),
      ])
    }
  } catch (error) {
    console.error('[kalender] gagal memuat:', describeError(error))
    failure = error
  }

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Kalender</h1>
          <p className="mt-0.5 text-xs text-zinc-500 sm:text-sm">
            {strategy ? `Target ${strategy.postsPerWeek} post/minggu · ` : null}
            <Link href="/brand" className="underline decoration-zinc-300 underline-offset-2 hover:text-zinc-900">
              {strategy ? 'Atur di Brand' : 'Atur target frekuensi di Brand'}
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <nav aria-label="Tampilan" className="inline-flex rounded-lg border border-zinc-200 p-0.5 text-sm">
            <ViewLink href="/kalender" active={view === 'bulan'} label="Bulan" />
            <ViewLink href="/kalender?tampilan=minggu" active={view === 'minggu'} label="Minggu" />
            <ViewLink href="/kalender?tampilan=daftar" active={view === 'daftar'} label="Daftar" />
          </nav>
          {schedule && <SlotsButton slots={schedule.slots} isDefault={!schedule.isCustom} />}
          <Link
            href="/buat"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
          >
            <Plus size={16} aria-hidden="true" />
            Post baru
          </Link>
        </div>
      </header>
      {firstValue(params.ok) === 'hapus' && (
        <Notice tone="success">Post dihapus dari aplikasi. Post yang sudah terbit tetap ada di Instagram.</Notice>
      )}
      {failure ? <Notice tone="warning">{loadErrorMessage(failure)}</Notice> : body}
      {!failure && drafts && <SlotPicker drafts={drafts} />}
    </>
  )
}

/** Pilih's cards: finished drafts, with their photos in and no slide still being made. */
async function loadDrafts(userId: string, accountId: string): Promise<DraftCard[]> {
  const posts = await listContentPosts(userId, accountId)
  return posts
    .filter((post) => post.status === 'draft' && post.inProgress === 0 && (!post.instagramEnabled || post.coverUrl !== null))
    .map((post) => ({
      id: post.id,
      label: post.label,
      subtitle: post.subtitle,
      coverUrl: post.coverUrl,
      slideCount: post.slideCount,
      instagram: post.instagramEnabled,
      threads: post.threadsEnabled,
    }))
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

/** Where the post goes. Kalender's month cells only mark Threads; Instagram is every post's default. */
function PlatformMarks({ post, compact = false }: { post: Post; compact?: boolean }) {
  const threads = post.threads?.enabled ? post.threads : null
  const story = post.instagramEnabled && post.story?.enabled ? post.story : null
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5">
      {post.instagramEnabled && !compact && <InstagramIcon width={11} height={11} className="text-zinc-400" />}
      {threads && (
        <span title={`Threads: ${THREADS_STATUS[threads.status]}`} className="inline-flex">
          <ThreadsIcon size={11} className={THREADS_TONE[threads.status]} />
          <span className="sr-only">Threads {THREADS_STATUS[threads.status]}</span>
        </span>
      )}
      {story && (
        <span
          title={`Story: ${THREADS_STATUS[story.status]}`}
          className={`text-[10px] leading-none font-semibold ${story.status === 'failed' ? 'text-red-600' : THREADS_TONE[story.status]}`}
        >
          <span aria-hidden="true">{compact ? '+S' : '+Story'}</span>
          <span className="sr-only">Story {THREADS_STATUS[story.status]}</span>
        </span>
      )}
    </span>
  )
}

async function MonthView({
  userId,
  accountId,
  month,
  now,
  postsPerWeek,
  slots,
}: {
  userId: string
  accountId: string
  month: string
  now: Date
  postsPerWeek: number | null
  slots: PostingSlot[]
}) {
  const weeks = buildMonthGrid(month)
  const range = wibDayRange(weeks[0][0], weeks.at(-1)!.at(-1)!)!
  const posts = await listPosts(userId, accountId, range)

  const byDay = postsByDay(posts)
  const openByDay = openSlotsByDay(slots, weeks.flat(), posts, now)
  const counts = weekCounts(
    weeks,
    posts.flatMap((post) =>
      post.scheduledAt && WEEKLY_POST_STATUSES.has(post.status) ? [wibDateKey(post.scheduledAt)] : [],
    ),
  )
  const today = wibDateKey(now)

  return (
    <section aria-label={formatMonth(month)} className="space-y-3">
      <div className="flex items-center gap-1">
        <CalendarPeriodLink href={`/kalender?bulan=${shiftMonth(month, -1)}`} label="Bulan sebelumnya">
          <ChevronLeft size={18} aria-hidden="true" />
        </CalendarPeriodLink>
        <h2 className="min-w-36 text-center font-medium text-zinc-900 capitalize">{formatMonth(month)}</h2>
        <CalendarPeriodLink href={`/kalender?bulan=${shiftMonth(month, 1)}`} label="Bulan berikutnya">
          <ChevronRight size={18} aria-hidden="true" />
        </CalendarPeriodLink>
        <Link href="/kalender" className="ml-2 text-sm text-zinc-600 hover:text-zinc-900">
          Hari ini
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <div className="grid grid-cols-7 border-b border-zinc-200 bg-zinc-50 text-center text-xs font-medium text-zinc-500">
          {WEEKDAY_SHORT.map((weekday) => (
            <div key={weekday} className="py-2">
              {weekday}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {weeks.flatMap((week, weekIndex) =>
            week.map((day, dayIndex) => (
              <DayCell
                key={day}
                day={day}
                posts={byDay.get(day) ?? []}
                slots={openByDay.get(day) ?? []}
                inMonth={day.startsWith(month)}
                isToday={day === today}
                now={now}
                weeklyCount={dayIndex === 0 && postsPerWeek !== null ? counts[weekIndex] : undefined}
                weeklyTarget={dayIndex === 0 ? postsPerWeek : null}
              />
            )),
          )}
        </div>
      </div>
    </section>
  )
}

interface DayCellProps {
  day: string
  posts: Post[]
  slots: OpenSlot[]
  inMonth: boolean
  isToday: boolean
  now: Date
  weeklyCount?: number
  weeklyTarget: number | null
}

function DayCell({ day, posts, slots, inMonth, isToday, now, weeklyCount, weeklyTarget }: DayCellProps) {
  return (
    <div
      className={`group relative min-h-16 border-r border-b border-zinc-100 p-1 md:min-h-28 md:p-1.5 [&:nth-child(7n)]:border-r-0 ${inMonth ? '' : 'bg-zinc-50/70'}`}
    >
      {/* On phones the whole cell opens that day's list; chips only fit on wider screens. */}
      <Link href={listHref(undefined, day)} aria-label={formatDay(day)} className="absolute inset-0 md:hidden" />
      <div className="flex items-start justify-between gap-0.5">
        <span
          className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs ${isToday ? 'bg-primary font-semibold text-white' : inMonth ? 'text-zinc-700' : 'text-zinc-400'}`}
        >
          {Number(day.slice(8))}
        </span>
        <div className="flex flex-col items-end gap-0.5">
          {weeklyCount !== undefined && weeklyTarget !== null && (
            <span
              title="post minggu ini"
              aria-label={`${weeklyCount} dari target ${weeklyTarget} post minggu ini`}
              className={`rounded px-1 py-0.5 text-[10px] font-semibold leading-none tabular-nums ${weeklyCount >= weeklyTarget ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}
            >
              {weeklyCount}/{weeklyTarget}
            </span>
          )}
          <Link
            href={`/buat?tanggal=${day}`}
            aria-label={`Post baru ${formatDay(day)}`}
            className="hidden rounded p-0.5 text-zinc-400 opacity-0 group-hover:opacity-100 hover:bg-zinc-100 hover:text-zinc-900 focus:opacity-100 md:block"
          >
            <Plus size={14} aria-hidden="true" />
          </Link>
        </div>
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
              <span className="truncate text-zinc-500">{postLabel(post)}</span>
              <PlatformMarks post={post} compact />
            </Link>
          </li>
        ))}
        {slots.map((slot) => (
          <li key={slot.value}>
            <SlotChip slot={slot} />
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

interface WeekViewProps {
  userId: string
  accountId: string
  /** The first of the seven days, `YYYY-MM-DD`. */
  start: string
  now: Date
  slots: PostingSlot[]
}

/** Seven days from `start` (today by default) as tall columns with their posts and empty slots in time order. */
async function WeekView({ userId, accountId, start, now, slots }: WeekViewProps) {
  const days = dayKeys(start, 7)
  const range = wibDayRange(days[0], days[6])!
  const posts = await listPosts(userId, accountId, range)
  const byDay = postsByDay(posts)
  const openByDay = openSlotsByDay(slots, days, posts, now)
  const today = wibDateKey(now)
  const label = `${formatShortDay(days[0])} – ${formatShortDay(days[6])}`

  return (
    <section aria-label={`Minggu ${label}`} className="space-y-3">
      <div className="flex items-center gap-1">
        <CalendarPeriodLink href={weekHref(addDays(start, -7))} label="Minggu sebelumnya">
          <ChevronLeft size={18} aria-hidden="true" />
        </CalendarPeriodLink>
        <h2 className="min-w-36 text-center font-medium text-zinc-900">{label}</h2>
        <CalendarPeriodLink href={weekHref(addDays(start, 7))} label="Minggu berikutnya">
          <ChevronRight size={18} aria-hidden="true" />
        </CalendarPeriodLink>
        <Link href="/kalender?tampilan=minggu" className="ml-2 text-sm text-zinc-600 hover:text-zinc-900">
          Hari ini
        </Link>
      </div>
      <div className="grid gap-2 md:grid-cols-7">
        {days.map((day) => (
          <WeekDay
            key={day}
            day={day}
            posts={byDay.get(day) ?? []}
            slots={openByDay.get(day) ?? []}
            isToday={day === today}
            now={now}
          />
        ))}
      </div>
    </section>
  )
}

interface WeekDayProps {
  day: string
  posts: Post[]
  slots: OpenSlot[]
  isToday: boolean
  now: Date
}

function WeekDay({ day, posts, slots, isToday, now }: WeekDayProps) {
  const items = [
    ...posts.map((post) => ({ at: post.scheduledAt?.getTime() ?? 0, key: post.id, node: <WeekPost post={post} now={now} /> })),
    ...slots.map((slot) => ({ at: parseWibInput(slot.value)?.getTime() ?? 0, key: slot.value, node: <SlotChip slot={slot} /> })),
  ].sort((a, b) => a.at - b.at)

  return (
    <div className={`flex min-h-28 flex-col rounded-xl border bg-white p-2 md:min-h-72 ${isToday ? 'border-primary/40' : 'border-zinc-200'}`}>
      <div className="flex items-center justify-between gap-1">
        <span className="text-xs font-medium text-zinc-500">
          {WEEKDAY_SHORT[isoWeekday(day) - 1]}{' '}
          <span className={isToday ? 'rounded-full bg-primary px-1.5 py-0.5 font-semibold text-white' : 'text-zinc-900'}>
            {Number(day.slice(8))}
          </span>
        </span>
        <Link
          href={`/buat?tanggal=${day}`}
          aria-label={`Post baru ${formatDay(day)}`}
          className="rounded p-0.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
        >
          <Plus size={14} aria-hidden="true" />
        </Link>
      </div>
      {items.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {items.map((item) => (
            <li key={item.key}>{item.node}</li>
          ))}
        </ul>
      )}
      {posts.length === 0 && (
        <span className="mt-auto self-start pt-2 text-[10px] font-semibold tracking-wide text-zinc-400 uppercase">Kosong</span>
      )}
    </div>
  )
}

function WeekPost({ post, now }: { post: Post; now: Date }) {
  return (
    <Link
      href={`/buat?id=${post.id}`}
      title={STATUS_LABELS[post.status]}
      className="flex gap-2 rounded-lg border border-zinc-200 p-1.5 transition-colors hover:bg-zinc-50"
    >
      {post.media[0] ? (
        <MediaImage src={post.media[0].url} className="size-10 shrink-0 rounded-md bg-zinc-100 object-cover" />
      ) : (
        <span className="size-10 shrink-0 rounded-md bg-zinc-100" />
      )}
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-xs font-medium text-zinc-900">{postLabel(post)}</span>
        <span className="mt-0.5 flex items-center gap-1 text-[11px] text-zinc-500">
          <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${STATUS_DOT_CLASS[post.status]}`} />
          <span className={`tabular-nums ${isLate(post, now) ? 'font-medium text-orange-700' : ''}`}>
            {post.scheduledAt && formatTime(post.scheduledAt)}
          </span>
          <PlatformMarks post={post} />
        </span>
      </span>
    </Link>
  )
}

interface PostListProps {
  userId: string
  accountId: string
  statusParam: string | undefined
  dayParam: string | undefined
  now: Date
}

async function PostList({ userId, accountId, statusParam, dayParam, now }: PostListProps) {
  const status = isPostStatus(statusParam) ? statusParam : undefined
  const range = dayParam ? wibDayRange(dayParam) : null
  const day = range ? dayParam : undefined
  const posts = await listPosts(userId, accountId, { status, ...range })

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
                  <span className="block truncate text-sm text-zinc-900">{postLabel(post)}</span>
                  <span className="flex items-center gap-1.5 text-xs text-zinc-500">
                    {post.scheduledAt ? formatDateTime(post.scheduledAt) : 'Belum dijadwalkan'}
                    {post.mediaCount > 1 && ` · ${post.mediaCount} foto`}
                    <PlatformMarks post={post} />
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
