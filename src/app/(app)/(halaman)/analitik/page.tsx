import { ExternalLink } from 'lucide-react'
import type { Metadata } from 'next'
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
import { describeError, loadErrorMessage } from '@/lib/errors'
import { formatDateTime, formatShortDate } from '@/lib/format'
import { INSIGHTS_SCOPE } from '@/lib/instagram'
import { firstValue, type SearchParams } from '@/lib/params'
import { SyncPanel } from './sync-panel'

export const metadata: Metadata = { title: 'Analitik' }

const DAY_MS = 24 * 60 * 60 * 1000
const CARD = 'rounded-xl border border-zinc-200 bg-white'
const RECONNECT_LINK = 'font-medium underline underline-offset-2'
const MEDIA_LABELS: Record<string, string> = { IMAGE: 'Foto', VIDEO: 'Video', CAROUSEL_ALBUM: 'Carousel' }

interface AnalitikPageProps {
  searchParams: Promise<SearchParams>
}

export default function AnalitikPage({ searchParams }: AnalitikPageProps) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<LoadingState variant="analytics" label="Memuat analitik…" />}>
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

function lastSyncLabel(state: SyncState | null): string {
  if (!state?.finishedAt) return 'Belum pernah disinkronkan dengan Instagram.'
  return `Terakhir sync ${formatDateTime(state.finishedAt)}: ${state.updated} post diperbarui, ${state.failed} gagal.`
}

async function AnalyticsView({ searchParams }: { searchParams: Promise<SearchParams> }) {
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
    return <Notice tone="warning">{loadErrorMessage(error)}</Notice>
  }

  const { instagram, state, posts, appIds } = data
  const hasPermission = instagram?.scopes.includes(INSIGHTS_SCOPE) ?? false
  const canSync = instagram?.status === 'active' && hasPermission
  const summary = summarize(posts)

  return (
    <>
      <SyncPanel
        canSync={canSync}
        shouldSyncNow={canSync && isSyncStale(state?.startedAt ?? null, now)}
        lastSync={lastSyncLabel(state)}
      >
        <div className="max-w-xl space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Analitik</h1>
          <p className="text-zinc-500">
            Performa post Instagram dari 90 hari terakhir. Angka dari Instagram bisa terlambat sampai 48 jam.
          </p>
        </div>
      </SyncPanel>
      <ConnectionNotice instagram={instagram} hasPermission={hasPermission} />
      <RangeNav current={range} />
      <section aria-label="Ringkasan" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total post" value={formatCount(summary.postCount)} note={`${range} hari terakhir`} />
        <StatCard label="Views" value={formatCount(summary.views)} note="Semua post dengan metrik" />
        <StatCard label="Interaksi" value={formatCount(summary.interactions)} note="Suka, komentar, share, simpan" />
        <StatCard label="Engagement rate" value={formatRate(summary.engagementRate)} note="Interaksi / views" />
      </section>
      {posts.length > 0 ? (
        <PostTable posts={posts} appIds={appIds} />
      ) : (
        <EmptyState hasSynced={state?.finishedAt != null} range={range} />
      )}
    </>
  )
}

function ConnectionNotice({ instagram, hasPermission }: { instagram: Connection | null; hasPermission: boolean }) {
  if (!instagram) return null
  // A plain <a>: the route redirects off-site to Instagram. The callback lands on Pengaturan.
  const reconnect = (
    <a href="/api/auth/instagram/start" className={RECONNECT_LINK}>
      Hubungkan ulang Instagram
    </a>
  )
  if (instagram.status === 'needs_reconnect') {
    return (
      <Notice tone="error">
        Token Instagram kedaluwarsa atau dicabut, jadi analitik tidak bisa diperbarui. {reconnect} dengan @
        {instagram.username}.
      </Notice>
    )
  }
  if (!hasPermission) {
    return (
      <Notice tone="warning">
        Analitik butuh izin baru untuk membaca insights. {reconnect} sekali dan masuk dengan @{instagram.username}.
      </Notice>
    )
  }
  return null
}

function RangeNav({ current }: { current: RangeDays }) {
  return (
    <nav aria-label="Rentang waktu" className="inline-flex rounded-lg border border-zinc-200 bg-white p-0.5 text-sm">
      {RANGES.map((days) => (
        <Link
          key={days}
          href={`/analitik?rentang=${days}`}
          aria-current={days === current ? 'page' : undefined}
          className={`rounded-md px-3 py-1 ${days === current ? 'bg-zinc-900 font-medium text-white' : 'text-zinc-600 hover:text-zinc-900'}`}
        >
          {days} hari
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

function EmptyState({ hasSynced, range }: { hasSynced: boolean; range: RangeDays }) {
  return (
    <div className={`${CARD} px-6 py-12 text-center`}>
      <p className="font-semibold text-zinc-900">
        {hasSynced ? `Belum ada post dalam ${range} hari terakhir` : 'Belum ada data analitik'}
      </p>
      <p className="mt-1 text-sm text-zinc-500">
        {hasSynced
          ? 'Post Instagram akun ini akan muncul di sini setelah dipublikasikan.'
          : 'Post dan insights diambil dari Instagram saat sync pertama.'}
      </p>
    </div>
  )
}

const typeLabel = (post: AnalyticsPost) =>
  post.productType === 'REELS' ? 'Reels' : (MEDIA_LABELS[post.mediaType] ?? post.mediaType)

const NUMBER_HEADS = ['Views', 'Reach', 'Suka', 'Komentar', 'Share', 'Simpan', 'ER']

function PostTable({ posts, appIds }: { posts: AnalyticsPost[]; appIds: Set<string> }) {
  return (
    <div className={`${CARD} overflow-x-auto`}>
      <table className="w-full min-w-[56rem] text-sm">
        <thead className="border-b border-zinc-200 text-left text-xs font-medium tracking-wide text-zinc-500 uppercase">
          <tr>
            <th scope="col" className="px-4 py-3">
              Post
            </th>
            {NUMBER_HEADS.map((head) => (
              <th key={head} scope="col" className="px-3 py-3 text-right">
                {head}
              </th>
            ))}
            <th scope="col" className="px-4 py-3">
              <span className="sr-only">Link</span>
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

function PostRow({ post, isFromApp }: { post: AnalyticsPost; isFromApp: boolean }) {
  const caption = post.caption.split('\n', 1)[0].trim()
  return (
    <tr>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="size-12 shrink-0 overflow-hidden rounded-md bg-zinc-100">
            {post.thumbnailUrl && <ExternalImage src={post.thumbnailUrl} className="size-full object-cover" />}
          </div>
          <div className="min-w-0 space-y-0.5">
            <p className="max-w-xs truncate text-zinc-900">{caption || <span className="text-zinc-400">Tanpa caption</span>}</p>
            <p className="flex flex-wrap items-center gap-x-2 text-xs text-zinc-500">
              <span>
                {typeLabel(post)} · {formatShortDate(post.postedAt)}
              </span>
              {isFromApp && (
                <span className="rounded-full bg-accent-soft px-2 py-0.5 font-medium text-accent-deep">Lewat app</span>
              )}
            </p>
            {post.insightsError && (
              <p className="max-w-xs truncate text-xs text-red-700" title={post.insightsError}>
                Insights gagal: {post.insightsError}
              </p>
            )}
          </div>
        </div>
      </td>
      <NumberCell>{formatCount(post.views)}</NumberCell>
      <NumberCell>{formatCount(post.reach)}</NumberCell>
      <NumberCell>{formatCount(post.likes)}</NumberCell>
      <NumberCell>{formatCount(post.comments)}</NumberCell>
      <NumberCell>{formatCount(post.shares)}</NumberCell>
      <NumberCell>{formatCount(post.saved)}</NumberCell>
      <NumberCell>{formatRate(engagementRate(post.totalInteractions, post.views))}</NumberCell>
      <td className="px-4 py-3 text-right">
        {post.permalink && (
          <a
            href={post.permalink}
            target="_blank"
            rel="noreferrer"
            aria-label="Buka di Instagram"
            className="inline-flex text-zinc-400 hover:text-zinc-900"
          >
            <ExternalLink size={16} aria-hidden="true" />
          </a>
        )}
      </td>
    </tr>
  )
}
