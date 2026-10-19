import 'server-only'
import { saveMediaBasics } from './analytics'
import {
  claimCommentSync,
  markReplies,
  releaseCommentSync,
  removeVanishedComments,
  saveComments,
  type CommentInput,
} from './comments'
import { getConnection, getPublishingAccount, NeedsReconnectError } from './connection'
import { describeError } from './errors'
import { COMMENT_DAYS, isOwnComment } from './inbox-rules'
import {
  COMMENTS_SCOPE,
  InstagramApiError,
  listMediaComments,
  listMediaSince,
  type MediaComments,
  type OwnMedia,
} from './instagram'
import { mapLimit } from './map-limit'

/** Opening the tab or Muat ulang pulls again only this long after the last pull started. */
const COOLDOWN_SECONDS = 10 * 60
/** Comment requests in flight at once. */
const CONCURRENCY = 3
// ponytail: 60 posts of 30 days and 200 top-level comments each; page further when accounts post or get more.
const MAX_POSTS = 60
const MAX_COMMENTS_PER_POST = 200
const DAY_MS = 24 * 60 * 60 * 1000

/** The connection was made before Balasan read comments: the owner must reconnect once. */
export class MissingCommentsPermissionError extends Error {
  override name = 'MissingCommentsPermissionError'
}

export interface CommentSyncResult {
  posts: number
  comments: number
  failed: number
}

/** A post Instagram counts no comments on is skipped: incomplete, so nothing stored for it is removed. */
const NOT_READ: MediaComments = { comments: [], isComplete: false }

/** One post's comments, or null when they failed. Only a rejected token ends the whole pull. */
async function readComments(accessToken: string, post: OwnMedia): Promise<MediaComments | null> {
  if (post.comments === 0) return NOT_READ
  try {
    return await listMediaComments(accessToken, post.id, MAX_COMMENTS_PER_POST)
  } catch (error) {
    if (error instanceof InstagramApiError && error.isInvalidToken) throw error
    console.error('[balasan] komentar post gagal ditarik:', describeError(error))
    return null
  }
}

async function runPull(userId: string, ownerUsername: string): Promise<CommentSyncResult> {
  const account = await getPublishingAccount(userId)
  const accountId = account.instagramUserId
  const startedAt = new Date()
  const { media } = await listMediaSince(account.accessToken, new Date(startedAt.getTime() - COMMENT_DAYS * DAY_MS), MAX_POSTS)
  // Rows go under the account the token read, which is the connected one even if it changed mid-request.
  await saveMediaBasics(userId, accountId, media)

  const results = await mapLimit(media, CONCURRENCY, (post) => readComments(account.accessToken, post))
  const read = media.flatMap((post, index) => {
    const result = results[index]
    return result ? [{ mediaId: post.id, ...result }] : []
  })
  const comments: CommentInput[] = read.flatMap((post) =>
    post.comments.map((comment) => ({ ...comment, isFromOwner: isOwnComment(comment, accountId, ownerUsername) })),
  )
  await saveComments(userId, accountId, comments, 'refresh')
  await mapLimit(
    read.filter((post) => post.isComplete),
    CONCURRENCY,
    (post) =>
      removeVanishedComments(
        userId,
        post.mediaId,
        post.comments.map((comment) => comment.id),
        startedAt,
      ),
  )
  await markReplies(userId, read.map((post) => post.mediaId))
  return { posts: read.length, comments: comments.length, failed: results.filter((result) => result === null).length }
}

/**
 * Pulls the comments of the account's posts of the last 30 days, or answers 'cooldown' when a pull started less than
 * 10 minutes ago. Throws MissingCommentsPermissionError, NeedsReconnectError or the InstagramApiError that ended it;
 * a failed pull frees its claim.
 */
export async function syncComments(userId: string, accountId: string): Promise<CommentSyncResult | 'cooldown'> {
  const connection = await getConnection(userId)
  if (!connection) throw new NeedsReconnectError('Instagram belum terhubung')
  if (!connection.scopes.includes(COMMENTS_SCOPE)) {
    throw new MissingCommentsPermissionError('Izin komentar belum diberikan')
  }
  if (!(await claimCommentSync(userId, accountId, COOLDOWN_SECONDS))) return 'cooldown'
  try {
    return await runPull(userId, connection.username)
  } catch (error) {
    await releaseCommentSync(userId, accountId).catch((releaseError: unknown) =>
      console.error('[balasan] klaim tarik komentar gagal dilepas:', describeError(releaseError)),
    )
    throw error
  }
}
