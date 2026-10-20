import { signMediaUrls } from '@/lib/assets'
import { getCurrentPeriod } from '@/lib/billing'
import { getPublishingAccount, markNeedsReconnect, NeedsReconnectError } from '@/lib/connection'
import { describeError } from '@/lib/errors'
import { createContainer, getContainerStatus, getPermalink, InstagramApiError, publishContainer } from '@/lib/instagram'
import {
  finishAttempt,
  getMediaPaths,
  markFailed,
  markPublished,
  scheduleRetry,
  setContainerId,
  setPermalink,
  startAttempt,
  type AttemptOutcome,
  type ClaimedPost,
} from '@/lib/posts'

// The Threads loop (threads-publish.ts) retries on the same schedule.
export const MAX_ATTEMPTS = 5
export const RETRY_DELAYS_MINUTES = [1, 5, 15, 30]
export const LATE_LIMIT_MS = 60 * 60 * 1000

const RECONNECT_MESSAGE = 'Sambungkan ulang Instagram di Pengaturan, lalu pilih Coba lagi.'
const LATE_MESSAGE = 'Terlewat lebih dari 60 menit dari jadwal. Pilih Coba lagi untuk menerbitkan sekarang.'
const PROCESSING_MESSAGE = 'Instagram masih memproses foto.'
const EXPIRED_MESSAGE = 'Langganan berakhir. Perpanjang di halaman Langganan, lalu pilih Coba lagi.'
const OTHER_ACCOUNT_MESSAGE = 'Akun Instagram berbeda'

/** The post certainly did not go out and should not be retried. */
class PublishFailed extends Error {
  constructor(
    message: string,
    readonly clearContainer: boolean,
  ) {
    super(message)
  }
}

/** Worth another attempt; any container stays, since it may still publish. */
class RetryLater extends Error {}

interface Settled {
  outcome: AttemptOutcome
  error: string | null
}

const withCaption = (params: Record<string, string>, caption: string) => (caption ? { ...params, caption } : params)

async function createPostContainer(accessToken: string, userId: string, post: ClaimedPost): Promise<string> {
  const paths = await getMediaPaths(post.id)
  if (paths.length === 0) throw new PublishFailed('Post tidak punya foto.', false)
  const urls = await signMediaUrls(paths)

  if (urls.length === 1) return createContainer(accessToken, userId, withCaption({ image_url: urls[0] }, post.caption))
  const children = await Promise.all(
    urls.map((url) => createContainer(accessToken, userId, { image_url: url, is_carousel_item: 'true' })),
  )
  return createContainer(
    accessToken,
    userId,
    withCaption({ media_type: 'CAROUSEL', children: children.join(',') }, post.caption),
  )
}

async function publish(post: ClaimedPost, now: Date): Promise<void> {
  if (post.attemptCount === 1 && now.getTime() - post.scheduledAt.getTime() > LATE_LIMIT_MS) {
    throw new PublishFailed(LATE_MESSAGE, false)
  }
  // Any container stays: after renewing, Coba lagi asks Instagram about it before publishing again.
  if (!(await getCurrentPeriod(post.userId, now))) throw new PublishFailed(EXPIRED_MESSAGE, false)
  const { accessToken, instagramUserId } = await getPublishingAccount(post.userId)
  // The owner switched accounts since: this post must never go out on the account connected now. Any container
  // stays, since it belongs to the old account and only that account can say whether it went out.
  if (post.accountId !== instagramUserId) throw new PublishFailed(OTHER_ACCOUNT_MESSAGE, false)

  // An earlier attempt left a container: Instagram may already have published it.
  let containerId = post.igContainerId
  if (containerId) {
    const status = await getContainerStatus(accessToken, containerId)
    if (status === 'PUBLISHED') return markPublished(post.id, null)
    if (status === 'IN_PROGRESS') throw new RetryLater(PROCESSING_MESSAGE)
    if (status === 'ERROR' || status === 'EXPIRED') {
      await setContainerId(post.id, null)
      containerId = null
    }
  }

  if (!containerId) {
    containerId = await createPostContainer(accessToken, instagramUserId, post)
    // Saved before publishing, so a crash or timeout from here on is caught by the check above.
    await setContainerId(post.id, containerId)
    const status = await getContainerStatus(accessToken, containerId)
    if (status === 'IN_PROGRESS') throw new RetryLater(PROCESSING_MESSAGE)
    if (status !== 'FINISHED') throw new PublishFailed(`Instagram gagal memproses foto (${status}).`, true)
  }

  const mediaId = await publishContainer(accessToken, instagramUserId, containerId)
  await markPublished(post.id, mediaId)
  try {
    await setPermalink(post.id, await getPermalink(accessToken, mediaId))
  } catch (error) {
    console.error(`[worker] permalink post ${post.id} gagal diambil:`, describeError(error))
  }
}

async function fail(post: ClaimedPost, message: string, clearContainer: boolean): Promise<Settled> {
  await markFailed(post.id, message, clearContainer)
  return { outcome: 'failed', error: message }
}

async function settle(post: ClaimedPost, error: unknown, now: Date): Promise<Settled> {
  console.error(`[worker] post ${post.id} percobaan ${post.attemptCount} gagal:`, describeError(error))

  if (error instanceof PublishFailed) return fail(post, error.message, error.clearContainer)
  if (error instanceof NeedsReconnectError) return fail(post, RECONNECT_MESSAGE, false)
  if (error instanceof InstagramApiError && error.isInvalidToken) {
    await markNeedsReconnect(post.userId)
    return fail(post, RECONNECT_MESSAGE, false)
  }
  // A rejection is final, and a rejected request published nothing, so the container can go.
  if (error instanceof InstagramApiError && !error.isTransient) {
    return fail(post, `Instagram menolak post: ${error.message}`, true)
  }

  // Network trouble, Instagram hiccups, the database, or a container still processing.
  const message = error instanceof Error ? error.message : 'Kesalahan tidak dikenal'
  if (post.attemptCount >= MAX_ATTEMPTS) return fail(post, message, false)
  const delayMinutes = RETRY_DELAYS_MINUTES[post.attemptCount - 1] ?? RETRY_DELAYS_MINUTES.at(-1)!
  await scheduleRetry(post.id, new Date(now.getTime() + delayMinutes * 60_000), message)
  return { outcome: 'retry', error: message }
}

/** One publishing attempt for a claimed post. Every outcome is written to the post and to publish_attempts. */
export async function processPost(post: ClaimedPost, now = new Date()): Promise<void> {
  const attemptId = await startAttempt(post.id)
  const settled = await publish(post, now).then(
    (): Settled => ({ outcome: 'published', error: null }),
    (error: unknown) => settle(post, error, now),
  )
  await finishAttempt(attemptId, settled.outcome, settled.error)
}
