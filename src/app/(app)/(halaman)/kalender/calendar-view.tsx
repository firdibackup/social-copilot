import { getLocale, getTranslations } from 'next-intl/server'
import { IntlMessages } from '@/i18n/client-messages'
import type { Locale } from '@/i18n/locale-config'
import Link from 'next/link'
import { connection } from 'next/server'
import { PiCaretLeft, PiCaretRight, PiPlus, PiX } from 'react-icons/pi'
import { CalendarPeriodLink } from './calendar-period-link'
import { MediaImage } from '@/components/media-image'
import { Notice } from '@/components/notice'
import { PlatformBadge } from '@/components/platform-badge'
import { LateBadge, PostStatusBadge, STATUS_DOT_CLASS } from '@/components/post-status-badge'
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
import { ConfigError, describeError } from '@/lib/errors'
import { formatDateTime, formatLongDay, formatTime, parseWibInput, toWibInput, wibDateKey } from '@/lib/format'
import { firstValue, type SearchParams } from '@/lib/params'
import { isLate, isPostStatus, POST_STATUSES, type PostStatus } from '@/lib/post-status'
import type { ThreadsTargetStatus } from '@/lib/post-threads'
import { listContentPosts, listPosts, postLabel, type Post } from '@/lib/posts'
import { getScheduleSettings } from '@/lib/schedule'
import { dayKeys, emptySlotsOn, isoWeekday, type PostingSlot } from '@/lib/schedule-slots'
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
function openSlotsByDay(slots: PostingSlot[], days: string[], posts: Post[], now: Date, locale: Locale): Map<string, OpenSlot[]> {
  const today = wibDateKey(now)
  const byDay = new Map<string, OpenSlot[]>()
  for (const at of emptySlotsOn(slots, days.filter((day) => day >= today), takenTimes(posts), now)) {
    const day = wibDateKey(at)
    byDay.set(day, [...(byDay.get(day) ?? []), { value: toWibInput(at), day: formatLongDay(day, locale), time: formatTime(at, locale) }])
  }
  return byDay
}

export async function CalendarView({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const t = await getTranslations('calendar')
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
    <IntlMessages namespaces={['common', 'calendar']}>
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div>
          <h1 className="text-[28px] leading-tight font-semibold text-ink [text-wrap:balance] md:text-[32px]">{t('page.title')}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {strategy ? t('page.target', { count: strategy.postsPerWeek }) : null}
            <Link href="/brand" className="rounded-sm text-accent-deep underline decoration-accent/30 underline-offset-[3px] transition-colors duration-150 hover:decoration-accent-deep">
              {strategy ? t('page.brand') : t('page.setTarget')}
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <nav aria-label={t('page.view')} className="inline-flex rounded-[10px] bg-zinc-100 p-1 text-sm">
            <ViewLink href="/kalender" active={view === 'bulan'} label={t('page.month')} />
            <ViewLink href="/kalender?tampilan=minggu" active={view === 'minggu'} label={t('page.week')} />
            <ViewLink href="/kalender?tampilan=daftar" active={view === 'daftar'} label={t('page.list')} />
          </nav>
          {schedule && <SlotsButton slots={schedule.slots} isDefault={!schedule.isCustom} />}
          <Link
            href="/buat"
            className="btn-signature inline-flex min-h-11 items-center gap-1.5 rounded-[10px] px-3.5 text-sm font-semibold whitespace-nowrap"
          >
            <PiPlus size={16} aria-hidden="true" />
            {t('page.newPost')}
          </Link>
        </div>
      </header>
      {firstValue(params.ok) === 'hapus' && (
        <Notice tone="success">{t('page.deleted')}</Notice>
      )}
      {failure ? <Notice tone="warning">{failure instanceof ConfigError ? t('errors.configuration', { message: failure.message }) : t('errors.database')}</Notice> : body}
      {!failure && drafts && <SlotPicker drafts={drafts} />}
    </IntlMessages>
  )
}

/** Pilih's cards: finished drafts, with their photos in and no slide still being made. */
async function loadDrafts(userId: string, accountId: string): Promise<DraftCard[]> {
  const posts = await listContentPosts(userId, accountId, await getLocale())
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
      className={`inline-flex min-h-11 min-w-11 items-center rounded-[7px] px-3 font-medium whitespace-nowrap transition-colors duration-150 ${active ? 'bg-white text-ink shadow-[0_1px_2px_rgb(23_24_39/0.08)]' : 'text-ink-muted hover:text-ink'}`}
    >
      {label}
    </Link>
  )
}

/** Where the post goes: Instagram, Threads, or one stacked badge for both; plus its Story. */
async function PlatformMarks({ post, compact = false }: { post: Post; compact?: boolean }) {
  const t = await getTranslations('calendar')
  const threads = post.threads?.enabled ? post.threads : null
  const story = post.instagramEnabled && post.story?.enabled ? post.story : null
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      <PlatformBadge
        instagram={post.instagramEnabled}
        threads={threads !== null}
        threadsTone={threads ? THREADS_TONE[threads.status] : undefined}
        threadsStatus={threads ? t(`targetStatus.${threads.status}`) : undefined}
        size={compact ? 'sm' : 'md'}
      />
      {story && (
        <span
          title={t('story.title', { status: t(`targetStatus.${story.status}`) })}
          className={`text-[10px] leading-none font-semibold ${story.status === 'failed' ? 'text-red-600' : THREADS_TONE[story.status]}`}
        >
          <span aria-hidden="true">{t(compact ? 'story.compactBadge' : 'story.badge')}</span>
          <span className="sr-only">{t('story.label', { status: t(`targetStatus.${story.status}`) })}</span>
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
  const t = await getTranslations('calendar')
  const locale = await getLocale()
  const weeks = buildMonthGrid(month)
  const range = wibDayRange(weeks[0][0], weeks.at(-1)!.at(-1)!)!
  const posts = await listPosts(userId, accountId, range)

  const byDay = postsByDay(posts)
  const openByDay = openSlotsByDay(slots, weeks.flat(), posts, now, locale)
  const counts = weekCounts(
    weeks,
    posts.flatMap((post) =>
      post.scheduledAt && WEEKLY_POST_STATUSES.has(post.status) ? [wibDateKey(post.scheduledAt)] : [],
    ),
  )
  const today = wibDateKey(now)

  return (
    <section aria-label={formatMonth(month, locale)} className="space-y-3">
      <div className="flex flex-wrap items-center gap-1">
        <CalendarPeriodLink href={`/kalender?bulan=${shiftMonth(month, -1)}`} label={t('monthView.previous')} loadingLabel={t('page.loadingPeriod')}>
          <PiCaretLeft size={18} aria-hidden="true" />
        </CalendarPeriodLink>
        <h2 className="min-w-36 text-center text-lg font-semibold text-ink capitalize">{formatMonth(month, locale)}</h2>
        <CalendarPeriodLink href={`/kalender?bulan=${shiftMonth(month, 1)}`} label={t('monthView.next')} loadingLabel={t('page.loadingPeriod')}>
          <PiCaretRight size={18} aria-hidden="true" />
        </CalendarPeriodLink>
        <Link href="/kalender" className="ml-2 inline-flex min-h-11 items-center rounded-lg border border-hairline px-3 text-sm font-medium text-ink-muted transition-colors duration-150 hover:border-zinc-300 hover:text-ink">
          {t('day.today')}
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <div className="grid grid-cols-7 border-b border-zinc-200 bg-zinc-50 text-center text-xs font-medium text-ink-muted">
          {([1, 2, 3, 4, 5, 6, 7] as const).map((weekday) => (
            <div key={weekday} className="py-2">
              {t(`weekdays.${weekday}`)}
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

async function DayCell({ day, posts, slots, inMonth, isToday, now, weeklyCount, weeklyTarget }: DayCellProps) {
  const locale = await getLocale()
  const t = await getTranslations('calendar')
  const common = await getTranslations('common')
  return (
    <div
      className={`group relative min-h-16 border-r border-b border-zinc-100 p-1 md:min-h-28 md:p-1.5 [&:nth-child(7n)]:border-r-0 ${inMonth ? '' : 'bg-zinc-50/70'}`}
    >
      {/* On phones the whole cell opens that day's list; chips only fit on wider screens. */}
      <Link href={listHref(undefined, day)} aria-label={formatDay(day, locale)} className="absolute inset-0 md:hidden" />
      <div className="flex items-start justify-between gap-0.5">
        <span
          className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs ${isToday ? 'btn-signature pointer-events-none font-semibold' : inMonth ? 'text-zinc-700' : 'text-zinc-400'}`}
        >
          {Number(day.slice(8))}
        </span>
        <div className="flex flex-col items-end gap-0.5">
          {weeklyCount !== undefined && weeklyTarget !== null && (
            <span
              title={t('day.weeklyPosts')}
              aria-label={t('day.weeklyTarget', { count: weeklyCount, target: weeklyTarget })}
              className={`rounded px-1 py-0.5 text-[10px] font-semibold leading-none tabular-nums ${weeklyCount >= weeklyTarget ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}
            >
              {weeklyCount}/{weeklyTarget}
            </span>
          )}
          <Link
            href={`/buat?tanggal=${day}`}
            aria-label={t('day.newPost', { day: formatDay(day, locale) })}
            className="hidden rounded-md p-1 text-ink-muted opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:bg-accent-soft hover:text-accent-deep focus-visible:opacity-100 md:block"
          >
            <PiPlus size={14} aria-hidden="true" />
          </Link>
        </div>
      </div>

      <ul className="mt-1 hidden space-y-1 md:block">
        {posts.map((post) => (
          <li key={post.id}>
            <Link
              href={`/buat?id=${post.id}`}
              title={common(`postStatus.${post.status}`)}
              className="flex items-center gap-1.5 rounded-md px-1 py-0.5 text-xs hover:bg-zinc-100"
            >
              <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${STATUS_DOT_CLASS[post.status]}`} />
              {post.media[0] && <MediaImage src={post.media[0].url} className="size-5 shrink-0 rounded object-cover" />}
              <span className={`tabular-nums ${isLate(post, now) ? 'font-medium text-orange-700' : 'text-zinc-700'}`}>
                {post.scheduledAt && formatTime(post.scheduledAt, locale)}
              </span>
              <span className="truncate text-zinc-500">{postLabel(post, locale)}</span>
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
  const t = await getTranslations('calendar')
  const locale = await getLocale()
  const days = dayKeys(start, 7)
  const range = wibDayRange(days[0], days[6])!
  const posts = await listPosts(userId, accountId, range)
  const byDay = postsByDay(posts)
  const openByDay = openSlotsByDay(slots, days, posts, now, locale)
  const today = wibDateKey(now)
  const label = `${formatShortDay(days[0], locale)} – ${formatShortDay(days[6], locale)}`

  return (
    <section aria-label={t('weekView.label', { period: label })} className="space-y-3">
      <div className="flex flex-wrap items-center gap-1">
        <CalendarPeriodLink href={weekHref(addDays(start, -7))} label={t('weekView.previous')} loadingLabel={t('page.loadingPeriod')}>
          <PiCaretLeft size={18} aria-hidden="true" />
        </CalendarPeriodLink>
        <h2 className="min-w-36 text-center text-lg font-semibold text-ink">{label}</h2>
        <CalendarPeriodLink href={weekHref(addDays(start, 7))} label={t('weekView.next')} loadingLabel={t('page.loadingPeriod')}>
          <PiCaretRight size={18} aria-hidden="true" />
        </CalendarPeriodLink>
        <Link href="/kalender?tampilan=minggu" className="ml-2 inline-flex min-h-11 items-center rounded-lg border border-hairline px-3 text-sm font-medium text-ink-muted transition-colors duration-150 hover:border-zinc-300 hover:text-ink">
          {t('day.today')}
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

async function WeekDay({ day, posts, slots, isToday, now }: WeekDayProps) {
  const locale = await getLocale()
  const t = await getTranslations('calendar')
  const items = [
    ...posts.map((post) => ({ at: post.scheduledAt?.getTime() ?? 0, key: post.id, node: <WeekPost post={post} now={now} /> })),
    ...slots.map((slot) => ({ at: parseWibInput(slot.value)?.getTime() ?? 0, key: slot.value, node: <SlotChip slot={slot} /> })),
  ].sort((a, b) => a.at - b.at)

  return (
    <div className={`flex min-h-28 flex-col rounded-xl border bg-white p-2 md:min-h-72 ${isToday ? 'border-accent/40 shadow-[0_1px_3px_rgb(75_63_240/0.10)]' : 'border-zinc-200'}`}>
      <div className="flex items-center justify-between gap-1">
        <span className="text-xs font-medium text-zinc-500">
          {t(`weekdays.${isoWeekday(day) as 1 | 2 | 3 | 4 | 5 | 6 | 7}`)}{' '}
          <span className={isToday ? 'btn-signature pointer-events-none rounded-full px-1.5 py-0.5 font-semibold' : 'text-zinc-900'}>
            {Number(day.slice(8))}
          </span>
        </span>
        <Link
          href={`/buat?tanggal=${day}`}
          aria-label={t('day.newPost', { day: formatDay(day, locale) })}
          className="-m-1.5 grid size-9 place-items-center rounded-lg text-ink-muted transition-colors duration-150 hover:bg-accent-soft hover:text-accent-deep"
        >
          <PiPlus size={15} aria-hidden="true" />
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
        <span className="mt-auto self-start pt-2 text-[11px] font-medium text-ink-muted">{t('weekView.empty')}</span>
      )}
    </div>
  )
}

async function WeekPost({ post, now }: { post: Post; now: Date }) {
  const locale = await getLocale()
  const common = await getTranslations('common')
  return (
    <Link
      href={`/buat?id=${post.id}`}
      title={common(`postStatus.${post.status}`)}
      className="flex gap-2 rounded-lg border border-zinc-200 p-1.5 transition-colors hover:bg-zinc-50"
    >
      {post.media[0] ? (
        <MediaImage src={post.media[0].url} className="size-10 shrink-0 rounded-md bg-zinc-100 object-cover" />
      ) : (
        <span className="size-10 shrink-0 rounded-md bg-zinc-100" />
      )}
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-xs font-medium text-zinc-900">{postLabel(post, locale)}</span>
        <span className="mt-0.5 flex items-center gap-1 text-[11px] text-zinc-500">
          <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${STATUS_DOT_CLASS[post.status]}`} />
          <span className={`tabular-nums ${isLate(post, now) ? 'font-medium text-orange-700' : ''}`}>
            {post.scheduledAt && formatTime(post.scheduledAt, locale)}
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
  const t = await getTranslations('calendar')
  const common = await getTranslations('common')
  const locale = await getLocale()
  const status = isPostStatus(statusParam) ? statusParam : undefined
  const range = dayParam ? wibDayRange(dayParam) : null
  const day = range ? dayParam : undefined
  const posts = await listPosts(userId, accountId, { status, ...range })

  return (
    <section className="space-y-4">
      <nav aria-label={t('list.filter')} className="flex flex-wrap gap-2">
        <FilterLink href={listHref(undefined, day)} active={!status} label={t('list.all')} />
        {POST_STATUSES.map((value) => (
          <FilterLink key={value} href={listHref(value, day)} active={status === value} label={common(`postStatus.${value}`)} />
        ))}
        {day && (
          <Link
            href={listHref(status)}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-accent/30 bg-accent-soft px-3 text-sm font-medium text-accent-deep transition-colors duration-150 hover:border-accent/50"
          >
            {formatDay(day, locale)}
            <PiX size={14} role="img" aria-label={t('list.clearDay')} />
          </Link>
        )}
      </nav>

      {posts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-ink-muted">
          <p>{t('list.empty')}</p>
          <Link href={day ? `/buat?tanggal=${day}` : '/buat'} className="mt-2 inline-flex min-h-10 items-center font-medium text-accent-deep underline decoration-accent/30 underline-offset-[3px] hover:decoration-accent-deep">
            {t('list.create')}
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
                  <span className="block truncate text-sm text-zinc-900">{postLabel(post, locale)}</span>
                  <span className="flex items-center gap-1.5 text-xs text-zinc-500">
                    {post.scheduledAt ? formatDateTime(post.scheduledAt, locale) : t('list.unscheduled')}
                    {post.mediaCount > 1 && t('list.photos', { count: post.mediaCount })}
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
      className={`inline-flex min-h-9 items-center rounded-full border px-3 text-sm font-medium whitespace-nowrap transition-colors duration-150 ${active ? 'border-accent/30 bg-accent-soft text-accent-deep' : 'border-zinc-200 text-ink-muted hover:border-zinc-300 hover:text-ink'}`}
    >
      {label}
    </Link>
  )
}
