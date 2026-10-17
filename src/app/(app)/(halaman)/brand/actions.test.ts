import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addReference, setReferenceImageLabel } from '@/lib/brand'
import { analyzeProfile } from '@/lib/brand-ai'
import { getValidAccessToken } from '@/lib/connection'
import { fetchOwnProfile, fetchRecentMedia } from '@/lib/instagram'
import { fetchImage } from '@/lib/web-fetch'
import { analyzeProfileAction, importReferencesAction, setReferenceLabelAction } from './actions'

vi.mock('next/cache', () => ({ refresh: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requireAccount: vi.fn(async () => ({ userId: 'user-1', accountId: 'ig-1' })) }))
vi.mock('@/lib/brand', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/brand')>()),
  addReference: vi.fn(),
  setReferenceImageLabel: vi.fn(),
}))
vi.mock('@/lib/brand-ai', () => ({ analyzeProfile: vi.fn(), analyzeVisual: vi.fn() }))
vi.mock('@/lib/connection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/connection')>()),
  getValidAccessToken: vi.fn(),
}))
vi.mock('@/lib/instagram', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/instagram')>()),
  fetchOwnProfile: vi.fn(),
  fetchRecentMedia: vi.fn(),
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

describe('analyzeProfileAction', () => {
  it('sends the account’s text to the AI, never the signed picture URL it logs', async () => {
    vi.mocked(getValidAccessToken).mockResolvedValue('token')
    vi.mocked(fetchOwnProfile).mockResolvedValue({
      username: 'kopi',
      name: 'Kopi',
      biography: 'Ngopi',
      profilePictureUrl: 'https://cdn/avatar.jpg?token=x',
    })
    vi.mocked(fetchRecentMedia).mockResolvedValue([])
    vi.mocked(analyzeProfile).mockResolvedValue({ name: 'Kopi' } as never)

    await analyzeProfileAction('', true)

    expect(vi.mocked(analyzeProfile).mock.calls[0][1].instagram).toEqual({
      username: 'kopi',
      name: 'Kopi',
      biography: 'Ngopi',
      captions: [],
    })
  })
})
