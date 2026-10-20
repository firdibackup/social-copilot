import 'server-only'
import { describeError } from './errors'
import { COMMENT_DAYS } from './inbox-rules'
import { InstagramApiError } from './instagram'
import { mapLimit } from './map-limit'
import { listThreadsConversation, listThreadsPostsSince, THREADS_REPLIES_SCOPE, type ThreadsPost, type ThreadsReplyItem } from './threads'
import {
  claimThreadsReplySync,
  getThreadsAccount,
  getThreadsConnection,
  releaseThreadsReplySync,
  ThreadsReconnectError,
} from './threads-connection'
import { removeVanishedThreadsReplies, saveThreadsPosts, saveThreadsReplies } from './threads-inbox'
import { toReplyRows } from './threads-replies'

/** Opening the tab or Muat ulang pulls again only this long after the last pull started. */
const COOLDOWN_MS = 10 * 60 * 1000
/** Conversation requests in flight at once. */
const CONCURRENCY = 3
// ponytail: 30 posts of 30 days and 200 replies each; page further when accounts post or get more.
const MAX_POSTS = 30
const MAX_REPLIES_PER_POST = 200
const DAY_MS = 24 * 60 * 60 * 1000

/** The connection was made without permission to read replies: the owner must reconnect once. */
export class MissingThreadsRepliesPermissionError extends Error {
  override name = 'MissingThreadsRepliesPermissionError'
}

export interface ThreadsSyncResult {
  posts: number
  replies: number
  failed: number
}

type Conversation = { replies: ThreadsReplyItem[]; isComplete: boolean }

/** One post's conversation, or null when it failed. Only a rejected token ends the whole pull. */
async function readConversation(accessToken: string, post: ThreadsPost): Promise<Conversation | null> {
  try {
    return await listThreadsConversation(accessToken, post.id, MAX_REPLIES_PER_POST)
  } catch (error) {
    if (error instanceof InstagramApiError && error.isInvalidToken) throw error
    console.error('[balasan] balasan Threads gagal ditarik:', describeError(error))
    return null
  }
}

async function runPull(userId: string, accountId: string): Promise<ThreadsSyncResult> {
  const account = await getThreadsAccount(userId, accountId)
  const startedAt = new Date()
  const { posts } = await listThreadsPostsSince(
    account.accessToken,
    new Date(startedAt.getTime() - COMMENT_DAYS * DAY_MS),
    MAX_POSTS,
  )
  await saveThreadsPosts(userId, accountId, posts)

  const results = await mapLimit(posts, CONCURRENCY, (post) => readConversation(account.accessToken, post))
  let replies = 0
  for (const [index, post] of posts.entries()) {
    const conversation = results[index]
    if (!conversation) continue
    const rows = toReplyRows(post.id, conversation.replies, account.username)
    await saveThreadsReplies(userId, accountId, rows)
    if (conversation.isComplete) {
      await removeVanishedThreadsReplies(
        userId,
        post.id,
        rows.map((row) => row.replyId),
        startedAt,
      )
    }
    replies += rows.length
  }
  return { posts: posts.length, replies, failed: results.filter((result) => result === null).length }
}

/**
 * Pulls the replies under the account's Threads posts of the last 30 days, or answers 'cooldown' when a pull started
 * less than 10 minutes ago. Throws MissingThreadsRepliesPermissionError, ThreadsReconnectError or the error that ended
 * it; a failed pull frees its claim.
 */
export async function syncThreadsReplies(userId: string, accountId: string): Promise<ThreadsSyncResult | 'cooldown'> {
  const connection = await getThreadsConnection(userId, accountId)
  if (!connection) throw new ThreadsReconnectError('Threads belum terhubung')
  if (!connection.scopes.includes(THREADS_REPLIES_SCOPE)) {
    throw new MissingThreadsRepliesPermissionError('Izin membaca balasan Threads belum diberikan')
  }
  if (!(await claimThreadsReplySync(userId, COOLDOWN_MS))) return 'cooldown'
  try {
    return await runPull(userId, accountId)
  } catch (error) {
    await releaseThreadsReplySync(userId).catch((releaseError: unknown) =>
      console.error('[balasan] klaim tarik balasan Threads gagal dilepas:', describeError(releaseError)),
    )
    throw error
  }
}
