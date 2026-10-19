import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  claimWebhookSubscription,
  getValidAccessToken,
  markWebhooksSubscribed,
} from './connection'
import { markProfileTried, saveProfile, type Conversation } from './dm'
import { ensureWebhookSubscription, newMessages, profilesToRead, readProfiles } from './inbox-sync'
import { fetchCustomerProfile, subscribeToWebhooks } from './instagram'

vi.mock('./connection', () => ({
  claimWebhookSubscription: vi.fn(),
  getValidAccessToken: vi.fn(),
  markNeedsReconnect: vi.fn(),
  markWebhooksSubscribed: vi.fn(),
  NeedsReconnectError: class NeedsReconnectError extends Error {},
}))
vi.mock('./dm', () => ({ markProfileTried: vi.fn(), saveProfile: vi.fn() }))
vi.mock('./instagram', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./instagram')>()),
  fetchCustomerProfile: vi.fn(),
  subscribeToWebhooks: vi.fn(),
}))

const NOW = new Date('2026-10-19T12:00:00Z')
const DAY = 24 * 60 * 60 * 1000
const SCOPES = ['instagram_business_basic', 'instagram_business_manage_messages']

const conversation = (igsid: string, profileFetchedAt: Date | null): Conversation => ({
  igsid,
  username: null,
  name: null,
  lastText: 'halo',
  lastFromCustomer: true,
  lastMessageAt: NOW,
  lastIncomingAt: NOW,
  seenAt: null,
  profilePicUrl: null,
  profileFetchedAt,
})

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(claimWebhookSubscription).mockResolvedValue(SCOPES)
  vi.mocked(getValidAccessToken).mockResolvedValue('token')
  vi.mocked(saveProfile).mockResolvedValue()
  vi.mocked(markProfileTried).mockResolvedValue()
  vi.mocked(markWebhooksSubscribed).mockResolvedValue()
  vi.mocked(subscribeToWebhooks).mockResolvedValue()
})

describe('ensureWebhookSubscription', () => {
  it('subscribes once a connection claims the work', async () => {
    await ensureWebhookSubscription('user-1')

    expect(subscribeToWebhooks).toHaveBeenCalledWith('token', SCOPES)
    expect(markWebhooksSubscribed).toHaveBeenCalledWith('user-1')
  })

  it('does nothing once another request or a completed subscription owns it', async () => {
    vi.mocked(claimWebhookSubscription).mockResolvedValue(null)

    await ensureWebhookSubscription('user-1')

    expect(subscribeToWebhooks).not.toHaveBeenCalled()
  })
})

describe('profilesToRead', () => {
  it('takes missing and stale profiles, at most twelve', () => {
    const fresh = conversation('fresh', new Date(NOW.getTime() - DAY))
    const stale = Array.from({ length: 14 }, (_, index) => conversation(`stale-${index}`, null))

    expect(profilesToRead([fresh, ...stale], NOW).map(({ igsid }) => igsid)).toEqual(
      stale.slice(0, 12).map(({ igsid }) => igsid),
    )
  })
})

describe('readProfiles', () => {
  it('stores and returns profiles so the inbox can show them immediately', async () => {
    vi.mocked(fetchCustomerProfile).mockResolvedValue({
      username: 'budi',
      name: 'Budi',
      profilePicUrl: 'https://cdn/budi.jpg',
    })
    const item = conversation('9012', null)

    const [updated] = await readProfiles('user-1', [item])

    expect(fetchCustomerProfile).toHaveBeenCalledWith('token', '9012')
    expect(saveProfile).toHaveBeenCalledWith('user-1', '9012', {
      username: 'budi',
      name: 'Budi',
      profilePicUrl: 'https://cdn/budi.jpg',
    })
    expect(updated).toMatchObject({ username: 'budi', name: 'Budi', profilePicUrl: 'https://cdn/budi.jpg' })
  })

  it('continues after one profile fails and spaces out its next try', async () => {
    vi.mocked(fetchCustomerProfile)
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce({ username: 'sari', name: 'Sari', profilePicUrl: null })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const updated = await readProfiles('user-1', [conversation('bad', null), conversation('good', null)])

    expect(markProfileTried).toHaveBeenCalledWith('user-1', 'bad')
    expect(updated).toHaveLength(1)
    expect(updated[0].username).toBe('sari')
  })
})

describe('newMessages', () => {
  const message = (mid: string, sentAt: string) => ({ mid, igsid: 'c', fromCustomer: true, text: mid, sentAt: new Date(sentAt) })

  it('keeps the messages not stored yet, older gaps included, oldest first', () => {
    const remote = [
      { igsid: 'a', updatedAt: new Date('2026-10-16T08:10:26Z'), messages: [message('a2', '2026-10-16T08:10:26Z'), message('a1', '2026-10-16T07:08:00Z')] },
      { igsid: 'b', updatedAt: new Date('2026-10-03T15:05:33Z'), messages: [message('b1', '2026-10-03T15:05:33Z')] },
    ]

    expect(newMessages(remote, new Set(['a2'])).map((item) => item.mid)).toEqual(['b1', 'a1'])
  })
})
