import 'server-only'
import type { Metrics } from './analytics-metrics'
import type { OwnMedia } from './instagram'
import { db, unwrap } from './supabase'

/** ponytail: a sync reads at most this many posts of the last 90 days; page through insights if accounts post more. */
export const MAX_SYNC_POSTS = 150

const POST_COLUMNS =
  'media_id, media_type, media_product_type, caption, permalink, thumbnail_url, posted_at, views, reach, likes, comments, shares, saved, total_interactions, insights_error'

/** One post as the page shows it. `thumbnailUrl` is a signed CDN link: never log it. */
export interface AnalyticsPost {
  mediaId: string
  mediaType: string
  productType: string | null
  caption: string
  permalink: string | null
  thumbnailUrl: string | null
  postedAt: Date
  views: number | null
  reach: number | null
  likes: number | null
  comments: number | null
  shares: number | null
  saved: number | null
  totalInteractions: number | null
  insightsError: string | null
}

interface PostRow {
  media_id: string
  media_type: string
  media_product_type: string | null
  caption: string
  permalink: string | null
  thumbnail_url: string | null
  posted_at: string
  views: number | null
  reach: number | null
  likes: number | null
  comments: number | null
  shares: number | null
  saved: number | null
  total_interactions: number | null
  insights_error: string | null
}

const toPost = (row: PostRow): AnalyticsPost => ({
  mediaId: row.media_id,
  mediaType: row.media_type,
  productType: row.media_product_type,
  caption: row.caption,
  permalink: row.permalink,
  thumbnailUrl: row.thumbnail_url,
  postedAt: new Date(row.posted_at),
  views: row.views,
  reach: row.reach,
  likes: row.likes,
  comments: row.comments,
  shares: row.shares,
  saved: row.saved,
  totalInteractions: row.total_interactions,
  insightsError: row.insights_error,
})

/** The account's posts from `since` on, newest first. */
export async function listAnalyticsPosts(userId: string, accountId: string, since: Date): Promise<AnalyticsPost[]> {
  const rows = unwrap(
    await db()
      .from('ig_media')
      .select(POST_COLUMNS)
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .gte('posted_at', since.toISOString())
      .order('posted_at', { ascending: false })
      .limit(MAX_SYNC_POSTS),
  ) as PostRow[]
  return rows.map(toPost)
}

/** Which of these Instagram posts went out through the app's worker. */
export async function listAppMediaIds(userId: string, mediaIds: string[]): Promise<Set<string>> {
  if (mediaIds.length === 0) return new Set()
  const rows = unwrap(
    await db().from('posts').select('ig_media_id').eq('user_id', userId).in('ig_media_id', mediaIds),
  ) as { ig_media_id: string }[]
  return new Set(rows.map((row) => row.ig_media_id))
}

export interface SyncState {
  /** When the last sync started; null after a failed one. */
  startedAt: Date | null
  /** When the last successful sync ended. */
  finishedAt: Date | null
  updated: number
  failed: number
}

export async function getSyncState(userId: string, accountId: string): Promise<SyncState | null> {
  const row = unwrap(
    await db()
      .from('analytics_syncs')
      .select('started_at, finished_at, updated, failed')
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .maybeSingle(),
  ) as { started_at: string | null; finished_at: string | null; updated: number; failed: number } | null
  if (!row) return null
  return {
    startedAt: row.started_at ? new Date(row.started_at) : null,
    finishedAt: row.finished_at ? new Date(row.finished_at) : null,
    updated: row.updated,
    failed: row.failed,
  }
}

/** False while another sync of the account started less than `cooldownSeconds` ago. */
export async function claimSync(userId: string, accountId: string, cooldownSeconds: number): Promise<boolean> {
  return unwrap(
    await db().rpc('claim_analytics_sync', {
      p_user_id: userId,
      p_account_id: accountId,
      p_cooldown_seconds: cooldownSeconds,
    }),
  ) as boolean
}

/** After a failed sync: the next visit or Refresh may try again at once. */
export async function releaseSync(userId: string, accountId: string): Promise<void> {
  unwrap(
    await db().from('analytics_syncs').update({ started_at: null }).eq('user_id', userId).eq('account_id', accountId),
  )
}

export async function finishSync(
  userId: string,
  accountId: string,
  result: { updated: number; failed: number },
): Promise<void> {
  unwrap(
    await db()
      .from('analytics_syncs')
      .update({ finished_at: new Date().toISOString(), updated: result.updated, failed: result.failed })
      .eq('user_id', userId)
      .eq('account_id', accountId),
  )
}

/** A post read by a sync: its insights, or the reason they failed. */
export interface SyncedMedia {
  media: OwnMedia
  metrics: Metrics | null
  error: string | null
}

const mediaColumns = (userId: string, accountId: string, media: OwnMedia, syncedAt: string) => ({
  user_id: userId,
  account_id: accountId,
  media_id: media.id,
  media_type: media.mediaType,
  media_product_type: media.productType,
  caption: media.caption,
  permalink: media.permalink,
  thumbnail_url: media.thumbnailUrl,
  posted_at: media.postedAt.toISOString(),
  synced_at: syncedAt,
})

/**
 * Upserts the posts. A post whose insights failed is written apart without the metric columns (likes and comments
 * too), which an upsert then leaves as they were, so its last good numbers stay.
 */
export async function saveSynced(userId: string, accountId: string, synced: readonly SyncedMedia[]): Promise<void> {
  const syncedAt = new Date().toISOString()
  const read = synced.flatMap(({ media, metrics }) =>
    metrics
      ? [
          {
            ...mediaColumns(userId, accountId, media, syncedAt),
            views: metrics.views,
            reach: metrics.reach,
            likes: metrics.likes ?? media.likes,
            comments: metrics.comments ?? media.comments,
            shares: metrics.shares,
            saved: metrics.saved,
            total_interactions: metrics.total_interactions,
            insights_error: null,
          },
        ]
      : [],
  )
  const failed = synced.flatMap(({ media, metrics, error }) =>
    metrics ? [] : [{ ...mediaColumns(userId, accountId, media, syncedAt), insights_error: error }],
  )
  for (const rows of [read, failed]) {
    if (rows.length > 0) unwrap(await db().from('ig_media').upsert(rows, { onConflict: 'user_id,media_id' }))
  }
}

/**
 * Upserts posts without their metric columns, so stored numbers stay and a new post shows "—" until Analitik reads
 * its insights. The comments pull uses it for the Komentar list's thumbnails and captions.
 */
export async function saveMediaBasics(userId: string, accountId: string, media: readonly OwnMedia[]): Promise<void> {
  if (media.length === 0) return
  const syncedAt = new Date().toISOString()
  const rows = media.map((item) => mediaColumns(userId, accountId, item, syncedAt))
  unwrap(await db().from('ig_media').upsert(rows, { onConflict: 'user_id,media_id' }))
}

/**
 * Drops the account's posts that the last full listing no longer had: deleted, archived or past 90 days. The sync
 * never passes an empty list, which would delete them all.
 */
export async function removeVanished(userId: string, accountId: string, keptIds: readonly string[]): Promise<void> {
  // Ids are digits only (listMediaSince checks), so they are safe inside the filter.
  unwrap(
    await db()
      .from('ig_media')
      .delete()
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .not('media_id', 'in', `(${keptIds.join(',')})`),
  )
}
