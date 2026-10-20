import { signMediaUrls } from '@/lib/assets'
import { getCurrentPeriod } from '@/lib/billing'
import { describeError } from '@/lib/errors'
import { InstagramApiError } from '@/lib/instagram'
import {
  loadPublishItems,
  setItemContainer,
  setItemMedia,
  setThreadsResult,
  settleThreads,
  type ClaimedThreads,
  type PublishItem,
} from '@/lib/post-threads'
import { threadItemsError, threadsMediaType } from '@/lib/thread-items'
import {
  createThreadsContainer,
  findOwnReply,
  findOwnThread,
  getThreadsContainer,
  getThreadsPermalink,
  getThreadsQuota,
  publishThreadsContainer,
} from '@/lib/threads'
import {
  getThreadsAccount,
  markThreadsNeedsReconnect,
  ThreadsReconnectError,
  type ThreadsAccount,
} from '@/lib/threads-connection'
import { LATE_LIMIT_MS, MAX_ATTEMPTS, RETRY_DELAYS_MINUTES } from './publish'

/** Container checks before giving the attempt back: Meta suggests about 30 seconds for media. */
const READY_CHECKS = 6
const READY_DELAY_MS = 5_000

const RECONNECT_MESSAGE = 'Threads belum terhubung atau perlu disambungkan ulang. Hubungkan di Pengaturan, lalu pilih Coba lagi.'
const LATE_MESSAGE = 'Terlewat lebih dari 60 menit dari jadwal. Pilih Coba lagi untuk menerbitkan sekarang.'
const EXPIRED_MESSAGE = 'Langganan berakhir. Perpanjang di halaman Langganan, lalu pilih Coba lagi.'
const OTHER_ACCOUNT_MESSAGE = 'Akun Instagram berbeda'
const PROCESSING_MESSAGE = 'Threads masih memproses foto.'
const QUOTA_MESSAGE = 'Kuota posting Threads 24 jam sudah habis. Coba lagi besok.'

const uncertain = (number: number) =>
  `Post Threads #${number} mungkin sudah terbit, tapi tidak ditemukan lagi. Cek akun Threads sebelum mencoba lagi.`

/** The Threads version certainly can't go out as it is: no retry. */
class PublishFailed extends Error {}

/** Worth another attempt; every container id stays, since it may still publish. */
class RetryLater extends Error {}

type Sleep = (ms: number) => Promise<void>

const sleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Waits until a container can be published. ERROR and EXPIRED end the attempt for good. */
async function waitUntilReady(account: ThreadsAccount, containerId: string, wait: Sleep): Promise<void> {
  for (let check = 1; check <= READY_CHECKS; check++) {
    const { status, errorMessage } = await getThreadsContainer(account.accessToken, containerId)
    if (status === 'FINISHED') return
    if (status === 'ERROR' || status === 'EXPIRED') {
      throw new PublishFailed(`Threads gagal memproses media (${errorMessage ?? status}).`)
    }
    if (check < READY_CHECKS) await wait(READY_DELAY_MS)
  }
  throw new RetryLater(PROCESSING_MESSAGE)
}

/** A container for one item: text only, one photo, or a carousel whose children are made and finished first. */
async function createItemContainer(
  account: ThreadsAccount,
  item: PublishItem,
  replyTo: string | null,
  wait: Sleep,
): Promise<string> {
  const create = (params: Record<string, string>) =>
    createThreadsContainer(account.accessToken, account.threadsUserId, params)
  const urls = await signMediaUrls(item.storagePaths)
  const base = { ...(item.text ? { text: item.text } : {}), ...(replyTo ? { reply_to_id: replyTo } : {}) }
  const type = threadsMediaType(urls.length)
  if (type === 'TEXT') return create({ ...base, media_type: 'TEXT' })
  if (type === 'IMAGE') return create({ ...base, media_type: 'IMAGE', image_url: urls[0] })

  const children = await Promise.all(
    urls.map((url) => create({ media_type: 'IMAGE', image_url: url, is_carousel_item: 'true' })),
  )
  for (const child of children) await waitUntilReady(account, child, wait)
  return create({ ...base, media_type: 'CAROUSEL', children: children.join(',') })
}

/**
 * A container that says PUBLISHED, but whose media id was never saved (the answer to publish got lost): look the
 * post up by its text, so the chain can go on without posting it twice.
 */
async function recoverMediaId(account: ThreadsAccount, item: PublishItem, replyTo: string | null): Promise<string> {
  const found = item.text
    ? replyTo
      ? await findOwnReply(account.accessToken, replyTo, item.text)
      : await findOwnThread(account.accessToken, item.text)
    : null
  if (!found) throw new PublishFailed(uncertain(item.position + 1))
  return found
}

/** Publishes one item of the chain, replying to `replyTo`. Returns its Threads id. */
async function publishItem(
  account: ThreadsAccount,
  postId: string,
  item: PublishItem,
  replyTo: string | null,
  wait: Sleep,
): Promise<string> {
  let containerId = item.containerId
  // An earlier attempt left a container: it may already be on Threads.
  if (containerId) {
    const { status } = await getThreadsContainer(account.accessToken, containerId)
    if (status === 'PUBLISHED') {
      const mediaId = await recoverMediaId(account, item, replyTo)
      await setItemMedia(postId, item.position, mediaId)
      return mediaId
    }
    if (status === 'ERROR' || status === 'EXPIRED') {
      await setItemContainer(postId, item.position, null)
      containerId = null
    }
  }

  if (!containerId) {
    containerId = await createItemContainer(account, item, replyTo, wait)
    // Saved before publishing, so a crash or timeout from here on is caught by the check above.
    await setItemContainer(postId, item.position, containerId)
  }
  try {
    await waitUntilReady(account, containerId, wait)
  } catch (error) {
    // A container Threads couldn't process will never publish: the next try makes a new one.
    if (error instanceof PublishFailed) await setItemContainer(postId, item.position, null)
    throw error
  }
  const mediaId = await publishThreadsContainer(account.accessToken, account.threadsUserId, containerId)
  await setItemMedia(postId, item.position, mediaId)
  return mediaId
}

/** Stops before posting anything when the rolling 24-hour quota can't take the rest of the chain. */
async function checkQuota(account: ThreadsAccount, items: readonly PublishItem[]): Promise<void> {
  const waiting = items.filter((item) => item.mediaId === null)
  if (waiting.length === 0) return
  const quota = await getThreadsQuota(account.accessToken, account.threadsUserId)
  const replies = waiting.filter((item) => item.position > 0).length
  if ((waiting.some((item) => item.position === 0) && quota.posts < 1) || replies > quota.replies) {
    throw new PublishFailed(QUOTA_MESSAGE)
  }
}

async function publish(claimed: ClaimedThreads, now: Date, wait: Sleep): Promise<void> {
  if (claimed.attemptCount === 1 && now.getTime() - claimed.dueAt.getTime() > LATE_LIMIT_MS) {
    throw new PublishFailed(LATE_MESSAGE)
  }
  if (!(await getCurrentPeriod(claimed.userId, now))) throw new PublishFailed(EXPIRED_MESSAGE)
  // Threads goes out only for the account (brand) the post belongs to, through the connection made for it.
  if (!claimed.accountId) throw new PublishFailed(OTHER_ACCOUNT_MESSAGE)
  const account = await getThreadsAccount(claimed.userId, claimed.accountId)

  const items = await loadPublishItems(claimed.postId)
  const invalid = threadItemsError(items.map((item) => ({ text: item.text, assetIds: item.storagePaths })))
  if (invalid) throw new PublishFailed(invalid)
  await checkQuota(account, items)

  // Each item replies to the one before; items already out are skipped, so a retry continues the chain.
  const ids: string[] = []
  for (const item of items) {
    ids.push(item.mediaId ?? (await publishItem(account, claimed.postId, item, ids.at(-1) ?? null, wait)))
  }
  const permalink = await getThreadsPermalink(account.accessToken, ids[0]).catch((error: unknown) => {
    console.error(`[worker] permalink Threads ${claimed.postId} gagal diambil:`, describeError(error))
    return null
  })
  await setThreadsResult(claimed.postId, ids[0], permalink)
}

async function settle(claimed: ClaimedThreads, error: unknown, now: Date): Promise<void> {
  console.error(`[worker] Threads ${claimed.postId} percobaan ${claimed.attemptCount} gagal:`, describeError(error))
  const fail = (message: string) => settleThreads(claimed.postId, 'failed', message, null)

  if (error instanceof PublishFailed) return fail(error.message)
  if (error instanceof ThreadsReconnectError) return fail(RECONNECT_MESSAGE)
  if (error instanceof InstagramApiError && error.isInvalidToken) {
    await markThreadsNeedsReconnect(claimed.userId)
    return fail(RECONNECT_MESSAGE)
  }
  if (error instanceof InstagramApiError && !error.isTransient) return fail(`Threads menolak post: ${error.message}`)

  // Network trouble, Threads hiccups, the database, or a container still processing.
  const message = error instanceof Error ? error.message : 'Kesalahan tidak dikenal'
  if (claimed.attemptCount >= MAX_ATTEMPTS) return fail(message)
  const delayMinutes = RETRY_DELAYS_MINUTES[claimed.attemptCount - 1] ?? RETRY_DELAYS_MINUTES.at(-1)!
  await settleThreads(claimed.postId, 'pending', message, new Date(now.getTime() + delayMinutes * 60_000))
}

/** One attempt for a claimed Threads version. Every outcome lands on post_threads (and on a Threads-only post). */
export async function processThreadsPost(claimed: ClaimedThreads, now = new Date(), wait: Sleep = sleep): Promise<void> {
  await publish(claimed, now, wait).then(
    () => settleThreads(claimed.postId, 'published', null, null),
    (error: unknown) => settle(claimed, error, now),
  )
}
