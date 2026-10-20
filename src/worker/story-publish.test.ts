import { beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadMedia, removeMediaFile, signMediaUrls, uploadMediaFile } from '@/lib/assets'
import { getCurrentPeriod } from '@/lib/billing'
import { getPublishingAccount, markNeedsReconnect, NeedsReconnectError } from '@/lib/connection'
import { createContainer, getContainerStatus, InstagramApiError, publishContainer } from '@/lib/instagram'
import { setStoryContainer, settleStory, type ClaimedStory } from '@/lib/post-stories'
import { getMediaPaths } from '@/lib/posts'
import { renderStory } from '@/lib/story-image'
import { processStory } from './story-publish'

vi.mock('@/lib/assets', () => ({
  downloadMedia: vi.fn(),
  removeMediaFile: vi.fn(),
  signMediaUrls: vi.fn(),
  uploadMediaFile: vi.fn(),
}))
vi.mock('@/lib/billing', () => ({ getCurrentPeriod: vi.fn() }))
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
}))
vi.mock('@/lib/post-stories', () => ({ setStoryContainer: vi.fn(), settleStory: vi.fn() }))
vi.mock('@/lib/posts', () => ({ getMediaPaths: vi.fn() }))
vi.mock('@/lib/story-image', () => ({ renderStory: vi.fn() }))

const NOW = new Date('2026-10-22T12:00:00Z')
const minutesFromNow = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000)
const STORY_PATH = 'user-1/stories/p1.jpg'

const story = (overrides: Partial<ClaimedStory> = {}): ClaimedStory => ({
  postId: 'p1',
  userId: 'user-1',
  accountId: 'ig1',
  dueAt: NOW,
  attemptCount: 1,
  containerId: null,
  ...overrides,
})

const settled = () => vi.mocked(settleStory).mock.calls.at(-1)?.[1]

describe('processStory', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(getCurrentPeriod).mockResolvedValue({ start: NOW, end: minutesFromNow(60), activeUntil: minutesFromNow(60) })
    vi.mocked(getPublishingAccount).mockResolvedValue({ accessToken: 'token', instagramUserId: 'ig1', username: 'toko' })
    vi.mocked(getMediaPaths).mockResolvedValue(['a.jpg', 'b.jpg'])
    vi.mocked(downloadMedia).mockResolvedValue(new Uint8Array([1]))
    vi.mocked(renderStory).mockResolvedValue(Buffer.from([2]))
    vi.mocked(uploadMediaFile).mockResolvedValue()
    vi.mocked(removeMediaFile).mockResolvedValue()
    vi.mocked(signMediaUrls).mockResolvedValue(['https://media.test/story.jpg?token=x'])
    vi.mocked(createContainer).mockResolvedValue('c1')
    vi.mocked(getContainerStatus).mockResolvedValue('FINISHED')
    vi.mocked(publishContainer).mockResolvedValue('m1')
  })

  it('renders the first slide and publishes it as a Story, saving the container first', async () => {
    await processStory(story(), NOW)

    expect(downloadMedia).toHaveBeenCalledWith('a.jpg')
    expect(renderStory).toHaveBeenCalledWith(new Uint8Array([1]), 'toko')
    expect(uploadMediaFile).toHaveBeenCalledWith(STORY_PATH, Buffer.from([2]))
    expect(createContainer).toHaveBeenCalledWith('token', 'ig1', {
      media_type: 'STORIES',
      image_url: 'https://media.test/story.jpg?token=x',
    })
    expect(setStoryContainer).toHaveBeenCalledWith('p1', 'c1')
    expect(vi.mocked(setStoryContainer).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(publishContainer).mock.invocationCallOrder[0],
    )
    expect(settled()).toEqual({ status: 'published', error: null, nextAttemptAt: null, mediaId: 'm1', clearContainer: false })
    expect(removeMediaFile).toHaveBeenCalledWith(STORY_PATH)
  })

  it('takes a container Instagram already published as published, without posting again', async () => {
    vi.mocked(getContainerStatus).mockResolvedValue('PUBLISHED')

    await processStory(story({ containerId: 'c0', attemptCount: 2 }), NOW)

    expect(createContainer).not.toHaveBeenCalled()
    expect(publishContainer).not.toHaveBeenCalled()
    expect(settled()).toMatchObject({ status: 'published', mediaId: null })
  })

  it('publishes a finished container left by an earlier attempt', async () => {
    await processStory(story({ containerId: 'c0', attemptCount: 2 }), NOW)

    expect(createContainer).not.toHaveBeenCalled()
    expect(publishContainer).toHaveBeenCalledWith('token', 'ig1', 'c0')
  })

  it('makes a new container when the old one expired', async () => {
    vi.mocked(getContainerStatus).mockResolvedValueOnce('EXPIRED').mockResolvedValue('FINISHED')

    await processStory(story({ containerId: 'c0', attemptCount: 2 }), NOW)

    expect(setStoryContainer).toHaveBeenNthCalledWith(1, 'p1', null)
    expect(setStoryContainer).toHaveBeenNthCalledWith(2, 'p1', 'c1')
    expect(settled()).toMatchObject({ status: 'published' })
  })

  it('retries network trouble after a minute, then fails after the last attempt', async () => {
    vi.mocked(createContainer).mockRejectedValue(new InstagramApiError('timeout', null, 0))

    await processStory(story(), NOW)
    expect(settled()).toMatchObject({ status: 'pending', nextAttemptAt: minutesFromNow(1) })

    await processStory(story({ attemptCount: 3 }), NOW)
    expect(settled()).toMatchObject({ status: 'failed', error: 'timeout' })
    expect(removeMediaFile).not.toHaveBeenCalled()
  })

  it('fails for good when Instagram rejects the Story, dropping the container', async () => {
    vi.mocked(publishContainer).mockRejectedValue(new InstagramApiError('Media tidak valid', 100, 400))

    await processStory(story(), NOW)

    expect(settled()).toEqual({
      status: 'failed',
      error: 'Instagram menolak Story: Media tidak valid',
      nextAttemptAt: null,
      mediaId: null,
      clearContainer: true,
    })
  })

  it('gives up on a Story more than 2 hours after its post', async () => {
    await processStory(story({ dueAt: minutesFromNow(-121) }), NOW)

    expect(createContainer).not.toHaveBeenCalled()
    expect(settled()).toMatchObject({ status: 'failed', error: expect.stringContaining('Terlewat') })
  })

  it('asks to reconnect when the token is gone', async () => {
    vi.mocked(getPublishingAccount).mockRejectedValue(new NeedsReconnectError('x'))
    await processStory(story(), NOW)
    expect(settled()).toMatchObject({ status: 'failed', error: expect.stringContaining('Sambungkan ulang') })

    vi.mocked(getPublishingAccount).mockResolvedValue({ accessToken: 'token', instagramUserId: 'ig1', username: 'toko' })
    vi.mocked(createContainer).mockRejectedValue(new InstagramApiError('Invalid OAuth access token', 190, 400))
    await processStory(story(), NOW)
    expect(markNeedsReconnect).toHaveBeenCalledWith('user-1')
    expect(settled()).toMatchObject({ status: 'failed', error: expect.stringContaining('Sambungkan ulang') })
  })

  it('never posts on another account than the post was made for', async () => {
    await processStory(story({ accountId: 'ig2' }), NOW)

    expect(createContainer).not.toHaveBeenCalled()
    expect(settled()).toMatchObject({ status: 'failed', error: 'Akun Instagram berbeda' })
  })

  it('fails without a photo to share', async () => {
    vi.mocked(getMediaPaths).mockResolvedValue([])

    await processStory(story(), NOW)

    expect(settled()).toMatchObject({ status: 'failed', error: 'Post tidak punya foto untuk Story.' })
  })
})
