import { beforeEach, describe, expect, it, vi } from 'vitest'
import { claimOrphanRows, disconnectInstagram, draftScheduledPosts, shouldRefreshToken } from './connection'
import { db } from './supabase'

vi.mock('./supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./supabase')>()),
  db: vi.fn(),
}))

const NOW = new Date('2026-10-14T00:00:00Z')
const HOUR_MS = 60 * 60 * 1000
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * HOUR_MS)
const daysFromNow = (days: number) => new Date(NOW.getTime() + days * 24 * HOUR_MS)

describe('shouldRefreshToken', () => {
  it('keeps a token refreshed less than 24 hours ago', () => {
    expect(shouldRefreshToken(hoursAgo(23), daysFromNow(3), NOW)).toBe(false)
  })

  it('refreshes a token older than 24 hours that expires within 7 days', () => {
    expect(shouldRefreshToken(hoursAgo(25), daysFromNow(6), NOW)).toBe(true)
  })

  it('keeps a token with more than 7 days left', () => {
    expect(shouldRefreshToken(hoursAgo(48), daysFromNow(30), NOW)).toBe(false)
  })
})

describe('disconnectInstagram', () => {
  const rpc = vi.fn()
  beforeEach(() => {
    rpc.mockReset()
    vi.mocked(db).mockReturnValue({ rpc } as never)
  })

  it('returns how many scheduled posts became drafts', async () => {
    rpc.mockResolvedValue({ data: 2, error: null })

    await expect(disconnectInstagram('user-1')).resolves.toBe(2)
    expect(rpc).toHaveBeenCalledWith('disconnect_instagram', { p_user_id: 'user-1' })
  })

  it('throws when the database refuses', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })

    await expect(disconnectInstagram('user-1')).rejects.toThrow('boom')
  })
})

describe('claimOrphanRows', () => {
  it('hands the rows without an account to the connected one', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null })
    vi.mocked(db).mockReturnValue({ rpc } as never)

    await claimOrphanRows('user-1', 'ig-1')
    expect(rpc).toHaveBeenCalledWith('claim_orphan_rows', { p_user_id: 'user-1', p_account_id: 'ig-1' })
  })
})

describe('draftScheduledPosts', () => {
  it('returns how many posts of the account became drafts', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 3, error: null })
    vi.mocked(db).mockReturnValue({ rpc } as never)

    await expect(draftScheduledPosts('user-1', 'ig-old')).resolves.toBe(3)
    expect(rpc).toHaveBeenCalledWith('draft_scheduled_posts', { p_user_id: 'user-1', p_account_id: 'ig-old' })
  })
})
