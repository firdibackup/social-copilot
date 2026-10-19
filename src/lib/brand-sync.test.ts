import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addReference, getBrandFields, loadVisualReferences, setLogo, updateBrandKit, updateReference } from './brand'
import { analyzeProfile, analyzeVisual } from './brand-ai'
import { EMPTY_BRAND } from './brand-options'
import { syncNewAccount } from './brand-sync'
import { getValidAccessToken } from './connection'
import { paletteFromBytes } from './image-palette'
import { fetchOwnProfile, fetchRecentMedia, type InstagramPost } from './instagram'
import { fetchImage } from './web-fetch'

vi.mock('./connection', () => ({ getValidAccessToken: vi.fn() }))
vi.mock('./instagram', () => ({ fetchOwnProfile: vi.fn(), fetchRecentMedia: vi.fn() }))
vi.mock('./brand-ai', () => ({ analyzeProfile: vi.fn(), analyzeVisual: vi.fn() }))
vi.mock('./brand', () => ({
  addReference: vi.fn(),
  getBrandFields: vi.fn(),
  loadVisualReferences: vi.fn(),
  setLogo: vi.fn(),
  updateBrandKit: vi.fn(),
  updateReference: vi.fn(),
}))
vi.mock('./web-fetch', () => ({ fetchImage: vi.fn() }))
vi.mock('./image-palette', () => ({ paletteFromBytes: vi.fn() }))

const USER = 'user-1'
const ACCOUNT = 'ig-1'
const JPEG = { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), type: 'image/jpeg' as const }
const post = (id: string, images = [`https://cdn/${id}.jpg`]): InstagramPost => ({
  id,
  caption: `caption ${id}`,
  imageUrl: images[0],
  images,
  isCarousel: images.length > 1,
  permalink: `https://ig/p/${id}`,
})
const PROFILE_DRAFT = { name: 'Kopi', category: 'Kafe', description: 'Kopi enak', audience: '', voice: 'santai', wordsUse: '', wordsAvoid: '', facts: '' }

const lastKitUpdate = () => vi.mocked(updateBrandKit).mock.calls.at(-1)?.[2]

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(getValidAccessToken).mockResolvedValue('token')
  vi.mocked(fetchOwnProfile).mockResolvedValue({
    username: 'kopi',
    name: 'Kopi',
    biography: 'Ngopi',
    profilePictureUrl: 'https://cdn/avatar.jpg',
  })
  vi.mocked(fetchRecentMedia).mockResolvedValue([post('1', ['https://cdn/a.jpg', 'https://cdn/b.jpg', 'https://cdn/c.jpg']), post('2'), post('3'), post('4'), post('5')])
  vi.mocked(analyzeProfile).mockResolvedValue(PROFILE_DRAFT as never)
  vi.mocked(fetchImage).mockResolvedValue(JPEG)
  vi.mocked(addReference).mockImplementation(async (_user, _account, reference) => `ref-${reference.permalink}`)
  vi.mocked(paletteFromBytes).mockResolvedValue(['#111111', '#222222'])
  vi.mocked(updateReference).mockResolvedValue(true)
  vi.mocked(loadVisualReferences).mockResolvedValue({ references: [{ id: 'ref-x', note: '', dataUrl: 'data:' }], skipped: 0 })
  vi.mocked(analyzeVisual).mockResolvedValue({ visualStyle: 'Minimalis', descriptions: ['Cover gelap'] })
})

describe('syncNewAccount', () => {
  it('fills the brand for free from the profile, the photo and the 3 newest posts', async () => {
    await syncNewAccount(USER, ACCOUNT)

    expect(analyzeProfile).toHaveBeenCalledWith(USER, expect.objectContaining({ website: null }), { cost: 0 })
    // The sources are logged; the signed picture URL must not be.
    expect(JSON.stringify(vi.mocked(analyzeProfile).mock.calls[0][1])).not.toContain('avatar.jpg')
    expect(analyzeVisual).toHaveBeenCalledWith(USER, expect.any(Array), { cost: 0 })
    expect(updateBrandKit).toHaveBeenCalledWith(USER, ACCOUNT, expect.objectContaining({ name: 'Kopi', voice: 'santai' }))
    expect(setLogo).toHaveBeenCalledWith(USER, ACCOUNT, JPEG.bytes, 'image/jpeg')
    expect(addReference).toHaveBeenCalledTimes(3)
    expect(vi.mocked(addReference).mock.calls[0][2]).toMatchObject({ source: 'instagram', sourceLabel: '@kopi' })
    expect(vi.mocked(addReference).mock.calls[0][2].images).toHaveLength(3)
  })

  it('saves the covers’ palettes and brand colours from them', async () => {
    await syncNewAccount(USER, ACCOUNT)

    expect(updateReference).toHaveBeenCalledWith(USER, 'ref-https://ig/p/1', { palette: ['#111111', '#222222'] })
    expect(updateBrandKit).toHaveBeenCalledWith(
      USER,
      ACCOUNT,
      expect.objectContaining({ colors: [{ hex: '#111111', role: 'utama' }, { hex: '#222222', role: 'sekunder' }] }),
    )
  })

  it('saves the visual style and the descriptions, then clears the status', async () => {
    await syncNewAccount(USER, ACCOUNT)

    expect(updateBrandKit).toHaveBeenCalledWith(USER, ACCOUNT, expect.objectContaining({ visualStyle: 'Minimalis' }))
    expect(updateReference).toHaveBeenCalledWith(USER, 'ref-x', { description: 'Cover gelap' })
    expect(lastKitUpdate()).toEqual({ syncStatus: null })
  })

  it('keeps what worked and ends as failed when a step fails', async () => {
    vi.mocked(analyzeVisual).mockRejectedValue(new Error('9Router down'))

    await expect(syncNewAccount(USER, ACCOUNT)).resolves.toBeUndefined()

    expect(updateBrandKit).toHaveBeenCalledWith(USER, ACCOUNT, expect.objectContaining({ name: 'Kopi' }))
    expect(addReference).toHaveBeenCalledTimes(3)
    expect(lastKitUpdate()).toEqual({ syncStatus: 'failed' })
  })

  it('keeps what the owner answered in the onboarding and fills only the empty fields', async () => {
    vi.mocked(getBrandFields).mockResolvedValue({
      ...EMPTY_BRAND,
      name: 'Kopi Sinar',
      designStyle: 'minimalis',
      visualStyle: 'Bersih dan terang',
      colors: [{ hex: '#0f766e', role: 'utama' }],
    })

    await syncNewAccount(USER, ACCOUNT)

    const patches = vi.mocked(updateBrandKit).mock.calls.map((call) => call[2])
    expect(patches).toContainEqual({ category: 'Kafe', description: 'Kopi enak', voice: 'santai' })
    expect(patches.some((patch) => 'name' in patch || 'colors' in patch || 'visualStyle' in patch)).toBe(false)
    expect(addReference).toHaveBeenCalledTimes(3)
    expect(updateReference).toHaveBeenCalledWith(USER, 'ref-x', { description: 'Cover gelap' })
  })

  it('ends as failed without touching anything when Instagram can’t be read', async () => {
    vi.mocked(getValidAccessToken).mockRejectedValue(new Error('expired'))

    await expect(syncNewAccount(USER, ACCOUNT)).resolves.toBeUndefined()

    expect(addReference).not.toHaveBeenCalled()
    expect(lastKitUpdate()).toEqual({ syncStatus: 'failed' })
  })
})
