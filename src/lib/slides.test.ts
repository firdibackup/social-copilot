import { beforeEach, describe, expect, it, vi } from 'vitest'
import { queryMock } from '@/test/query-mock'
import { getPostReferenceId, replaceSlide, requeueSlide, retrySlide } from './slides'
import { db } from './supabase'

vi.mock('./supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./supabase')>()),
  db: vi.fn(),
}))

beforeEach(() => vi.mocked(db).mockReset())

describe('getPostReferenceId', () => {
  it('reads the persisted reference group through an owner-scoped slide image', async () => {
    const slide = queryMock({ data: [{ reference_image_id: null }, { reference_image_id: 'image-1' }], error: null })
    const image = queryMock({ data: { reference_id: 'reference-1' }, error: null })
    vi.mocked(db).mockReturnValueOnce(slide.query as never).mockReturnValueOnce(image.query as never)

    await expect(getPostReferenceId('user-1', 'post-1')).resolves.toBe('reference-1')
    expect(slide.calls).toContainEqual(['eq', 'user_id', 'user-1'])
    expect(slide.calls).toContainEqual(['eq', 'post_id', 'post-1'])
    expect(image.calls).toContainEqual(['eq', 'user_id', 'user-1'])
    expect(image.calls).toContainEqual(['eq', 'id', 'image-1'])
  })
})

describe('retrySlide', () => {
  it('requeues only the owner’s slide and reports whether it was failed', async () => {
    const { query, calls } = queryMock({ data: true, error: null })
    vi.mocked(db).mockReturnValue(query as never)

    await expect(retrySlide('user-1', 'slide-1')).resolves.toBe(true)
    expect(calls).toContainEqual(['rpc', 'retry_slide', { p_user_id: 'user-1', p_id: 'slide-1' }])
  })
})

describe('requeueSlide', () => {
  it('requeues only the same active lease, so a cancelled attempt cannot revive', async () => {
    const { query, calls } = queryMock({ data: null, error: null })
    vi.mocked(db).mockReturnValue(query as never)

    await requeueSlide('slide-1', 'Layanan sibuk', 30_000, 'lease-1')
    expect(calls).toContainEqual(['eq', 'id', 'slide-1'])
    expect(calls).toContainEqual(['eq', 'lease', 'lease-1'])
    expect(calls).toContainEqual(['eq', 'status', 'generating'])
    expect(calls).toContainEqual(['update', expect.objectContaining({ status: 'pending', lease: null })])
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
