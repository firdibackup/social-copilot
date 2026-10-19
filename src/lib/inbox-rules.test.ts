import { describe, expect, it } from 'vitest'
import {
  canPrivateReply,
  commenterName,
  conversationName,
  isCommentUnanswered,
  isCommentUnread,
  isConversationUnread,
  isOwnComment,
  isProfileStale,
  summarizeNotifications,
  summarizePosts,
  threadComments,
  type CommentNotice,
  type CommentState,
  type ConversationNotice,
} from './inbox-rules'

const NOW = new Date('2026-10-19T05:00:00Z')
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const ago = (ms: number) => new Date(NOW.getTime() - ms)

const comment = (fields: Partial<CommentState> = {}): CommentState => ({
  isFromOwner: false,
  isHidden: false,
  repliedAt: null,
  dmSentAt: null,
  seenAt: null,
  createdAt: ago(HOUR),
  ...fields,
})

describe('isConversationUnread', () => {
  it('is unread when the customer wrote last and it was never opened', () => {
    expect(isConversationUnread({ lastFromCustomer: true, lastIncomingAt: ago(HOUR), seenAt: null })).toBe(true)
  })

  it('is unread again when the customer wrote after it was opened', () => {
    expect(isConversationUnread({ lastFromCustomer: true, lastIncomingAt: ago(HOUR), seenAt: ago(2 * HOUR) })).toBe(true)
  })

  it('is read once opened after the last message, or when the owner wrote last', () => {
    expect(isConversationUnread({ lastFromCustomer: true, lastIncomingAt: ago(2 * HOUR), seenAt: ago(HOUR) })).toBe(false)
    expect(isConversationUnread({ lastFromCustomer: false, lastIncomingAt: ago(HOUR), seenAt: null })).toBe(false)
    expect(isConversationUnread({ lastFromCustomer: true, lastIncomingAt: null, seenAt: null })).toBe(false)
  })
})

describe('isProfileStale', () => {
  it('reads a profile again after 3 days, or when it was never read', () => {
    expect(isProfileStale(null, NOW)).toBe(true)
    expect(isProfileStale(ago(3 * DAY + 1), NOW)).toBe(true)
    expect(isProfileStale(ago(2 * DAY), NOW)).toBe(false)
  })
})

describe('comment rules', () => {
  it('waits for a reply until the owner answers publicly or by DM', () => {
    expect(isCommentUnanswered(comment())).toBe(true)
    expect(isCommentUnanswered(comment({ repliedAt: NOW }))).toBe(false)
    expect(isCommentUnanswered(comment({ dmSentAt: NOW }))).toBe(false)
  })

  it('never counts hidden comments or the owner’s own', () => {
    expect(isCommentUnanswered(comment({ isHidden: true }))).toBe(false)
    expect(isCommentUnanswered(comment({ isFromOwner: true }))).toBe(false)
    expect(isCommentUnread(comment({ isFromOwner: true }))).toBe(false)
  })

  it('is unread while waiting and not yet seen', () => {
    expect(isCommentUnread(comment())).toBe(true)
    expect(isCommentUnread(comment({ seenAt: NOW }))).toBe(false)
    expect(isCommentUnread(comment({ repliedAt: NOW }))).toBe(false)
  })
})

describe('canPrivateReply', () => {
  it('allows one DM within 7 days of the comment', () => {
    expect(canPrivateReply(comment({ createdAt: ago(7 * DAY - 1000) }), NOW)).toBe(true)
    expect(canPrivateReply(comment({ createdAt: ago(7 * DAY) }), NOW)).toBe(false)
    expect(canPrivateReply(comment({ createdAt: ago(8 * DAY) }), NOW)).toBe(false)
  })

  it('refuses a second DM and the owner’s own comments', () => {
    expect(canPrivateReply(comment({ dmSentAt: ago(HOUR) }), NOW)).toBe(false)
    expect(canPrivateReply(comment({ isFromOwner: true }), NOW)).toBe(false)
  })
})

describe('isOwnComment', () => {
  it('matches the account id, else the username', () => {
    expect(isOwnComment({ fromId: '1784', username: null }, '1784', null)).toBe(true)
    expect(isOwnComment({ fromId: null, username: 'tokosaya' }, '1784', 'tokosaya')).toBe(true)
    expect(isOwnComment({ fromId: '9012', username: 'budi' }, '1784', 'tokosaya')).toBe(false)
    expect(isOwnComment({ fromId: null, username: null }, '1784', null)).toBe(false)
  })
})

describe('names', () => {
  it('prefers the name, then @username', () => {
    expect(conversationName({ name: 'Budi', username: 'budi' })).toBe('Budi')
    expect(conversationName({ name: null, username: 'budi' })).toBe('@budi')
    expect(conversationName({ name: null, username: null })).toBe('Pengguna Instagram')
    expect(commenterName({ username: 'sari' })).toBe('@sari')
    expect(commenterName({ username: null })).toBe('Pengguna Instagram')
  })
})

describe('threadComments', () => {
  const row = (commentId: string, parentId: string | null, hoursAgo: number) => ({
    commentId,
    parentId,
    createdAt: ago(hoursAgo * HOUR),
  })

  it('puts top-level comments newest first, replies oldest first under them', () => {
    const threads = threadComments([row('a', null, 5), row('b', null, 1), row('a2', 'a', 2), row('a1', 'a', 4)])
    expect(threads.map(({ comment, replies }) => [comment.commentId, replies.map((reply) => reply.commentId)])).toEqual([
      ['b', []],
      ['a', ['a1', 'a2']],
    ])
  })

  it('lets a reply whose comment isn’t stored stand on its own', () => {
    expect(threadComments([row('r', 'missing', 1)]).map(({ comment }) => comment.commentId)).toEqual(['r'])
  })
})

describe('summarizePosts', () => {
  it('counts others’ comments per post, newest commented post first', () => {
    const summaries = summarizePosts([
      { ...comment({ createdAt: ago(5 * HOUR) }), mediaId: 'p1' },
      { ...comment({ createdAt: ago(3 * HOUR), repliedAt: NOW, seenAt: NOW }), mediaId: 'p1' },
      { ...comment({ createdAt: ago(HOUR), isFromOwner: true }), mediaId: 'p1' },
      { ...comment({ createdAt: ago(2 * HOUR), seenAt: NOW }), mediaId: 'p2' },
    ])
    expect(summaries).toEqual([
      { mediaId: 'p2', total: 1, unanswered: 1, unread: 0, lastCommentAt: ago(2 * HOUR) },
      { mediaId: 'p1', total: 2, unanswered: 1, unread: 1, lastCommentAt: ago(3 * HOUR) },
    ])
  })
})

describe('summarizeNotifications', () => {
  const dm = (igsid: string, hoursAgo: number, fields: Partial<ConversationNotice> = {}): ConversationNotice => ({
    igsid,
    name: null,
    username: igsid,
    profilePicUrl: null,
    lastText: 'halo',
    lastFromCustomer: true,
    lastIncomingAt: ago(hoursAgo * HOUR),
    seenAt: null,
    ...fields,
  })
  const notice = (commentId: string, hoursAgo: number, fields: Partial<CommentState> = {}): CommentNotice => ({
    ...comment({ createdAt: ago(hoursAgo * HOUR), ...fields }),
    commentId,
    mediaId: 'p1',
    username: 'sari',
    text: 'mau dong',
  })

  it('merges recent DMs and comments, newest first, linked to their thread', () => {
    const feed = summarizeNotifications([dm('budi', 3, { profilePicUrl: 'https://cdn/b.jpg' })], [notice('c1', 1)])
    expect(feed).toEqual({
      count: 2,
      items: [
        {
          kind: 'comment',
          key: 'comment:c1',
          id: 'c1',
          href: '/balasan?tab=komentar&post=p1',
          name: '@sari',
          text: 'mau dong',
          avatarUrl: null,
          at: ago(HOUR).toISOString(),
          unread: true,
        },
        {
          kind: 'dm',
          key: 'dm:budi',
          id: 'budi',
          href: '/balasan?c=budi',
          name: '@budi',
          text: 'halo',
          avatarUrl: 'https://cdn/b.jpg',
          at: ago(3 * HOUR).toISOString(),
          unread: true,
        },
      ],
    })
  })

  it('keeps read items, counts only unread ones, and leaves out answered or owner items', () => {
    const feed = summarizeNotifications(
      [dm('a', 1, { seenAt: NOW }), dm('b', 1, { lastFromCustomer: false })],
      [notice('c1', 2, { seenAt: NOW }), notice('c2', 1, { repliedAt: NOW }), notice('c3', 1, { isFromOwner: true })],
    )
    expect(feed.count).toBe(0)
    expect(feed.items.map(({ key, unread }) => ({ key, unread }))).toEqual([
      { key: 'dm:a', unread: false },
      { key: 'comment:c1', unread: false },
    ])
  })

  it('counts everything but lists only the newest few', () => {
    const feed = summarizeNotifications(
      [dm('a', 4), dm('b', 2)],
      [notice('c1', 3), notice('c2', 1)],
      3,
    )
    expect(feed.count).toBe(4)
    expect(feed.items.map((item) => item.key)).toEqual(['comment:c2', 'dm:b', 'comment:c1'])
  })

  it('shows an attachment-only DM as (lampiran)', () => {
    expect(summarizeNotifications([dm('a', 1, { lastText: null })], []).items[0].text).toBe('(lampiran)')
  })
})
