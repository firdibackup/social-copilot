/**
 * Replies under the account's Threads posts, as the Komentar tab stores them. Threads nests replies at any depth;
 * the tab shows one level like Instagram, so each reply hangs under the top-level reply of its branch. Pure, so the
 * pull and the tests share it.
 */

/** A reply as Threads lists it in a post's conversation. */
export interface ConversationReply {
  id: string
  text: string
  username: string | null
  createdAt: Date
  isHidden: boolean
  /** Threads says the connected account wrote it. */
  isOwn: boolean
  /** The post or the reply it answers. */
  repliedToId: string
}

/** A row of threads_replies. */
export interface ThreadsReplyRow {
  replyId: string
  mediaId: string
  repliedToId: string
  /** The top-level reply of its branch; null for a top-level reply. */
  parentId: string | null
  username: string | null
  text: string
  createdAt: Date
  isHidden: boolean
  isFromOwner: boolean
  /** When the owner first replied in the branch after it; null for the owner's own replies. */
  repliedAt: Date | null
}

/** Deeper than this is a loop in bad data, not a real branch. */
const MAX_DEPTH = 100

/**
 * Hangs every reply under the top-level reply of its branch and marks the ones the owner answered: a reply counts as
 * answered once the owner replied in the same branch at or after it, as Instagram's comments do.
 */
export function toReplyRows(mediaId: string, replies: readonly ConversationReply[], ownerUsername: string | null): ThreadsReplyRow[] {
  const byId = new Map(replies.map((reply) => [reply.id, reply]))
  const topOf = (reply: ConversationReply): string => {
    let current = reply
    for (let depth = 0; depth < MAX_DEPTH; depth++) {
      const parent = byId.get(current.repliedToId)
      if (!parent || current.repliedToId === mediaId) return current.id
      current = parent
    }
    return current.id
  }
  const isOwner = (reply: ConversationReply) =>
    reply.isOwn || (ownerUsername !== null && reply.username !== null && reply.username === ownerUsername)

  const tops = new Map(replies.map((reply) => [reply.id, topOf(reply)]))
  const ownerTimes = new Map<string, number[]>()
  for (const reply of replies) {
    if (!isOwner(reply)) continue
    const top = tops.get(reply.id)!
    ownerTimes.set(top, [...(ownerTimes.get(top) ?? []), reply.createdAt.getTime()])
  }

  return replies.map((reply) => {
    const top = tops.get(reply.id)!
    const fromOwner = isOwner(reply)
    const answers = fromOwner ? [] : (ownerTimes.get(top) ?? []).filter((time) => time >= reply.createdAt.getTime())
    return {
      replyId: reply.id,
      mediaId,
      repliedToId: reply.repliedToId,
      parentId: top === reply.id ? null : top,
      username: reply.username,
      text: reply.text,
      createdAt: reply.createdAt,
      isHidden: reply.isHidden,
      isFromOwner: fromOwner,
      repliedAt: answers.length > 0 ? new Date(Math.min(...answers)) : null,
    }
  })
}
