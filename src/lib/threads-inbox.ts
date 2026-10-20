import 'server-only'
import type { CommentState } from './inbox-rules'
import type { ThreadsPost } from './threads'
import type { ThreadsReplyRow } from './threads-replies'
import { db, unwrap } from './supabase'

// ponytail: like Komentar for Instagram, the newest 1000 replies of 30 days and 500 per post; group in SQL when
// accounts outgrow them.
const LIST_LIMIT = 1000
const POST_LIMIT = 500

/**
 * A reply as the Komentar tab shows it. `commentId` is the reply's Threads id, named like Instagram's comments so the
 * tab's threading and counting helpers work on both.
 */
export interface StoredThreadsReply extends CommentState {
  commentId: string
  mediaId: string
  parentId: string | null
  /** What it answers: the post, or the reply a reply goes to. */
  repliedToId: string
  username: string | null
  text: string
}

/** One of the account's Threads posts in the Komentar tab. `thumbnailUrl` is a signed CDN link: never log it. */
export interface ThreadsPostView {
  mediaId: string
  caption: string
  thumbnailUrl: string | null
  permalink: string | null
}

interface ReplyRow {
  reply_id: string
  media_id: string
  replied_to_id: string
  parent_id: string | null
  username: string | null
  text: string
  created_at: string
  is_hidden: boolean
  is_from_owner: boolean
  replied_at: string | null
  seen_at: string | null
}

const COLUMNS =
  'reply_id, media_id, replied_to_id, parent_id, username, text, created_at, is_hidden, is_from_owner, replied_at, seen_at'

const toDate = (value: string | null) => (value ? new Date(value) : null)
const nowIso = () => new Date().toISOString()

const toReply = (row: ReplyRow): StoredThreadsReply => ({
  commentId: row.reply_id,
  mediaId: row.media_id,
  parentId: row.parent_id,
  repliedToId: row.replied_to_id,
  username: row.username,
  text: row.text,
  createdAt: new Date(row.created_at),
  isHidden: row.is_hidden,
  isFromOwner: row.is_from_owner,
  repliedAt: toDate(row.replied_at),
  // Threads has no private reply to a comment.
  dmSentAt: null,
  seenAt: toDate(row.seen_at),
})

export async function saveThreadsPosts(userId: string, accountId: string, posts: readonly ThreadsPost[]): Promise<void> {
  if (posts.length === 0) return
  const rows = posts.map((post) => ({
    user_id: userId,
    account_id: accountId,
    media_id: post.id,
    text: post.text,
    permalink: post.permalink,
    thumbnail_url: post.thumbnailUrl,
    posted_at: post.postedAt.toISOString(),
  }))
  unwrap(await db().from('threads_media').upsert(rows, { onConflict: 'user_id,media_id' }))
}

/** Stores what a pull read now, hidden and answered included; read state is never overwritten. */
export async function saveThreadsReplies(userId: string, accountId: string, replies: readonly ThreadsReplyRow[]): Promise<void> {
  if (replies.length === 0) return
  const rows = replies.map((reply) => ({
    user_id: userId,
    account_id: accountId,
    reply_id: reply.replyId,
    media_id: reply.mediaId,
    replied_to_id: reply.repliedToId,
    parent_id: reply.parentId,
    username: reply.username,
    text: reply.text,
    created_at: reply.createdAt.toISOString(),
    is_hidden: reply.isHidden,
    is_from_owner: reply.isFromOwner,
    replied_at: reply.repliedAt?.toISOString() ?? null,
  }))
  unwrap(await db().from('threads_replies').upsert(rows, { onConflict: 'user_id,reply_id' }))
}

/**
 * Drops a post's replies its last full listing no longer had: deleted on Threads. Replies newer than the listing
 * (`before`) stay, like the owner's reply sent from the app meanwhile.
 */
export async function removeVanishedThreadsReplies(
  userId: string,
  mediaId: string,
  keptIds: readonly string[],
  before: Date,
): Promise<void> {
  let query = db()
    .from('threads_replies')
    .delete()
    .eq('user_id', userId)
    .eq('media_id', mediaId)
    .lt('created_at', before.toISOString())
  // Reply ids are digits only (threads.ts checks), so they are safe inside the filter.
  if (keptIds.length > 0) query = query.not('reply_id', 'in', `(${keptIds.join(',')})`)
  unwrap(await query)
}

/** The account's replies from `since` on, newest first, for the post list. */
export async function listRecentThreadsReplies(userId: string, accountId: string, since: Date): Promise<StoredThreadsReply[]> {
  const rows = unwrap(
    await db()
      .from('threads_replies')
      .select(COLUMNS)
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false })
      .limit(LIST_LIMIT),
  ) as ReplyRow[]
  return rows.map(toReply)
}

export async function listPostThreadsReplies(userId: string, accountId: string, mediaId: string): Promise<StoredThreadsReply[]> {
  const rows = unwrap(
    await db()
      .from('threads_replies')
      .select(COLUMNS)
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .eq('media_id', mediaId)
      .order('created_at', { ascending: false })
      .limit(POST_LIMIT),
  ) as ReplyRow[]
  return rows.map(toReply)
}

/** Null also for a reply under another account's post: replies go out from the connected account. */
export async function getThreadsReply(userId: string, accountId: string, replyId: string): Promise<StoredThreadsReply | null> {
  const row = unwrap(
    await db()
      .from('threads_replies')
      .select(COLUMNS)
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .eq('reply_id', replyId)
      .maybeSingle(),
  ) as ReplyRow | null
  return row && toReply(row)
}

/** A top-level reply and its branch, oldest first, for the AI's context. `topId` is a numeric reply id. */
export async function getThreadsBranch(userId: string, topId: string): Promise<StoredThreadsReply[]> {
  const rows = unwrap(
    await db()
      .from('threads_replies')
      .select(COLUMNS)
      .eq('user_id', userId)
      .or(`reply_id.eq.${topId},parent_id.eq.${topId}`)
      .order('created_at', { ascending: true })
      .limit(POST_LIMIT),
  ) as ReplyRow[]
  return rows.map(toReply)
}

/** Text, thumbnail and link of these posts; a post not stored is left out. */
export async function listThreadsPosts(userId: string, mediaIds: readonly string[]): Promise<Map<string, ThreadsPostView>> {
  if (mediaIds.length === 0) return new Map()
  const rows = unwrap(
    await db()
      .from('threads_media')
      .select('media_id, text, thumbnail_url, permalink')
      .eq('user_id', userId)
      .in('media_id', [...mediaIds]),
  ) as { media_id: string; text: string; thumbnail_url: string | null; permalink: string | null }[]
  return new Map(
    rows.map((row) => [
      row.media_id,
      { mediaId: row.media_id, caption: row.text, thumbnailUrl: row.thumbnail_url, permalink: row.permalink },
    ]),
  )
}

/** Opening a post's replies reads them all. */
export async function markThreadsPostSeen(userId: string, accountId: string, mediaId: string): Promise<void> {
  unwrap(
    await db()
      .from('threads_replies')
      .update({ seen_at: nowIso() })
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .eq('media_id', mediaId)
      .is('seen_at', null)
      .eq('is_from_owner', false),
  )
}

export async function setThreadsReplyHiddenRow(userId: string, replyId: string, hidden: boolean): Promise<void> {
  unwrap(await db().from('threads_replies').update({ is_hidden: hidden }).eq('user_id', userId).eq('reply_id', replyId))
}

/**
 * The account's reply, just sent: stored at once, and the replies of its branch up to now count as answered. A later
 * pull reads both from Threads again.
 */
export async function recordOwnThreadsReply(
  userId: string,
  accountId: string,
  reply: { id: string; mediaId: string; repliedToId: string; topId: string; text: string; username: string },
): Promise<void> {
  const now = nowIso()
  unwrap(
    await db().from('threads_replies').upsert(
      {
        user_id: userId,
        account_id: accountId,
        reply_id: reply.id,
        media_id: reply.mediaId,
        replied_to_id: reply.repliedToId,
        parent_id: reply.topId,
        username: reply.username,
        text: reply.text,
        created_at: now,
        is_from_owner: true,
      },
      { onConflict: 'user_id,reply_id', ignoreDuplicates: true },
    ),
  )
  unwrap(
    await db()
      .from('threads_replies')
      .update({ replied_at: now })
      .eq('user_id', userId)
      .eq('is_from_owner', false)
      .is('replied_at', null)
      .lte('created_at', now)
      // Reply ids are digits only, safe inside the filter.
      .or(`reply_id.eq.${reply.topId},parent_id.eq.${reply.topId}`),
  )
}
