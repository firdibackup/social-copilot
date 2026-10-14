import { beforeEach, describe, expect, it, vi } from 'vitest'
import { signMediaUrls } from '@/lib/assets'
import { getPublishingAccount, markNeedsReconnect, NeedsReconnectError } from '@/lib/connection'
import { createContainer, getContainerStatus, getPermalink, InstagramApiError, publishContainer } from '@/lib/instagram'
import {
  finishAttempt,
  getMediaPaths,
  markFailed,
  markPublished,
  scheduleRetry,
  setContainerId,
  setPermalink,
  startAttempt,
  type ClaimedPost,
} from '@/lib/posts'
import { processPost } from './publish'

vi.mock('@/lib/assets', () => ({ signMediaUrls: vi.fn() }))
vi.mock('@/lib/connection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/connection')>()),
  getPublishingAccount: vi.fn(),
  markNeedsReconnect: vi.fn(),
}))
vi.mock('@/lib/instagram', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/instagram')>()),
  createContainer: vi.fn(),
  getContainerStatus: vi.fn(),
  publishContainer: vi.fn(),
  getPermalink: vi.fn(),
}))
vi.mock('@/lib/posts', () => ({
  finishAttempt: vi.fn(),
  getMediaPaths: vi.fn(),
  markFailed: vi.fn(),
  markPublished: vi.fn(),
  scheduleRetry: vi.fn(),
  setContainerId: vi.fn(),
  setPermalink: vi.fn(),
  startAttempt: vi.fn(),
}))

const NOW = new Date('2026-10-14T12:00:00Z')
const minutesFromNow = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000)

const post = (overrides: Partial<ClaimedPost> = {}): ClaimedPost => ({
  id: 'p1',
  caption: 'Ngopi pagi #kopi',
  scheduledAt: NOW,
  attemptCount: 1,
  igContainerId: null,
  ...overrides,
})

const network = () => new InstagramApiError('Instagram tidak bisa dihubungi (TimeoutError)', null, 0)
const rejected = () => new InstagramApiError('The aspect ratio is not supported.', 100, 400)

describe('processPost', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(startAttempt).mockResolvedValue(7)
    vi.mocked(getPublishingAccount).mockResolvedValue({ accessToken: 'token', instagramUserId: 'ig1' })
    vi.mocked(getMediaPaths).mockResolvedValue(['a.jpg'])
    vi.mocked(signMediaUrls).mockResolvedValue(['https://media.test/a.jpg?token=x'])
    vi.mocked(createContainer).mockResolvedValue('c1')
    vi.mocked(getContainerStatus).mockResolvedValue('FINISHED')
    vi.mocked(publishContainer).mockResolvedValue('m1')
    vi.mocked(getPermalink).mockResolvedValue('https://www.instagram.com/p/abc/')
  })

  it('publishes a single photo and saves the container before publishing', async () => {
    await processPost(post(), NOW)

    expect(createContainer).toHaveBeenCalledWith('token', 'ig1', {
      image_url: 'https://media.test/a.jpg?token=x',
      caption: 'Ngopi pagi #kopi',
    })
    expect(setContainerId).toHaveBeenCalledWith('p1', 'c1')
    expect(vi.mocked(setContainerId).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(publishContainer).mock.invocationCallOrder[0],
    )
    expect(publishContainer).toHaveBeenCalledWith('token', 'ig1', 'c1')
    expect(markPublished).toHaveBeenCalledWith('p1', 'm1')
    expect(setPermalink).toHaveBeenCalledWith('p1', 'https://www.instagram.com/p/abc/')
    expect(finishAttempt).toHaveBeenCalledWith(7, 'published', null)
  })

  it('publishes several photos as a carousel in their saved order', async () => {
    vi.mocked(getMediaPaths).mockResolvedValue(['a.jpg', 'b.jpg'])
    vi.mocked(signMediaUrls).mockResolvedValue(['https://media.test/a', 'https://media.test/b'])
    vi.mocked(createContainer).mockImplementation(async (_token, _user, params) =>
      params.image_url === 'https://media.test/a' ? 'k1' : params.image_url === 'https://media.test/b' ? 'k2' : 'c1',
    )

    await processPost(post(), NOW)

    expect(createContainer).toHaveBeenCalledWith('token', 'ig1', { image_url: 'https://media.test/a', is_carousel_item: 'true' })
    expect(createContainer).toHaveBeenCalledWith('token', 'ig1', { image_url: 'https://media.test/b', is_carousel_item: 'true' })
    expect(createContainer).toHaveBeenLastCalledWith('token', 'ig1', {
      media_type: 'CAROUSEL',
      children: 'k1,k2',
      caption: 'Ngopi pagi #kopi',
    })
    expect(setContainerId).toHaveBeenCalledWith('p1', 'c1')
    expect(markPublished).toHaveBeenCalledWith('p1', 'm1')
  })

  it('marks a post published without publishing again when Instagram already has it', async () => {
    vi.mocked(getContainerStatus).mockResolvedValue('PUBLISHED')

    await processPost(post({ attemptCount: 2, igContainerId: 'c1' }), NOW)

    expect(getContainerStatus).toHaveBeenCalledWith('token', 'c1')
    expect(publishContainer).not.toHaveBeenCalled()
    expect(createContainer).not.toHaveBeenCalled()
    expect(markPublished).toHaveBeenCalledWith('p1', null)
    expect(finishAttempt).toHaveBeenCalledWith(7, 'published', null)
  })

  it('publishes a finished container from an earlier attempt without creating a new one', async () => {
    await processPost(post({ attemptCount: 2, igContainerId: 'c1' }), NOW)

    expect(createContainer).not.toHaveBeenCalled()
    expect(publishContainer).toHaveBeenCalledWith('token', 'ig1', 'c1')
  })

  it('replaces an expired container', async () => {
    vi.mocked(getContainerStatus).mockResolvedValueOnce('EXPIRED').mockResolvedValueOnce('FINISHED')
    vi.mocked(createContainer).mockResolvedValue('c2')

    await processPost(post({ attemptCount: 2, igContainerId: 'c1' }), NOW)

    expect(setContainerId).toHaveBeenNthCalledWith(1, 'p1', null)
    expect(setContainerId).toHaveBeenNthCalledWith(2, 'p1', 'c2')
    expect(publishContainer).toHaveBeenCalledWith('token', 'ig1', 'c2')
  })

  it('keeps the container and retries in a minute when publishing times out', async () => {
    vi.mocked(publishContainer).mockRejectedValue(network())

    await processPost(post(), NOW)

    expect(scheduleRetry).toHaveBeenCalledWith('p1', minutesFromNow(1), expect.stringContaining('TimeoutError'))
    expect(setContainerId).not.toHaveBeenCalledWith('p1', null)
    expect(markFailed).not.toHaveBeenCalled()
    expect(finishAttempt).toHaveBeenCalledWith(7, 'retry', expect.any(String))
  })

  it('waits longer after each failed attempt', async () => {
    vi.mocked(publishContainer).mockRejectedValue(network())

    await processPost(post({ attemptCount: 3, igContainerId: 'c1' }), NOW)

    expect(scheduleRetry).toHaveBeenCalledWith('p1', minutesFromNow(15), expect.any(String))
  })

  it('retries while Instagram is still processing the container', async () => {
    vi.mocked(getContainerStatus).mockResolvedValue('IN_PROGRESS')

    await processPost(post(), NOW)

    expect(publishContainer).not.toHaveBeenCalled()
    expect(scheduleRetry).toHaveBeenCalledWith('p1', minutesFromNow(1), expect.any(String))
  })

  it('gives up after the fifth attempt and keeps the container, since the outcome is unknown', async () => {
    vi.mocked(publishContainer).mockRejectedValue(network())

    await processPost(post({ attemptCount: 5, igContainerId: 'c1' }), NOW)

    expect(scheduleRetry).not.toHaveBeenCalled()
    expect(markFailed).toHaveBeenCalledWith('p1', expect.stringContaining('TimeoutError'), false)
    expect(finishAttempt).toHaveBeenCalledWith(7, 'failed', expect.any(String))
  })

  it('fails at once and clears the container when Instagram rejects the post', async () => {
    vi.mocked(publishContainer).mockRejectedValue(rejected())

    await processPost(post(), NOW)

    expect(scheduleRetry).not.toHaveBeenCalled()
    expect(markFailed).toHaveBeenCalledWith('p1', expect.stringContaining('aspect ratio'), true)
  })

  it('asks for a reconnect when the token is rejected', async () => {
    vi.mocked(createContainer).mockRejectedValue(new InstagramApiError('Invalid OAuth access token', 190, 400))

    await processPost(post(), NOW)

    expect(markNeedsReconnect).toHaveBeenCalled()
    expect(markFailed).toHaveBeenCalledWith('p1', expect.stringContaining('Sambungkan ulang'), false)
  })

  it('asks for a reconnect when Instagram is not connected', async () => {
    vi.mocked(getPublishingAccount).mockRejectedValue(new NeedsReconnectError('Instagram belum terhubung'))

    await processPost(post(), NOW)

    expect(createContainer).not.toHaveBeenCalled()
    expect(markFailed).toHaveBeenCalledWith('p1', expect.stringContaining('Sambungkan ulang'), false)
  })

  it('skips a post more than an hour late on its first attempt', async () => {
    await processPost(post({ scheduledAt: minutesFromNow(-61) }), NOW)

    expect(createContainer).not.toHaveBeenCalled()
    expect(markFailed).toHaveBeenCalledWith('p1', expect.stringContaining('Terlewat'), false)
  })

  it('still publishes a retry whose original schedule is long past', async () => {
    await processPost(post({ scheduledAt: minutesFromNow(-90), attemptCount: 4 }), NOW)

    expect(markPublished).toHaveBeenCalledWith('p1', 'm1')
  })

  it('retries when the database fails mid-publish', async () => {
    vi.mocked(markPublished).mockRejectedValueOnce(new Error('Supabase: fetch failed'))

    await processPost(post(), NOW)

    expect(scheduleRetry).toHaveBeenCalledWith('p1', minutesFromNow(1), expect.any(String))
  })
})
