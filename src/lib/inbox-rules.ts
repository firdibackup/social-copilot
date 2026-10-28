/** Read, reply and notification rules for Balasan's DMs and comments. Pure, so the browser and tests share them. */

/** Instagram's limit for a text DM, including private replies to comments. */
export const REPLY_MAX_LENGTH = 1000
/** Instagram's limit for a comment, the same as a caption's. A private reply is a DM: REPLY_MAX_LENGTH. */
export const COMMENT_MAX_LENGTH = 2200
/** The Komentar tab pulls and lists comments from posts of this many days. */
export const COMMENT_DAYS = 30
/** Items in the bell's dropdown. */
export const NOTIFICATION_LIMIT = 10

const DAY_MS = 24 * 60 * 60 * 1000
/** Meta accepts a private reply until 7 days after the comment. */
const PRIVATE_REPLY_WINDOW_MS = 7 * DAY_MS
/** Profile pictures are signed CDN links that expire, so a profile older than this is read again. */
const PROFILE_MAX_AGE_MS = 3 * DAY_MS

export interface ConversationReadState {
  lastFromCustomer: boolean
  lastIncomingAt: Date | null
  seenAt: Date | null
}

/** The customer wrote last, and the owner hasn't opened the conversation since. */
export function isConversationUnread(conversation: ConversationReadState): boolean {
  const { lastFromCustomer, lastIncomingAt, seenAt } = conversation
  return lastFromCustomer && lastIncomingAt !== null && (seenAt === null || seenAt < lastIncomingAt)
}

export const isProfileStale = (fetchedAt: Date | null, now: Date) =>
  fetchedAt === null || now.getTime() - fetchedAt.getTime() > PROFILE_MAX_AGE_MS

export interface CommentState {
  isFromOwner: boolean
  isHidden: boolean
  repliedAt: Date | null
  dmSentAt: Date | null
  seenAt: Date | null
  createdAt: Date
}

/** Someone else's visible comment the owner hasn't answered, publicly or by DM. */
export const isCommentUnanswered = (comment: CommentState) =>
  !comment.isFromOwner && !comment.isHidden && comment.repliedAt === null && comment.dmSentAt === null

/** Waiting and not yet seen: what the bell counts. */
export const isCommentUnread = (comment: CommentState) => isCommentUnanswered(comment) && comment.seenAt === null

/** Meta takes one private reply per comment, within 7 days of it. */
export const canPrivateReply = (comment: CommentState, now: Date) =>
  !comment.isFromOwner && comment.dmSentAt === null && now.getTime() - comment.createdAt.getTime() < PRIVATE_REPLY_WINDOW_MS

/**
 * The connected account's own comment. Webhooks and Graph give its Instagram id as `from.id`; the username covers
 * a payload where they don't.
 */
export const isOwnComment = (
  comment: { fromId: string | null; username: string | null },
  accountId: string,
  ownerUsername: string | null,
) => comment.fromId === accountId || (ownerUsername !== null && comment.username === ownerUsername)

export const conversationName = (conversation: { name: string | null; username: string | null }) =>
  conversation.name ?? (conversation.username ? `@${conversation.username}` : 'Pengguna Instagram')

export const commenterName = (comment: { username: string | null }) =>
  comment.username ? `@${comment.username}` : 'Pengguna Instagram'

export interface ThreadedComment<T> {
  comment: T
  replies: T[]
}

/**
 * Top-level comments newest first, each with its replies oldest first, as Instagram shows them. A reply whose
 * top-level comment isn't stored stands on its own.
 */
export function threadComments<T extends { commentId: string; parentId: string | null; createdAt: Date }>(
  comments: readonly T[],
): ThreadedComment<T>[] {
  const ids = new Set(comments.map((comment) => comment.commentId))
  const isTopLevel = (comment: T) => comment.parentId === null || !ids.has(comment.parentId)
  const byTime = (a: T, b: T) => a.createdAt.getTime() - b.createdAt.getTime()
  return comments
    .filter(isTopLevel)
    .sort((a, b) => byTime(b, a))
    .map((comment) => ({
      comment,
      replies: comments.filter((reply) => !isTopLevel(reply) && reply.parentId === comment.commentId).sort(byTime),
    }))
}

export interface PostCommentSummary {
  mediaId: string
  total: number
  unanswered: number
  unread: number
  lastCommentAt: Date
}

/** Per post, the comments others wrote, newest commented post first. The owner's own replies aren't counted. */
export function summarizePosts<T extends CommentState & { mediaId: string }>(comments: readonly T[]): PostCommentSummary[] {
  const posts = new Map<string, PostCommentSummary>()
  for (const comment of comments) {
    if (comment.isFromOwner) continue
    const post = posts.get(comment.mediaId) ?? {
      mediaId: comment.mediaId,
      total: 0,
      unanswered: 0,
      unread: 0,
      lastCommentAt: comment.createdAt,
    }
    posts.set(comment.mediaId, {
      ...post,
      total: post.total + 1,
      unanswered: post.unanswered + (isCommentUnanswered(comment) ? 1 : 0),
      unread: post.unread + (isCommentUnread(comment) ? 1 : 0),
      lastCommentAt: comment.createdAt > post.lastCommentAt ? comment.createdAt : post.lastCommentAt,
    })
  }
  return [...posts.values()].sort((a, b) => b.lastCommentAt.getTime() - a.lastCommentAt.getTime())
}

/** One line of the bell's dropdown. Sent as JSON, so the time is an ISO string. */
export interface Notification {
  kind: 'dm' | 'comment'
  key: string
  id: string
  href: string
  name: string
  text: string
  /** A signed CDN link for DMs; comments carry no picture. */
  avatarUrl: string | null
  at: string
  unread: boolean
}

export type NotificationFeedStatus = 'active' | 'instagram_required' | 'subscription_required'

export interface NotificationFeed {
  status: NotificationFeedStatus
  count: number
  items: Notification[]
}

export interface ConversationNotice extends ConversationReadState {
  igsid: string
  name: string | null
  username: string | null
  profilePicUrl: string | null
  lastText: string | null
}

export interface CommentNotice extends CommentState {
  commentId: string
  mediaId: string
  username: string | null
  text: string
}

export const dmHref = (igsid: string) => `/balasan?c=${encodeURIComponent(igsid)}`
export const postCommentsHref = (mediaId: string) => `/balasan?tab=komentar&post=${encodeURIComponent(mediaId)}`

/** Recent actionable DMs and comments, counted by unread state, with the newest `limit` as dropdown items. */
export function summarizeNotifications(
  conversations: readonly ConversationNotice[],
  comments: readonly CommentNotice[],
  limit = NOTIFICATION_LIMIT,
): Pick<NotificationFeed, 'count' | 'items'> {
  const dms = conversations
    .filter((conversation) => conversation.lastFromCustomer && conversation.lastIncomingAt !== null)
    .map(
      (conversation): Notification => ({
        kind: 'dm',
        key: `dm:${conversation.igsid}`,
        id: conversation.igsid,
        href: dmHref(conversation.igsid),
        name: conversationName(conversation),
        text: conversation.lastText ?? '(lampiran)',
        avatarUrl: conversation.profilePicUrl,
        at: (conversation.lastIncomingAt as Date).toISOString(),
        unread: isConversationUnread(conversation),
      }),
    )
  const commentItems = comments.filter(isCommentUnanswered).map(
    (comment): Notification => ({
      kind: 'comment',
      key: `comment:${comment.commentId}`,
      id: comment.commentId,
      href: postCommentsHref(comment.mediaId),
      name: commenterName(comment),
      text: comment.text,
      avatarUrl: null,
      at: comment.createdAt.toISOString(),
      unread: isCommentUnread(comment),
    }),
  )
  const items = [...dms, ...commentItems].sort((a, b) => b.at.localeCompare(a.at))
  return { count: items.filter((item) => item.unread).length, items: items.slice(0, limit) }
}
