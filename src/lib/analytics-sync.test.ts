import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { claimSync, finishSync, releaseSync, removeVanished, saveSynced } from './analytics'
import { emptyMetrics } from './analytics-metrics'
import { MissingInsightsPermissionError, syncAnalytics } from './analytics-sync'
import { getConnection, getPublishingAccount, type Connection } from './connection'
import { InstagramApiError, getMediaInsights, listMediaSince, type OwnMedia } from './instagram'

vi.mock('./analytics', () => ({
  MAX_SYNC_POSTS: 150,
  claimSync: vi.fn(),
  finishSync: vi.fn(),
  releaseSync: vi.fn(),
  removeVanished: vi.fn(),
  saveSynced: vi.fn(),
}))
vi.mock('./connection', () => ({
  NeedsReconnectError: class NeedsReconnectError extends Error {},
  getConnection: vi.fn(),
  getPublishingAccount: vi.fn(),
}))
vi.mock('./instagram', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./instagram')>()
  return {
    INSIGHTS_SCOPE: actual.INSIGHTS_SCOPE,
    InstagramApiError: actual.InstagramApiError,
    getMediaInsights: vi.fn(),
    listMediaSince: vi.fn(),
  }
})

const USER = 'user-1'
const ACCOUNT = 'ig-1'
const CONNECTION: Connection = {
  username: 'kopi',
  accountType: 'BUSINESS',
  tokenExpiresAt: new Date('2026-12-01T00:00:00Z'),
  status: 'active',
  scopes: ['instagram_business_basic', 'instagram_business_manage_insights'],
}
const media = (id: string): OwnMedia => ({
  id,
  mediaType: 'IMAGE',
  productType: 'FEED',
  caption: '',
  permalink: null,
  thumbnailUrl: null,
  postedAt: new Date('2026-10-10T08:00:00Z'),
  likes: 3,
  comments: 1,
})
const metrics = (views: number) => ({ ...emptyMetrics(), views })
const savedRows = () => vi.mocked(saveSynced).mock.calls[0][2]

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(getConnection).mockResolvedValue(CONNECTION)
  vi.mocked(claimSync).mockResolvedValue(true)
  vi.mocked(releaseSync).mockResolvedValue()
  vi.mocked(getPublishingAccount).mockResolvedValue({ accessToken: 'token', instagramUserId: ACCOUNT })
  vi.mocked(listMediaSince).mockResolvedValue({ media: [media('1'), media('2'), media('3')], isComplete: true })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('syncAnalytics', () => {
  it('stores every post, counts a failed one apart and records the result', async () => {
    // Arrange
    vi.mocked(getMediaInsights).mockImplementation(async (_token, id) => {
      if (id === '2') throw new InstagramApiError('Unsupported metric', 100, 400)
      return metrics(Number(id) * 100)
    })

    // Act
    const result = await syncAnalytics(USER, ACCOUNT)

    // Assert
    expect(result).toEqual({ updated: 2, failed: 1 })
    expect(savedRows().map((row) => [row.media.id, row.metrics?.views ?? null, row.error])).toEqual([
      ['1', 100, null],
      ['2', null, 'Unsupported metric'],
      ['3', 300, null],
    ])
    expect(removeVanished).toHaveBeenCalledWith(USER, ACCOUNT, ['1', '2', '3'])
    expect(finishSync).toHaveBeenCalledWith(USER, ACCOUNT, { updated: 2, failed: 1 })
  })

  it('keeps vanished posts when the listing was cut short', async () => {
    vi.mocked(listMediaSince).mockResolvedValue({ media: [media('1')], isComplete: false })
    vi.mocked(getMediaInsights).mockResolvedValue(metrics(10))

    await syncAnalytics(USER, ACCOUNT)

    expect(removeVanished).not.toHaveBeenCalled()
  })

  it('counts an empty insights answer as failed, so the stored numbers stay', async () => {
    vi.mocked(listMediaSince).mockResolvedValue({ media: [media('1')], isComplete: true })
    vi.mocked(getMediaInsights).mockResolvedValue(emptyMetrics())

    expect(await syncAnalytics(USER, ACCOUNT)).toEqual({ updated: 0, failed: 1 })
    expect(savedRows()[0].metrics).toBeNull()
  })

  it('keeps every row when Instagram lists no posts at all', async () => {
    vi.mocked(listMediaSince).mockResolvedValue({ media: [], isComplete: true })

    expect(await syncAnalytics(USER, ACCOUNT)).toEqual({ updated: 0, failed: 0 })
    expect(removeVanished).not.toHaveBeenCalled()
  })

  it('stops asking once a post runs out of retries', async () => {
    vi.useFakeTimers()
    vi.mocked(listMediaSince).mockResolvedValue({ media: ['1', '2', '3', '4', '5'].map(media), isComplete: true })
    vi.mocked(getMediaInsights).mockRejectedValue(new InstagramApiError('Service unavailable', 2, 500))

    const pending = syncAnalytics(USER, ACCOUNT)
    await vi.runAllTimersAsync()

    expect(await pending).toEqual({ updated: 0, failed: 5 })
    // Only the three posts in flight ever asked; the last two never did.
    const askedIds = new Set(vi.mocked(getMediaInsights).mock.calls.map(([, id]) => id))
    expect(askedIds).toEqual(new Set(['1', '2', '3']))
  })

  it('reports the cooldown without calling Instagram', async () => {
    vi.mocked(claimSync).mockResolvedValue(false)

    expect(await syncAnalytics(USER, ACCOUNT)).toBe('cooldown')
    expect(listMediaSince).not.toHaveBeenCalled()
  })

  it('asks for the insights permission before claiming a sync', async () => {
    vi.mocked(getConnection).mockResolvedValue({ ...CONNECTION, scopes: ['instagram_business_basic'] })

    await expect(syncAnalytics(USER, ACCOUNT)).rejects.toBeInstanceOf(MissingInsightsPermissionError)
    expect(claimSync).not.toHaveBeenCalled()
  })

  it('aborts on a rejected token and frees the claim', async () => {
    vi.mocked(getMediaInsights).mockRejectedValue(new InstagramApiError('Invalid token', 190, 400))

    await expect(syncAnalytics(USER, ACCOUNT)).rejects.toMatchObject({ code: 190 })
    expect(saveSynced).not.toHaveBeenCalled()
    expect(releaseSync).toHaveBeenCalledWith(USER, ACCOUNT)
    expect(finishSync).not.toHaveBeenCalled()
  })

  it('retries a transient error before giving up on a post', async () => {
    vi.useFakeTimers()
    vi.mocked(listMediaSince).mockResolvedValue({ media: [media('1')], isComplete: true })
    vi.mocked(getMediaInsights)
      .mockRejectedValueOnce(new InstagramApiError('Service unavailable', 2, 500))
      .mockResolvedValueOnce(metrics(50))

    const pending = syncAnalytics(USER, ACCOUNT)
    await vi.runAllTimersAsync()

    expect(await pending).toEqual({ updated: 1, failed: 0 })
    expect(getMediaInsights).toHaveBeenCalledTimes(2)
  })

  it('stops asking once Instagram rate-limits the account', async () => {
    vi.useFakeTimers()
    vi.mocked(listMediaSince).mockResolvedValue({ media: ['1', '2', '3', '4', '5'].map(media), isComplete: true })
    vi.mocked(getMediaInsights).mockRejectedValue(new InstagramApiError('Too many calls', 80002, 400))

    const pending = syncAnalytics(USER, ACCOUNT)
    await vi.runAllTimersAsync()

    expect(await pending).toEqual({ updated: 0, failed: 5 })
    // The three posts already in flight asked once each; the other two were never sent.
    expect(getMediaInsights).toHaveBeenCalledTimes(3)
  })
})
