import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addReference, setReferenceImageLabel } from '@/lib/brand'
import { fetchImage } from '@/lib/web-fetch'
import { importReferencesAction, setReferenceLabelAction } from './actions'

vi.mock('next/cache', () => ({ refresh: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requireAccount: vi.fn(async () => ({ userId: 'user-1', accountId: 'ig-1' })) }))
vi.mock('@/lib/brand', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/brand')>()),
  addReference: vi.fn(),
  setReferenceImageLabel: vi.fn(),
}))
vi.mock('@/lib/web-fetch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/web-fetch')>()),
  fetchImage: vi.fn(),
}))

const IMAGE = { bytes: new Uint8Array([1]), type: 'image/jpeg' as const }
const IMAGE_ID = '0b9c7a0e-3f43-4c2a-9a52-2f5b0d6f1e11'

beforeEach(() => {
  vi.mocked(addReference).mockReset().mockResolvedValue('ref-1')
  vi.mocked(fetchImage).mockReset().mockResolvedValue(IMAGE)
  vi.mocked(setReferenceImageLabel).mockReset().mockResolvedValue(true)
})

describe('importReferencesAction', () => {
  it('imports a carousel as one group with every slide', async () => {
    const result = await importReferencesAction([
      { imageUrls: ['https://cdn/a.jpg', 'https://cdn/b.jpg'], permalink: null, source: 'instagram', sourceLabel: '@kopi' },
    ])

    expect(result).toEqual({ imported: 1, failed: [] })
    expect(fetchImage).toHaveBeenCalledTimes(2)
    expect(addReference).toHaveBeenCalledWith('user-1', 'ig-1', expect.objectContaining({ images: [IMAGE, IMAGE] }))
  })

  it('refuses the old one-image shape', async () => {
    const result = await importReferencesAction([{ imageUrl: 'https://cdn/a.jpg', permalink: null, source: 'website', sourceLabel: 'x' }])

    expect(result).toHaveProperty('error')
    expect(addReference).not.toHaveBeenCalled()
  })
})

describe('setReferenceLabelAction', () => {
  it('saves a known label', async () => {
    await expect(setReferenceLabelAction(IMAGE_ID, 'cta')).resolves.toBeNull()
    expect(setReferenceImageLabel).toHaveBeenCalledWith('user-1', IMAGE_ID, 'cta')
  })

  it('refuses an unknown label', async () => {
    await expect(setReferenceLabelAction(IMAGE_ID, 'judul')).resolves.toBe('Label tidak valid.')
    expect(setReferenceImageLabel).not.toHaveBeenCalled()
  })
})
