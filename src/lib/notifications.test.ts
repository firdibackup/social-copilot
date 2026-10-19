import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getCurrentPeriod } from './billing'
import { listNotificationComments, markAllCommentsSeen, setCommentReadState } from './comments'
import { getConnectedAccountId } from './connection'
import {
  listNotificationConversations,
  markAllConversationsSeen,
  setConversationReadState,
  type Conversation,
} from './dm'
import { getNotificationFeed, markAllNotificationsSeen, setNotificationReadState } from './notifications'

vi.mock('./billing', () => ({ getCurrentPeriod: vi.fn() }))
vi.mock('./comments', () => ({
  listNotificationComments: vi.fn(),
  markAllCommentsSeen: vi.fn(),
  setCommentReadState: vi.fn(),
}))
vi.mock('./connection', () => ({ getConnectedAccountId: vi.fn() }))
vi.mock('./dm', () => ({
  listNotificationConversations: vi.fn(),
  markAllConversationsSeen: vi.fn(),
  setConversationReadState: vi.fn(),
}))

const USER = 'user-1'
const ACCOUNT = 'ig-1'
const AT = new Date('2026-10-19T05:00:00Z')

const conversation: Conversation = {
  igsid: '9012',
  username: 'budi',
  name: null,
  lastText: 'halo',
  lastFromCustomer: true,
  lastMessageAt: AT,
  lastIncomingAt: AT,
  seenAt: null,
  profilePicUrl: null,
  profileFetchedAt: AT,
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getConnectedAccountId).mockResolvedValue(ACCOUNT)
  vi.mocked(getCurrentPeriod).mockResolvedValue({ start: AT, end: AT, activeUntil: AT } as never)
  vi.mocked(listNotificationConversations).mockResolvedValue([conversation])
  vi.mocked(listNotificationComments).mockResolvedValue([])
})

describe('getNotificationFeed', () => {
  it('lists recent notifications and counts the connected account’s unread items', async () => {
    const feed = await getNotificationFeed(USER)
    expect(feed).toMatchObject({
      status: 'active',
      count: 1,
      items: [{ kind: 'dm', id: '9012', href: '/balasan?c=9012', unread: true }],
    })
    expect(listNotificationConversations).toHaveBeenCalledWith(USER, ACCOUNT)
    expect(listNotificationComments).toHaveBeenCalledWith(USER, ACCOUNT)
  })

  it('explains when Instagram is not connected', async () => {
    vi.mocked(getConnectedAccountId).mockResolvedValue(null)
    expect(await getNotificationFeed(USER)).toEqual({ status: 'instagram_required', count: 0, items: [] })
    expect(listNotificationConversations).not.toHaveBeenCalled()
  })

  it('explains when the subscription is not active', async () => {
    vi.mocked(getCurrentPeriod).mockResolvedValue(null)
    expect(await getNotificationFeed(USER)).toEqual({ status: 'subscription_required', count: 0, items: [] })
    expect(listNotificationConversations).not.toHaveBeenCalled()
  })
})

describe('setNotificationReadState', () => {
  it('updates a DM read state inside the connected account', async () => {
    await setNotificationReadState(USER, 'dm', '9012', false)
    expect(setConversationReadState).toHaveBeenCalledWith(USER, ACCOUNT, '9012', false)
    expect(setCommentReadState).not.toHaveBeenCalled()
  })

  it('updates a comment read state inside the connected account', async () => {
    await setNotificationReadState(USER, 'comment', '5678', true)
    expect(setCommentReadState).toHaveBeenCalledWith(USER, ACCOUNT, '5678', true)
    expect(setConversationReadState).not.toHaveBeenCalled()
  })
})

describe('markAllNotificationsSeen', () => {
  it('marks the connected account’s DMs and comments', async () => {
    await markAllNotificationsSeen(USER)
    expect(markAllConversationsSeen).toHaveBeenCalledWith(USER, ACCOUNT)
    expect(markAllCommentsSeen).toHaveBeenCalledWith(USER, ACCOUNT)
  })

  it('does nothing without a connected account', async () => {
    vi.mocked(getConnectedAccountId).mockResolvedValue(null)
    await markAllNotificationsSeen(USER)
    expect(markAllConversationsSeen).not.toHaveBeenCalled()
  })
})
