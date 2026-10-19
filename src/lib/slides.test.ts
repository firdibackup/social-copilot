import { beforeEach, describe, expect, it, vi } from 'vitest'
import { queryMock } from '@/test/query-mock'
import { replaceSlide, requeueSlide, retrySlide } from './slides'
import { db } from './supabase'

vi.mock('./supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./supabase')>()),
  db: vi.fn(),
}))

beforeEach(() => vi.mocked(db).mockReset())

describe('retrySlide', () => {
  it('requeues only the owner’s slide and reports whether it was failed', async () => {
    const { query, calls } = queryMock({ data: true, error: null })
    vi.mocked(db).mockReturnValue(query as never)

    await expect(retrySlide('user-1', 'slide-1')).resolves.toBe(true)
    expect(calls).toContainEqual(['rpc', 'retry_slide', { p_user_id: 'user-1', p_id: 'slide-1' }])
  })
})

describe('requeueSlide', () => {
  it('sends the delay as a Postgres interval', async () => {
    const { query, calls } = queryMock({ data: null, error: null })
    vi.mocked(db).mockReturnValue(query as never)

    await requeueSlide('slide-1', 'Layanan sibuk', 30_000)
    expect(calls).toContainEqual(['rpc', 'requeue_slide', { p_id: 'slide-1', p_error: 'Layanan sibuk', p_delay: '30 seconds' }])
  })
})

describe('replaceSlide', () => {
  it('keeps the product group selected by the planner', async () => {
    const { query, calls } = queryMock({ data: null, error: null })
    vi.mocked(db).mockReturnValue(query as never)

    await replaceSlide('user-1', {
      postId: 'post-1',
      oldAssetId: 'old-1',
      newAssetId: 'new-1',
      headline: 'Kopi pagi',
      scene: 'Botol di meja',
      format: '4:5',
      role: 'isi',
      referenceImageId: '00000000-0000-4000-8000-000000000001',
      productGroupId: '00000000-0000-4000-8000-000000000099',
      includeLogo: true,
      example: 'langkah-bernomor',
    })

    expect(calls.find((call) => call[0] === 'rpc')).toEqual([
      'rpc',
      'replace_slide',
      expect.objectContaining({
        p_user_id: 'user-1',
        p_product_group_id: '00000000-0000-4000-8000-000000000099',
        p_example: 'langkah-bernomor',
      }),
    ])
  })
})
