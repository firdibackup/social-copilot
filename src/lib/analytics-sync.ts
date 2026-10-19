import 'server-only'
import { claimSync, finishSync, MAX_SYNC_POSTS, releaseSync, removeVanished, saveSynced, type SyncedMedia } from './analytics'
import { SYNC_DAYS } from './analytics-metrics'
import { getConnection, getPublishingAccount, NeedsReconnectError } from './connection'
import { describeError } from './errors'
import { getMediaInsights, INSIGHTS_SCOPE, InstagramApiError, listMediaSince, type OwnMedia } from './instagram'
import { mapLimit } from './map-limit'

/** Refresh waits this long after the last sync started. */
const COOLDOWN_SECONDS = 10 * 60
/** Insights requests in flight at once. */
const CONCURRENCY = 3
/** Waits before the 2nd and 3rd try of a post after a transient Graph error. */
const RETRY_DELAYS_MS = [2_000, 8_000]
/** Graph's throttling codes, 80002 being Instagram's per-account limit: once hit, the rest of the sync waits. */
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613, 80002])
const ERROR_MAX_LENGTH = 200
const THROTTLED = 'Instagram membatasi permintaan untuk sementara. Coba Refresh lagi nanti.'
const UNAVAILABLE = 'Instagram sedang bermasalah. Coba Refresh lagi nanti.'
const NO_INSIGHTS = 'Instagram tidak mengirim insights untuk post ini.'
const DAY_MS = 24 * 60 * 60 * 1000

/** The connection was made before Analitik asked for insights: the owner must reconnect once. */
export class MissingInsightsPermissionError extends Error {
  override name = 'MissingInsightsPermissionError'
}

export interface SyncResult {
  updated: number
  failed: number
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const isRateLimit = (error: unknown) =>
  error instanceof InstagramApiError && error.code !== null && RATE_LIMIT_CODES.has(error.code)

/**
 * Shared by the posts of one sync: after a rate limit, or a post that ran out of retries, the rest fail with this
 * reason without asking, so an outage can't keep the action waiting for minutes.
 */
interface Halt {
  reason: string | null
}

/** One post's insights. Only a rejected token ends the whole sync; any other failure stays with this post. */
async function readInsights(accessToken: string, media: OwnMedia, halt: Halt): Promise<SyncedMedia> {
  for (let attempt = 0; ; attempt++) {
    if (halt.reason) return { media, metrics: null, error: halt.reason }
    try {
      const metrics = await getMediaInsights(accessToken, media.id)
      // An empty answer would wipe the stored numbers; count it as failed so they stay.
      if (Object.values(metrics).every((value) => value === null)) return { media, metrics: null, error: NO_INSIGHTS }
      return { media, metrics, error: null }
    } catch (error) {
      if (error instanceof InstagramApiError && error.isInvalidToken) throw error
      const isTransient = error instanceof InstagramApiError && error.isTransient
      const delay = RETRY_DELAYS_MS[attempt]
      if (isTransient && delay !== undefined) {
        await sleep(delay)
        continue
      }
      if (isRateLimit(error)) halt.reason = THROTTLED
      else if (isTransient) halt.reason = UNAVAILABLE
      console.error('[analitik] insights post gagal:', describeError(error))
      const message = error instanceof InstagramApiError ? error.message : 'Insights gagal dibaca.'
      return { media, metrics: null, error: message.slice(0, ERROR_MAX_LENGTH) }
    }
  }
}

async function runSync(userId: string): Promise<SyncResult> {
  const account = await getPublishingAccount(userId)
  const since = new Date(Date.now() - SYNC_DAYS * DAY_MS)
  const { media, isComplete } = await listMediaSince(account.accessToken, since, MAX_SYNC_POSTS)
  const halt: Halt = { reason: null }
  const synced = await mapLimit(media, CONCURRENCY, (item) => readInsights(account.accessToken, item, halt))
  // Rows go under the account the token read, which is the connected one even if it changed mid-request.
  await saveSynced(userId, account.instagramUserId, synced)
  // An empty listing is more likely a glitch than an account that deleted everything: keep the rows then.
  if (isComplete && media.length > 0) {
    await removeVanished(userId, account.instagramUserId, media.map((item) => item.id))
  }
  const failed = synced.filter((item) => item.metrics === null).length
  return { updated: synced.length - failed, failed }
}

/**
 * Reads the account's posts of the last 90 days and their insights, or answers 'cooldown' when a sync started less
 * than 10 minutes ago. Throws MissingInsightsPermissionError, NeedsReconnectError or the InstagramApiError that ended
 * the sync; a failed sync frees its claim, so the next try may start at once.
 */
export async function syncAnalytics(userId: string, accountId: string): Promise<SyncResult | 'cooldown'> {
  const connection = await getConnection(userId)
  if (!connection) throw new NeedsReconnectError('Instagram belum terhubung')
  if (!connection.scopes.includes(INSIGHTS_SCOPE)) {
    throw new MissingInsightsPermissionError('Izin insights belum diberikan')
  }
  if (!(await claimSync(userId, accountId, COOLDOWN_SECONDS))) return 'cooldown'
  try {
    const result = await runSync(userId)
    await finishSync(userId, accountId, result)
    return result
  } catch (error) {
    await releaseSync(userId, accountId).catch((releaseError: unknown) =>
      console.error('[analitik] klaim sync gagal dilepas:', describeError(releaseError)),
    )
    throw error
  }
}
