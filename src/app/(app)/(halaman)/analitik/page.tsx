import { ExternalLink } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { IntlMessages } from '@/i18n/client-messages'
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense, type ReactNode } from 'react'
import { LoadingState } from '@/components/loading-state'
import { ExternalImage } from '@/components/media-image'
import { Notice } from '@/components/notice'
import { getSyncState, listAnalyticsPosts, listAppMediaIds, type AnalyticsPost, type SyncState } from '@/lib/analytics'
import {
  engagementRate,
  formatCount,
  formatRate,
  isSyncStale,
  parseRange,
  RANGES,
  summarize,
  type RangeDays,
} from '@/lib/analytics-metrics'
import { requireAccount } from '@/lib/auth'
import { getConnection, type Connection } from '@/lib/connection'
import { ConfigError, describeError } from '@/lib/errors'
import { formatDateTime, formatShortDate } from '@/lib/format'
import { INSIGHTS_SCOPE } from '@/lib/instagram'
import { firstValue, type SearchParams } from '@/lib/params'
import { SyncPanel } from './sync-panel'

export async function generateMetadata() {
  const t = await getTranslations('analytics')
  return { title: t('page.title') }
}

const DAY_MS = 24 * 60 * 60 * 1000
const CARD = 'rounded-xl border border-zinc-200 bg-white'
const RECONNECT_LINK = 'font-medium underline underline-offset-2'

interface AnalitikPageProps {
  searchParams: Promise<SearchParams>
}

export default async function AnalitikPage({ searchParams }: AnalitikPageProps) {
  const t = await getTranslations('analytics')
  return (
    <div className="space-y-6">
      <Suspense fallback={<LoadingState variant="analytics" label={t('page.loading')} />}>
        <AnalyticsView searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

interface PageData {
  instagram: Connection | null
  state: SyncState | null
  posts: AnalyticsPost[]
  appIds: Set<string>
}

async function loadData(userId: string, accountId: string, since: Date): Promise<PageData> {
  const [instagram, state, posts] = await Promise.all([
    getConnection(userId),
    getSyncState(userId, accountId),
    listAnalyticsPosts(userId, accountId, since),
  ])
  const appIds = await listAppMediaIds(userId, posts.map((post) => post.mediaId))
  return { instagram, state, posts, appIds }
}

async function AnalyticsView({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const t = await getTranslations('analytics')
  const locale = await getLocale()
  const params = await searchParams
  await connection()
  const { userId, accountId } = await requireAccount()
  const range = parseRange(firstValue(params.rentang))
  const now = new Date()

  let data: PageData
  try {
    data = await loadData(userId, accountId, new Date(now.getTime() - range * DAY_MS))
  } catch (error) {
    console.error('[analitik] gagal memuat:', describeError(error))
    return <Notice tone="warning">{error instanceof ConfigError ? t('errors.configuration', { message: error.message }) : t('errors.database')}</Notice>
  }

  const { instagram, state, posts, appIds } = data
  const hasPermission = instagram?.scopes.includes(INSIGHTS_SCOPE) ?? false
  const canSync = instagram?.status === 'active' && hasPermission
  const summary = summarize(posts)

  return (
    <IntlMessages namespaces={['common', 'analytics']}>
      <SyncPanel
        canSync={canSync}
        shouldSyncNow={canSync && isSyncStale(state?.startedAt ?? null, now)}
        lastSync={state?.finishedAt ? t('page.lastSync', { time: formatDateTime(state.finishedAt, locale), updated: state.updated, failed: state.failed }) : t('page.neverSynced')}
      >
        <div className="max-w-xl space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{t('page.title')}</h1>
          <p className="text-zinc-500">
            {t('page.description')}
          </p>
        </div>
      </SyncPanel>
      <ConnectionNotice instagram={instagram} hasPermission={hasPermission} />
      <RangeNav current={range} />
      <section aria-label={t('summary.label')} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t('summary.posts')} value={formatCount(summary.postCount, locale)} note={t('summary.days', { count: range })} />
        <StatCard label={t('summary.views')} value={formatCount(summary.views, locale)} note={t('summary.withMetrics')} />
        <StatCard label={t('summary.interactions')} value={formatCount(summary.interactions, locale)} note={t('summary.interactionNote')} />
        <StatCard label={t('summary.rate')} value={formatRate(summary.engagementRate, locale)} note={t('summary.rateNote')} />
      </section>
      {posts.length > 0 ? (
        <PostTable posts={posts} appIds={appIds} />
      ) : (
        <EmptyState hasSynced={state?.finishedAt != null} range={range} />
      )}
    </IntlMessages>
  )
}

async function ConnectionNotice({ instagram, hasPermission }: { instagram: Connection | null; hasPermission: boolean }) {
  const t = await getTranslations('analytics')
  if (!instagram) return null
  const values = {
    username: instagram.username,
    link: (children: ReactNode) => <a href="/api/auth/instagram/start" className={RECONNECT_LINK}>{children}</a>,
  }
  if (instagram.status === 'needs_reconnect') {
    return <Notice tone="error">{t.rich('connection.expired', values)}</Notice>
  }
  if (!hasPermission) {
    return <Notice tone="warning">{t.rich('connection.permission', values)}</Notice>
  }
  return null
}

async function RangeNav({ current }: { current: RangeDays }) {
  const t = await getTranslations('analytics')
  return (
    <nav aria-label={t('range.label')} className="inline-flex rounded-lg border border-zinc-200 bg-white p-0.5 text-sm">
      {RANGES.map((days) => (
        <Link
          key={days}
          href={`/analitik?rentang=${days}`}
          aria-current={days === current ? 'page' : undefined}
          className={`rounded-md px-3 py-1 ${days === current ? 'bg-zinc-900 font-medium text-white' : 'text-zinc-600 hover:text-zinc-900'}`}
        >
          {t('range.days', { count: days })}
        </Link>
      ))}
    </nav>
  )
}

function StatCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className={`${CARD} space-y-2 p-5`}>
      <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">{label}</p>
      <p className="text-3xl font-semibold tracking-tight text-zinc-900 tabular-nums">{value}</p>
      <p className="text-xs text-zinc-500">{note}</p>
    </div>
  )
}

async function EmptyState({ hasSynced, range }: { hasSynced: boolean; range: RangeDays }) {
  const t = await getTranslations('analytics')
  return (
    <div className={`${CARD} px-6 py-12 text-center`}>
      <p className="font-semibold text-zinc-900">
        {hasSynced ? t('empty.noPosts', { count: range }) : t('empty.noData')}
      </p>
      <p className="mt-1 text-sm text-zinc-500">
        {hasSynced
          ? t('empty.published')
          : t('empty.firstSync')}
      </p>
    </div>
  )
}

const NUMBER_HEADS = ['views', 'reach', 'likes', 'comments', 'shares', 'saved', 'rate'] as const

async function PostTable({ posts, appIds }: { posts: AnalyticsPost[]; appIds: Set<string> }) {
  const t = await getTranslations('analytics')
  return (
    <div className={`${CARD} overflow-x-auto`}>
      <table className="w-full min-w-[56rem] text-sm">
        <thead className="border-b border-zinc-200 text-left text-xs font-medium tracking-wide text-zinc-500 uppercase">
          <tr>
            <th scope="col" className="px-4 py-3">
              {t('table.post')}
            </th>
            {NUMBER_HEADS.map((head) => (
              <th key={head} scope="col" className="px-3 py-3 text-right">
                {t(`table.${head}`)}
              </th>
            ))}
            <th scope="col" className="px-4 py-3">
              <span className="sr-only">{t('table.link')}</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {posts.map((post) => (
            <PostRow key={post.mediaId} post={post} isFromApp={appIds.has(post.mediaId)} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function NumberCell({ children }: { children: ReactNode }) {
  return <td className="px-3 py-3 text-right text-zinc-900 tabular-nums">{children}</td>
}

async function PostRow({ post, isFromApp }: { post: AnalyticsPost; isFromApp: boolean }) {
  const t = await getTranslations('analytics')
  const locale = await getLocale()
  const caption = post.caption.split('\n', 1)[0].trim()
  return (
    <tr>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="size-12 shrink-0 overflow-hidden rounded-md bg-zinc-100">
            {post.thumbnailUrl && <ExternalImage src={post.thumbnailUrl} className="size-full object-cover" />}
          </div>
          <div className="min-w-0 space-y-0.5">
            <p className="max-w-xs truncate text-zinc-900">{caption || <span className="text-zinc-400">{t('table.noCaption')}</span>}</p>
            <p className="flex flex-wrap items-center gap-x-2 text-xs text-zinc-500">
              <span>
                {post.productType === 'REELS' ? t('media.REELS') : post.mediaType === 'IMAGE' || post.mediaType === 'VIDEO' || post.mediaType === 'CAROUSEL_ALBUM' ? t(`media.${post.mediaType}`) : post.mediaType} · {formatShortDate(post.postedAt, locale)}
              </span>
              {isFromApp && (
                <span className="rounded-full bg-accent-soft px-2 py-0.5 font-medium text-accent-deep">{t('table.fromApp')}</span>
              )}
            </p>
            {post.insightsError && (
              <p className="max-w-xs truncate text-xs text-red-700" title={post.insightsError}>
                {t('table.insightsFailed', { message: post.insightsError })}
              </p>
            )}
          </div>
        </div>
      </td>
      <NumberCell>{formatCount(post.views, locale)}</NumberCell>
      <NumberCell>{formatCount(post.reach, locale)}</NumberCell>
      <NumberCell>{formatCount(post.likes, locale)}</NumberCell>
      <NumberCell>{formatCount(post.comments, locale)}</NumberCell>
      <NumberCell>{formatCount(post.shares, locale)}</NumberCell>
      <NumberCell>{formatCount(post.saved, locale)}</NumberCell>
      <NumberCell>{formatRate(engagementRate(post.totalInteractions, post.views), locale)}</NumberCell>
      <td className="px-4 py-3 text-right">
        {post.permalink && (
          <a
            href={post.permalink}
            target="_blank"
            rel="noreferrer"
            aria-label={t('table.openInstagram')}
            className="inline-flex text-zinc-400 hover:text-zinc-900"
          >
            <ExternalLink size={16} aria-hidden="true" />
          </a>
        )}
      </td>
    </tr>
  )
}
