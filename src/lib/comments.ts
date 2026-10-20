import 'server-only'
import type { CommentState } from './inbox-rules'
import type { PostComment } from './instagram'
import { db, unwrap } from './supabase'

// ponytail: the Komentar list reads the newest 1000 comments of 30 days, a post its newest 500, the bell 100
// unanswered ones; group in SQL when accounts outgrow them.
const LIST_LIMIT = 1000
const POST_LIMIT = 500
const UNREAD_LIMIT = 100

/** A comment as Balasan shows it. */
export interface StoredComment extends CommentState {
  commentId: string
  mediaId: string
  parentId: string | null
  username: string | null
  text: string
}

/** A comment to store: what Graph or the webhook gave, and whether the connected account wrote it. */
export interface CommentInput extends PostComment {
  isFromOwner: boolean
}

/** A post in the Komentar list. `thumbnailUrl` is a signed CDN link: never log it. */
export interface CommentPost {
  mediaId: string
  caption: string
  thumbnailUrl: string | null
  permalink: string | null
}

interface CommentRow {
  comment_id: string
  media_id: string
  parent_id: string | null
  username: string | null
  text: string
  created_at: string
  is_hidden: boolean
  is_from_owner: boolean
  replied_at: string | null
  dm_sent_at: string | null
  seen_at: string | null
}

const COMMENT_COLUMNS =
  'comment_id, media_id, parent_id, username, text, created_at, is_hidden, is_from_owner, replied_at, dm_sent_at, seen_at'

const toDate = (value: string | null) => (value ? new Date(value) : null)

const toComment = (row: CommentRow): StoredComment => ({
  commentId: row.comment_id,
  mediaId: row.media_id,
  parentId: row.parent_id,
  username: row.username,
  text: row.text,
  createdAt: new Date(row.created_at),
  isHidden: row.is_hidden,
  isFromOwner: row.is_from_owner,
  repliedAt: toDate(row.replied_at),
  dmSentAt: toDate(row.dm_sent_at),
  seenAt: toDate(row.seen_at),
})

const nowIso = () => new Date().toISOString()

/**
 * Stores comments of the account's posts. A pull (`refresh`) overwrites what Instagram says now, hidden included;
 * the webhook (`insert`) only adds comments not seen yet, since it doesn't say whether one is hidden. Read and reply
 * state is never overwritten.
 */
export async function saveComments(
  userId: string,
  accountId: string,
  comments: readonly CommentInput[],
  mode: 'refresh' | 'insert',
): Promise<void> {
  if (comments.length === 0) return
  const rows = comments.map((comment) => ({
    user_id: userId,
    account_id: accountId,
    comment_id: comment.id,
    media_id: comment.mediaId,
    parent_id: comment.parentId,
    from_id: comment.fromId,
    username: comment.username,
    text: comment.text,
    created_at: comment.createdAt.toISOString(),
    is_hidden: comment.isHidden,
    is_from_owner: comment.isFromOwner,
  }))
  unwrap(
    await db().from('ig_comments').upsert(rows, { onConflict: 'user_id,comment_id', ignoreDuplicates: mode === 'insert' }),
  )
}

/** The account's public reply, just sent under `parentId`: stored at once, and its thread counts as replied. */
export async function recordOwnReply(
  userId: string,
  accountId: string,
  reply: { id: string; mediaId: string; parentId: string; text: string },
): Promise<void> {
  await saveComments(
    userId,
    accountId,
    [{ ...reply, fromId: accountId, username: null, createdAt: new Date(), isHidden: false, isFromOwner: true }],
    'insert',
  )
  await markReplies(userId, [reply.mediaId])
}

/** Marks comments of these posts replied where the owner has since commented in their thread. */
export async function markReplies(userId: string, mediaIds: readonly string[]): Promise<void> {
  if (mediaIds.length === 0) return
  unwrap(await db().rpc('mark_comment_replies', { p_user_id: userId, p_media_ids: [...new Set(mediaIds)] }))
}

/**
 * Drops a post's comments that its last full listing no longer had: deleted on Instagram. Comments newer than the
 * listing (`before`) stay, since a webhook may have stored them meanwhile.
 */
export async function removeVanishedComments(
  userId: string,
  mediaId: string,
  keptIds: readonly string[],
  before: Date,
): Promise<void> {
  let query = db()
    .from('ig_comments')
    .delete()
    .eq('user_id', userId)
    .eq('media_id', mediaId)
    .lt('created_at', before.toISOString())
  // Comment ids are digits only (listMediaComments checks), so they are safe inside the filter.
  if (keptIds.length > 0) query = query.not('comment_id', 'in', `(${keptIds.join(',')})`)
  unwrap(await query)
}

/** The account's comments from `since` on, newest first, for the post list. */
export async function listRecentComments(userId: string, accountId: string, since: Date): Promise<StoredComment[]> {
  const rows = unwrap(
    await db()
      .from('ig_comments')
      .select(COMMENT_COLUMNS)
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false })
      .limit(LIST_LIMIT),
  ) as CommentRow[]
  return rows.map(toComment)
}

export async function listPostComments(userId: string, accountId: string, mediaId: string): Promise<StoredComment[]> {
  const rows = unwrap(
    await db()
      .from('ig_comments')
      .select(COMMENT_COLUMNS)
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .eq('media_id', mediaId)
      .order('created_at', { ascending: false })
      .limit(POST_LIMIT),
  ) as CommentRow[]
  return rows.map(toComment)
}

/** The bell's candidates: others' visible comments still waiting for a reply, newest first. */
export async function listNotificationComments(userId: string, accountId: string): Promise<StoredComment[]> {
  const rows = unwrap(
    await db()
      .from('ig_comments')
      .select(COMMENT_COLUMNS)
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .eq('is_from_owner', false)
      .eq('is_hidden', false)
      .is('replied_at', null)
      .is('dm_sent_at', null)
      .order('created_at', { ascending: false })
      .limit(UNREAD_LIMIT),
  ) as CommentRow[]
  return rows.map(toComment)
}

/** Null also for a comment on another account's post: actions go out from the connected account. */
export async function getComment(userId: string, accountId: string, commentId: string): Promise<StoredComment | null> {
  const row = unwrap(
    await db()
      .from('ig_comments')
      .select(COMMENT_COLUMNS)
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .eq('comment_id', commentId)
      .maybeSingle(),
  ) as CommentRow | null
  return row && toComment(row)
}

/** A top-level comment and its replies, oldest first, for the AI's context. `topId` is a numeric comment id. */
export async function getCommentThread(userId: string, topId: string): Promise<StoredComment[]> {
  const rows = unwrap(
    await db()
      .from('ig_comments')
      .select(COMMENT_COLUMNS)
      .eq('user_id', userId)
      .or(`comment_id.eq.${topId},parent_id.eq.${topId}`)
      .order('created_at', { ascending: true })
      .limit(POST_LIMIT),
  ) as CommentRow[]
  return rows.map(toComment)
}

/** Caption, thumbnail and link of these posts, from Analitik's table; a post it doesn't have is left out. */
export async function listCommentPosts(userId: string, mediaIds: readonly string[]): Promise<Map<string, CommentPost>> {
  if (mediaIds.length === 0) return new Map()
  const rows = unwrap(
    await db()
      .from('ig_media')
      .select('media_id, caption, thumbnail_url, permalink')
      .eq('user_id', userId)
      .in('media_id', [...mediaIds]),
  ) as { media_id: string; caption: string; thumbnail_url: string | null; permalink: string | null }[]
  return new Map(
    rows.map((row) => [
      row.media_id,
      { mediaId: row.media_id, caption: row.caption, thumbnailUrl: row.thumbnail_url, permalink: row.permalink },
    ]),
  )
}

/** Opening a post's comments reads them all. Returns how many were unread. */
export async function markPostCommentsSeen(userId: string, accountId: string, mediaId: string): Promise<number> {
  const rows = unwrap(
    await db()
      .from('ig_comments')
      .update({ seen_at: nowIso() })
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .eq('media_id', mediaId)
      .is('seen_at', null)
      .eq('is_from_owner', false)
      .select('comment_id'),
  ) as unknown[]
  return rows.length
}

export async function markAllCommentsSeen(userId: string, accountId: string): Promise<void> {
  unwrap(
    await db()
      .from('ig_comments')
      .update({ seen_at: nowIso() })
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .is('seen_at', null)
      .eq('is_from_owner', false),
  )
}

export async function setCommentReadState(
  userId: string,
  accountId: string,
  commentId: string,
  read: boolean,
): Promise<void> {
  unwrap(
    await db()
      .from('ig_comments')
      .update({ seen_at: read ? nowIso() : null })
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .eq('comment_id', commentId)
      .eq('is_from_owner', false),
  )
}

export async function setCommentHiddenRow(userId: string, commentId: string, hidden: boolean): Promise<void> {
  unwrap(await db().from('ig_comments').update({ is_hidden: hidden }).eq('user_id', userId).eq('comment_id', commentId))
}

/** Instagram deletes a comment's replies with it. `commentId` is a numeric comment id. */
export async function deleteCommentRows(userId: string, commentId: string): Promise<void> {
  unwrap(
    await db()
      .from('ig_comments')
      .delete()
      .eq('user_id', userId)
      .or(`comment_id.eq.${commentId},parent_id.eq.${commentId}`),
  )
}

export async function markDmSent(userId: string, commentId: string): Promise<void> {
  unwrap(
    await db()
      .from('ig_comments')
      .update({ dm_sent_at: nowIso() })
      .eq('user_id', userId)
      .eq('comment_id', commentId)
      .is('dm_sent_at', null),
  )
}

/** False while another pull of the account started less than `cooldownSeconds` ago. */
export async function claimCommentSync(userId: string, accountId: string, cooldownSeconds: number): Promise<boolean> {
  return unwrap(
    await db().rpc('claim_comment_sync', {
      p_user_id: userId,
      p_account_id: accountId,
      p_cooldown_seconds: cooldownSeconds,
    }),
  ) as boolean
}

/** After a failed pull: the next visit may try again at once. */
export async function releaseCommentSync(userId: string, accountId: string): Promise<void> {
  unwrap(
    await db().from('comment_syncs').update({ started_at: null }).eq('user_id', userId).eq('account_id', accountId),
  )
}
