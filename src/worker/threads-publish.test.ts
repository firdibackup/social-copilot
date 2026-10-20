import { beforeEach, describe, expect, it, vi } from 'vitest'
import { signMediaUrls } from '@/lib/assets'
import { getCurrentPeriod } from '@/lib/billing'
import { InstagramApiError } from '@/lib/instagram'
import {
  loadPublishItems,
  setItemContainer,
  setItemMedia,
  setThreadsResult,
  settleThreads,
  type ClaimedThreads,
  type PublishItem,
} from '@/lib/post-threads'
import {
  createThreadsContainer,
  findOwnReply,
  findOwnThread,
  getThreadsContainer,
  getThreadsPermalink,
  getThreadsQuota,
  publishThreadsContainer,
} from '@/lib/threads'
import { getThreadsAccount, markThreadsNeedsReconnect, ThreadsReconnectError } from '@/lib/threads-connection'
import { processThreadsPost } from './threads-publish'

vi.mock('@/lib/assets', () => ({ signMediaUrls: vi.fn() }))
vi.mock('@/lib/billing', () => ({ getCurrentPeriod: vi.fn() }))
vi.mock('@/lib/post-threads', () => ({
  loadPublishItems: vi.fn(),
  setItemContainer: vi.fn(),
  setItemMedia: vi.fn(),
  setThreadsResult: vi.fn(),
  settleThreads: vi.fn(),
}))
vi.mock('@/lib/threads', () => ({
  createThreadsContainer: vi.fn(),
  findOwnReply: vi.fn(),
  findOwnThread: vi.fn(),
  getThreadsContainer: vi.fn(),
  getThreadsPermalink: vi.fn(),
  getThreadsQuota: vi.fn(),
  publishThreadsContainer: vi.fn(),
}))
vi.mock('@/lib/threads-connection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/threads-connection')>()),
  getThreadsAccount: vi.fn(),
  markThreadsNeedsReconnect: vi.fn(),
}))

const NOW = new Date('2026-10-22T12:00:00Z')
const minutesFromNow = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000)
const noWait = async () => {}

const claimed = (overrides: Partial<ClaimedThreads> = {}): ClaimedThreads => ({
  postId: 'p1',
  userId: 'user-1',
  accountId: 'ig1',
  dueAt: NOW,
  attemptCount: 1,
  ...overrides,
})

const item = (overrides: Partial<PublishItem> = {}): PublishItem => ({
  position: 0,
  text: 'Ngopi pagi',
  containerId: null,
  mediaId: null,
  storagePaths: [],
  ...overrides,
})

const run = (post = claimed()) => processThreadsPost(post, NOW, noWait)
const lastSettle = () => vi.mocked(settleThreads).mock.calls.at(-1)

describe('processThreadsPost', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(getCurrentPeriod).mockResolvedValue({ start: NOW, end: minutesFromNow(60), activeUntil: minutesFromNow(60) })
    vi.mocked(getThreadsAccount).mockResolvedValue({ accessToken: 'token', threadsUserId: 't1', username: 'toko' })
    vi.mocked(getThreadsQuota).mockResolvedValue({ posts: 250, replies: 1000 })
    vi.mocked(loadPublishItems).mockResolvedValue([item()])
    vi.mocked(signMediaUrls).mockImplementation(async (paths) => paths.map((path) => `https://media.test/${path}`))
    vi.mocked(createThreadsContainer).mockResolvedValue('c1')
    vi.mocked(getThreadsContainer).mockResolvedValue({ status: 'FINISHED', errorMessage: null })
    vi.mocked(publishThreadsContainer).mockResolvedValue('m1')
    vi.mocked(getThreadsPermalink).mockResolvedValue('https://www.threads.com/@toko/post/abc')
  })

  it('publishes a text post, saving the container before publishing', async () => {
    await run()

    expect(createThreadsContainer).toHaveBeenCalledWith('token', 't1', { text: 'Ngopi pagi', media_type: 'TEXT' })
    expect(setItemContainer).toHaveBeenCalledWith('p1', 0, 'c1')
    expect(vi.mocked(setItemContainer).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(publishThreadsContainer).mock.invocationCallOrder[0],
    )
    expect(publishThreadsContainer).toHaveBeenCalledWith('token', 't1', 'c1')
    expect(setItemMedia).toHaveBeenCalledWith('p1', 0, 'm1')
    expect(setThreadsResult).toHaveBeenCalledWith('p1', 'm1', 'https://www.threads.com/@toko/post/abc')
    expect(lastSettle()).toEqual(['p1', 'published', null, null])
  })

  it('chains every item as a reply to the one before', async () => {
    vi.mocked(loadPublishItems).mockResolvedValue([item(), item({ position: 1, text: 'Lanjutan' })])
    vi.mocked(createThreadsContainer).mockResolvedValueOnce('c1').mockResolvedValueOnce('c2')
    vi.mocked(publishThreadsContainer).mockResolvedValueOnce('m1').mockResolvedValueOnce('m2')

    await run()

    expect(createThreadsContainer).toHaveBeenLastCalledWith('token', 't1', {
      text: 'Lanjutan',
      reply_to_id: 'm1',
      media_type: 'TEXT',
    })
    expect(setItemMedia).toHaveBeenLastCalledWith('p1', 1, 'm2')
    expect(setThreadsResult).toHaveBeenCalledWith('p1', 'm1', expect.any(String))
  })

  it('makes one photo an IMAGE and several a carousel of finished children', async () => {
    vi.mocked(loadPublishItems).mockResolvedValue([item({ storagePaths: ['a.jpg', 'b.jpg'] })])
    vi.mocked(createThreadsContainer)
      .mockResolvedValueOnce('k1')
      .mockResolvedValueOnce('k2')
      .mockResolvedValueOnce('c1')

    await run()

    expect(createThreadsContainer).toHaveBeenCalledWith('token', 't1', {
      media_type: 'IMAGE',
      image_url: 'https://media.test/a.jpg',
      is_carousel_item: 'true',
    })
    expect(getThreadsContainer).toHaveBeenCalledWith('token', 'k1')
    expect(getThreadsContainer).toHaveBeenCalledWith('token', 'k2')
    expect(createThreadsContainer).toHaveBeenLastCalledWith('token', 't1', {
      text: 'Ngopi pagi',
      media_type: 'CAROUSEL',
      children: 'k1,k2',
    })
    expect(lastSettle()?.[1]).toBe('published')
  })

  it('sends a single photo as IMAGE', async () => {
    vi.mocked(loadPublishItems).mockResolvedValue([item({ text: '', storagePaths: ['a.jpg'] })])

    await run()

    expect(createThreadsContainer).toHaveBeenCalledWith('token', 't1', {
      media_type: 'IMAGE',
      image_url: 'https://media.test/a.jpg',
    })
  })

  it('continues a chain from the first item not out yet', async () => {
    vi.mocked(loadPublishItems).mockResolvedValue([
      item({ containerId: 'c1', mediaId: 'm1' }),
      item({ position: 1, text: 'Lanjutan' }),
    ])
    vi.mocked(createThreadsContainer).mockResolvedValue('c2')
    vi.mocked(publishThreadsContainer).mockResolvedValue('m2')

    await run()

    expect(createThreadsContainer).toHaveBeenCalledTimes(1)
    expect(createThreadsContainer).toHaveBeenCalledWith('token', 't1', expect.objectContaining({ reply_to_id: 'm1' }))
    expect(lastSettle()?.[1]).toBe('published')
  })

  it('finds an item a lost answer left PUBLISHED instead of posting it twice', async () => {
    vi.mocked(loadPublishItems).mockResolvedValue([item({ containerId: 'c1' })])
    vi.mocked(getThreadsContainer).mockResolvedValue({ status: 'PUBLISHED', errorMessage: null })
    vi.mocked(findOwnThread).mockResolvedValue('m1')

    await run()

    expect(findOwnThread).toHaveBeenCalledWith('token', 'Ngopi pagi')
    expect(publishThreadsContainer).not.toHaveBeenCalled()
    expect(setItemMedia).toHaveBeenCalledWith('p1', 0, 'm1')
    expect(lastSettle()?.[1]).toBe('published')
  })

  it('looks a published reply up under the item before it', async () => {
    vi.mocked(loadPublishItems).mockResolvedValue([
      item({ mediaId: 'm1' }),
      item({ position: 1, text: 'Lanjutan', containerId: 'c2' }),
    ])
    vi.mocked(getThreadsContainer).mockResolvedValue({ status: 'PUBLISHED', errorMessage: null })
    vi.mocked(findOwnReply).mockResolvedValue('m2')

    await run()

    expect(findOwnReply).toHaveBeenCalledWith('token', 'm1', 'Lanjutan')
    expect(setItemMedia).toHaveBeenCalledWith('p1', 1, 'm2')
  })

  it('fails without retrying when a published item cannot be found', async () => {
    vi.mocked(loadPublishItems).mockResolvedValue([item({ containerId: 'c1' })])
    vi.mocked(getThreadsContainer).mockResolvedValue({ status: 'PUBLISHED', errorMessage: null })
    vi.mocked(findOwnThread).mockResolvedValue(null)

    await run()

    expect(publishThreadsContainer).not.toHaveBeenCalled()
    expect(lastSettle()).toEqual([
      'p1',
      'failed',
      'Post Threads #1 mungkin sudah terbit, tapi tidak ditemukan lagi. Cek akun Threads sebelum mencoba lagi.',
      null,
    ])
  })

  it('replaces a container that expired or failed', async () => {
    vi.mocked(loadPublishItems).mockResolvedValue([item({ containerId: 'old' })])
    vi.mocked(getThreadsContainer)
      .mockResolvedValueOnce({ status: 'EXPIRED', errorMessage: null })
      .mockResolvedValue({ status: 'FINISHED', errorMessage: null })

    await run()

    expect(setItemContainer).toHaveBeenCalledWith('p1', 0, null)
    expect(setItemContainer).toHaveBeenCalledWith('p1', 0, 'c1')
    expect(lastSettle()?.[1]).toBe('published')
  })

  it('tries again later while Threads still processes the media', async () => {
    vi.mocked(getThreadsContainer).mockResolvedValue({ status: 'IN_PROGRESS', errorMessage: null })

    await run()

    expect(getThreadsContainer).toHaveBeenCalledTimes(6)
    expect(publishThreadsContainer).not.toHaveBeenCalled()
    expect(lastSettle()).toEqual(['p1', 'pending', 'Threads masih memproses foto.', minutesFromNow(1)])
  })

  it('fails and drops a container Threads could not process', async () => {
    vi.mocked(getThreadsContainer).mockResolvedValue({ status: 'ERROR', errorMessage: 'UNKNOWN' })

    await run()

    expect(setItemContainer).toHaveBeenLastCalledWith('p1', 0, null)
    expect(lastSettle()).toEqual(['p1', 'failed', 'Threads gagal memproses media (UNKNOWN).', null])
  })

  it('fails a chain Threads would refuse before calling Threads', async () => {
    vi.mocked(loadPublishItems).mockResolvedValue([item({ text: 'x'.repeat(501) })])

    await run()

    expect(createThreadsContainer).not.toHaveBeenCalled()
    expect(lastSettle()?.[1]).toBe('failed')
    expect(lastSettle()?.[2]).toContain('lebih dari 500 karakter')
  })

  it('stops when the 24-hour quota is used up', async () => {
    vi.mocked(getThreadsQuota).mockResolvedValue({ posts: 0, replies: 1000 })

    await run()

    expect(createThreadsContainer).not.toHaveBeenCalled()
    expect(lastSettle()).toEqual(['p1', 'failed', 'Kuota posting Threads 24 jam sudah habis. Coba lagi besok.', null])
  })

  it('needs no post quota to finish the replies of a chain whose first post is out', async () => {
    vi.mocked(getThreadsQuota).mockResolvedValue({ posts: 0, replies: 1000 })
    vi.mocked(loadPublishItems).mockResolvedValue([item({ mediaId: 'm1' }), item({ position: 1, text: 'Lanjutan' })])

    await run()

    expect(lastSettle()?.[1]).toBe('published')
  })

  it('fails a first attempt more than an hour late', async () => {
    await run(claimed({ dueAt: minutesFromNow(-61) }))

    expect(getThreadsAccount).not.toHaveBeenCalled()
    expect(lastSettle()).toEqual([
      'p1',
      'failed',
      'Terlewat lebih dari 60 menit dari jadwal. Pilih Coba lagi untuk menerbitkan sekarang.',
      null,
    ])
  })

  it('fails without a current subscription period', async () => {
    vi.mocked(getCurrentPeriod).mockResolvedValue(null)

    await run()

    expect(lastSettle()?.[2]).toBe('Langganan berakhir. Perpanjang di halaman Langganan, lalu pilih Coba lagi.')
  })

  it('asks to reconnect when there is no usable Threads token', async () => {
    vi.mocked(getThreadsAccount).mockRejectedValue(new ThreadsReconnectError('Threads belum terhubung'))

    await run()

    expect(lastSettle()?.[1]).toBe('failed')
    expect(lastSettle()?.[2]).toContain('Hubungkan di Pengaturan')
  })

  it('marks the connection when Threads rejects the token', async () => {
    vi.mocked(createThreadsContainer).mockRejectedValue(new InstagramApiError('Invalid OAuth access token', 190, 400))

    await run()

    expect(markThreadsNeedsReconnect).toHaveBeenCalledWith('user-1')
    expect(lastSettle()?.[1]).toBe('failed')
  })

  it('fails on a rejection', async () => {
    vi.mocked(createThreadsContainer).mockRejectedValue(new InstagramApiError('Param text is too long', 100, 400))

    await run()

    expect(lastSettle()).toEqual(['p1', 'failed', 'Threads menolak post: Param text is too long', null])
  })

  it('retries a network error, and gives up after the fifth attempt', async () => {
    const network = new InstagramApiError('Threads tidak bisa dihubungi (TimeoutError)', null, 0)
    vi.mocked(createThreadsContainer).mockRejectedValue(network)

    await run(claimed({ attemptCount: 2 }))
    expect(lastSettle()).toEqual(['p1', 'pending', network.message, minutesFromNow(5)])

    await run(claimed({ attemptCount: 5 }))
    expect(lastSettle()).toEqual(['p1', 'failed', network.message, null])
  })

  it('still publishes when the permalink cannot be read', async () => {
    vi.mocked(getThreadsPermalink).mockRejectedValue(new Error('timeout'))

    await run()

    expect(setThreadsResult).toHaveBeenCalledWith('p1', 'm1', null)
    expect(lastSettle()?.[1]).toBe('published')
  })

  it('refuses a post without an account', async () => {
    await run(claimed({ accountId: null }))

    expect(lastSettle()).toEqual(['p1', 'failed', 'Akun Instagram berbeda', null])
  })
})
