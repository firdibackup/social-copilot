import { beforeEach, describe, expect, it, vi } from 'vitest'
import { queryMock } from '@/test/query-mock'
import { applyStoryToScheduled, claimDueStory, setStoryDefault, settleStory, toPostStory } from './post-stories'
import { db } from './supabase'

vi.mock('./supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./supabase')>()),
  db: vi.fn(),
}))

beforeEach(() => {
  vi.mocked(db).mockReset()
})

describe('toPostStory', () => {
  it('reads the embed as an object or a one-item list', () => {
    const row = { enabled: true, status: 'failed' as const, last_error: 'x' }
    expect(toPostStory(row)).toEqual({ enabled: true, status: 'failed', lastError: 'x' })
    expect(toPostStory([row])).toEqual({ enabled: true, status: 'failed', lastError: 'x' })
    expect(toPostStory(null)).toBeNull()
    expect(toPostStory([])).toBeNull()
  })
})

describe('setStoryDefault', () => {
  it('writes only the Story switch, so the slots keep following the Brand strategy', async () => {
    const { query, calls } = queryMock({ data: null, error: null })
    vi.mocked(db).mockReturnValue(query as never)

    await setStoryDefault('user-1', 'ig-1', true)
    const upsert = calls.find((call) => call[0] === 'upsert')!
    expect(upsert[1]).toEqual(expect.objectContaining({ user_id: 'user-1', account_id: 'ig-1', always_share_to_story: true }))
    expect(upsert[1]).not.toHaveProperty('slots')
    expect(upsert[2]).toEqual({ onConflict: 'user_id,account_id' })
  })
})

describe('applyStoryToScheduled', () => {
  it('applies to the given account only and returns the count', async () => {
    const { query, calls } = queryMock({ data: 3, error: null })
    vi.mocked(db).mockReturnValue(query as never)

    await expect(applyStoryToScheduled('user-1', 'ig-1')).resolves.toBe(3)
    expect(calls).toContainEqual(['rpc', 'apply_story_to_scheduled', { p_user_id: 'user-1', p_account_id: 'ig-1' }])
  })
})

describe('worker side', () => {
  it('claims nothing when nothing is due', async () => {
    const { query } = queryMock({ data: [], error: null })
    vi.mocked(db).mockReturnValue(query as never)
    await expect(claimDueStory()).resolves.toBeNull()
  })

  it('reads a claimed Story', async () => {
    const row = {
      post_id: 'p1',
      user_id: 'user-1',
      account_id: 'ig-1',
      due_at: '2026-10-22T12:00:00Z',
      attempt_count: 2,
      container_id: 'c1',
    }
    const { query } = queryMock({ data: [row], error: null })
    vi.mocked(db).mockReturnValue(query as never)

    await expect(claimDueStory()).resolves.toEqual({
      postId: 'p1',
      userId: 'user-1',
      accountId: 'ig-1',
      dueAt: new Date('2026-10-22T12:00:00Z'),
      attemptCount: 2,
      containerId: 'c1',
    })
  })

  it('settles with every field', async () => {
    const { query, calls } = queryMock({ data: null, error: null })
    vi.mocked(db).mockReturnValue(query as never)
    const at = new Date('2026-10-22T12:05:00Z')

    await settleStory('p1', { status: 'pending', error: 'timeout', nextAttemptAt: at, mediaId: null, clearContainer: false })
    expect(calls).toContainEqual([
      'rpc',
      'settle_story',
      {
        p_post_id: 'p1',
        p_status: 'pending',
        p_error: 'timeout',
        p_next_attempt_at: at.toISOString(),
        p_media_id: null,
        p_clear_container: false,
      },
    ])
  })
})
