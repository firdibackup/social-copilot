import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPublishingAccount, markNeedsReconnect, NeedsReconnectError } from '@/lib/connection'
import { getConversation, recordMessage, type Conversation } from '@/lib/dm'
import { InstagramApiError, sendDirectMessage } from '@/lib/instagram'
import { sendReply } from './actions'

vi.mock('next/cache', () => ({ refresh: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requireAccount: vi.fn(async () => ({ userId: 'user-1', accountId: 'ig-1' })) }))
vi.mock('@/lib/connection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/connection')>()),
  getPublishingAccount: vi.fn(),
  getValidAccessToken: vi.fn(),
  markNeedsReconnect: vi.fn(),
}))
vi.mock('@/lib/dm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/dm')>()),
  getConversation: vi.fn(),
  recordMessage: vi.fn(),
}))
vi.mock('@/lib/instagram', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/instagram')>()),
  sendDirectMessage: vi.fn(),
}))

const NOW = new Date('2026-10-16T05:00:00Z')
const CUSTOMER = '901234567890'

const conversation = (lastIncomingAt: Date | null): Conversation => ({
  igsid: CUSTOMER,
  username: 'budi',
  name: 'Budi',
  lastText: 'ada promo?',
  lastFromCustomer: true,
  lastMessageAt: NOW,
  lastIncomingAt,
  seenAt: null,
  profilePicUrl: null,
  profileFetchedAt: NOW,
})

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
  vi.mocked(getConversation).mockResolvedValue(conversation(new Date('2026-10-16T01:00:00Z')))
  vi.mocked(getPublishingAccount).mockResolvedValue({ accessToken: 'token', instagramUserId: '1784', username: 'toko' })
  vi.mocked(sendDirectMessage).mockResolvedValue('mid-out')
  vi.mocked(recordMessage).mockResolvedValue(true)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('sendReply', () => {
  it('sends the trimmed reply and stores it as the account’s message', async () => {
    await expect(sendReply(CUSTOMER, '  Halo Budi!  ')).resolves.toBeNull()

    expect(sendDirectMessage).toHaveBeenCalledWith('token', '1784', CUSTOMER, 'Halo Budi!')
    expect(recordMessage).toHaveBeenCalledWith('user-1', {
      mid: 'mid-out',
      igsid: CUSTOMER,
      fromCustomer: false,
      text: 'Halo Budi!',
      sentAt: NOW,
    })
  })

  it('refuses after the 24-hour window without calling Instagram', async () => {
    vi.mocked(getConversation).mockResolvedValue(conversation(new Date('2026-10-15T05:00:00Z')))

    await expect(sendReply(CUSTOMER, 'Halo')).resolves.toContain('24 jam')
    expect(sendDirectMessage).not.toHaveBeenCalled()
  })

  it('refuses a conversation that never had a customer message', async () => {
    vi.mocked(getConversation).mockResolvedValue(conversation(null))

    await expect(sendReply(CUSTOMER, 'Halo')).resolves.toContain('24 jam')
  })

  it('rejects an empty reply and an unknown conversation', async () => {
    await expect(sendReply(CUSTOMER, '   ')).resolves.toBe('Tulis balasan dulu.')
    await expect(sendReply(42, 'Halo')).resolves.toBe('Percakapan tidak ditemukan.')
    vi.mocked(getConversation).mockResolvedValue(null)
    await expect(sendReply(CUSTOMER, 'Halo')).resolves.toBe('Percakapan tidak ditemukan.')
    expect(sendDirectMessage).not.toHaveBeenCalled()
  })

  it('replies only in conversations of the connected account', async () => {
    vi.mocked(getConversation).mockResolvedValue(null)

    await expect(sendReply(CUSTOMER, 'Halo')).resolves.toBe('Percakapan tidak ditemukan.')
    expect(getConversation).toHaveBeenCalledWith('user-1', 'ig-1', CUSTOMER)
    expect(sendDirectMessage).not.toHaveBeenCalled()
  })

  it('marks the connection for reconnecting when Instagram rejects the token', async () => {
    vi.mocked(sendDirectMessage).mockRejectedValue(new InstagramApiError('Invalid token', 190, 400))

    await expect(sendReply(CUSTOMER, 'Halo')).resolves.toContain('Hubungkan ulang')
    expect(markNeedsReconnect).toHaveBeenCalledWith('user-1')
  })

  it('asks for a reconnect when the stored token is already unusable', async () => {
    vi.mocked(getPublishingAccount).mockRejectedValue(new NeedsReconnectError('expired'))

    await expect(sendReply(CUSTOMER, 'Halo')).resolves.toContain('Hubungkan ulang')
  })

  it('shows other Instagram rejections to the owner', async () => {
    vi.mocked(sendDirectMessage).mockRejectedValue(new InstagramApiError('User not found', 100, 400))

    await expect(sendReply(CUSTOMER, 'Halo')).resolves.toBe('Instagram menolak: User not found')
  })

  it('reports success when the DM went out but could not be stored', async () => {
    vi.mocked(recordMessage).mockRejectedValue(new Error('Supabase: down'))

    await expect(sendReply(CUSTOMER, 'Halo')).resolves.toBeNull()
  })
})

vi.mock('next-intl/server', async () => {
  const { createTranslator } = await import('next-intl')
  const { default: inbox } = await import('../../../../../messages/id/inbox.json')
  return {
    getTranslations: async (namespace: string) => {
      const section = namespace.replace('inbox.', '') as keyof typeof inbox
      return createTranslator({ locale: 'id', messages: inbox[section] })
    },
    getLocale: async () => 'id',
  }
})
