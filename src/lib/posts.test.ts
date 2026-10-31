import { beforeEach, describe, expect, it, vi } from 'vitest'
import { filtered, queryMock } from '@/test/query-mock'
import { countScheduledPosts, getContentRevisions, getPost, listContentPosts, listPosts, postLabel, schedulePost, PostLockedError, retryPost, savePost } from './posts'
import { signMediaUrls } from './assets'
import { db } from './supabase'

vi.mock('./supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./supabase')>()),
  db: vi.fn(),
}))
vi.mock('./assets', () => ({ signMediaUrls: vi.fn(async () => []) }))

beforeEach(() => {
  vi.mocked(db).mockReset()
})

describe('account filters', () => {
  it('does not sign media for a draft outside the connected account', async () => {
    const { query, calls } = queryMock({ data: null, error: null })
    vi.mocked(db).mockReturnValue(query as never)
    vi.mocked(signMediaUrls).mockClear()
    expect(await getPost('user-1', 'post-1', 'ig-1')).toBeNull()
    expect(filtered(calls, 'user_id', 'user-1')).toBe(true)
    expect(filtered(calls, 'account_id', 'ig-1')).toBe(true)
    expect(signMediaUrls).not.toHaveBeenCalled()
  })
  it('polls only the user and account without signing storage URLs', async () => {
    const { query, calls } = queryMock()
    vi.mocked(db).mockReturnValue(query as never)
    vi.mocked(signMediaUrls).mockClear()
    await expect(getContentRevisions('user-1', 'ig-1', ['post-1'])).resolves.toEqual({})
    expect(filtered(calls, 'user_id', 'user-1')).toBe(true)
    expect(filtered(calls, 'account_id', 'ig-1')).toBe(true)
    expect(signMediaUrls).not.toHaveBeenCalled()
  })
  it('lists only the connected account’s posts', async () => {
    const { query, calls } = queryMock()
    vi.mocked(db).mockReturnValue(query as never)

    await listPosts('user-1', 'ig-1')
    expect(filtered(calls, 'user_id', 'user-1')).toBe(true)
    expect(filtered(calls, 'account_id', 'ig-1')).toBe(true)
  })

  it('lists only the connected account’s content in Buat', async () => {
    const { query, calls } = queryMock()
    vi.mocked(db).mockReturnValue(query as never)

    await listContentPosts('user-1', 'ig-1')
    expect(filtered(calls, 'account_id', 'ig-1')).toBe(true)
  })

  it('counts the account’s scheduled posts', async () => {
    const { query, calls } = queryMock({ count: 4, error: null })
    vi.mocked(db).mockReturnValue(query as never)

    await expect(countScheduledPosts('user-1', 'ig-1')).resolves.toBe(4)
    expect(filtered(calls, 'account_id', 'ig-1')).toBe(true)
    expect(filtered(calls, 'status', 'scheduled')).toBe(true)
  })

  it('retries only a post of the connected account', async () => {
    const { query, calls } = queryMock({ data: [], error: null })
    vi.mocked(db).mockReturnValue(query as never)

    await expect(retryPost('user-1', 'ig-1', 'post-1')).resolves.toBe(false)
    expect(filtered(calls, 'account_id', 'ig-1')).toBe(true)
  })
})

describe('localized posts', () => {
  it('localizes only the fallback label', () => {
    expect(postLabel({ title: '', caption: '' })).toBe('Tanpa judul')
    expect(postLabel({ title: '', caption: '' }, 'en')).toBe('Untitled')
    expect(postLabel({ title: 'Judul saya', caption: '' }, 'en')).toBe('Judul saya')
  })

  it.each([
    ['cancelled', 'content', 'Creation cancelled'],
    ['failed', 'content', 'Creation failed · try again'],
    ['pending', 'script', 'Writing script…'],
    ['running', 'content', 'Writing caption and slides…'],
    ['ready', 'script', 'Draft · script ready'],
  ])('localizes %s %s generation descriptions', async (status, kind, generation) => {
    const { query } = queryMock({ data: [{
      id: 'post-1', title: '', caption: '', status: 'draft', updated_at: '2026-01-01',
      scheduled_at: null, post_media: [], post_slides: [], post_threads: null,
      instagram_enabled: true, content_jobs: { status, kind },
    }], error: null })
    vi.mocked(db).mockReturnValue(query as never)
    expect(await listContentPosts('user-1', 'ig-1', 'en')).toEqual([
      expect.objectContaining({ label: 'Untitled', generation }),
    ])
  })

  it('localizes save and schedule lock failures', async () => {
    const { query } = queryMock({ data: null, error: { message: 'post_locked' } })
    vi.mocked(db).mockReturnValue(query as never)
    await expect(savePost('user-1', { id: 'post-1', caption: '', status: 'draft', scheduledAt: null, assetIds: [] }, 'en'))
      .rejects.toThrow("This post is being published or may already be published, so its content can't be changed.")
    await expect(schedulePost('user-1', 'post-1', new Date(), 'en'))
      .rejects.toThrow("This post is being published or may already be published, so it can't be scheduled here.")
  })
})

describe('savePost', () => {
  it('refuses to schedule a post of another account', async () => {
    const { query } = queryMock({ data: null, error: { message: 'wrong_account' } })
    vi.mocked(db).mockReturnValue(query as never)

    const saving = savePost('user-1', { id: 'post-1', caption: '', status: 'scheduled', scheduledAt: new Date(), assetIds: ['a'] })
    await expect(saving).rejects.toBeInstanceOf(PostLockedError)
    await expect(saving).rejects.toThrow('Post ini milik akun Instagram lain.')
  })
})
