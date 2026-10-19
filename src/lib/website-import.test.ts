import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAsset, findWebsiteAsset, loadAssetBytes } from './assets'
import { fetchImage } from './web-fetch'
import { toReferenceDataUrl, toWebsiteJpeg } from './slide-image'
import { readWebsite, type WebsiteFacts } from './website'
import { importWebsiteAssets } from './website-import'

vi.mock('./assets', () => ({ createAsset: vi.fn(), findWebsiteAsset: vi.fn(), loadAssetBytes: vi.fn() }))
vi.mock('./web-fetch', () => ({ fetchImage: vi.fn() }))
vi.mock('./slide-image', () => ({ toReferenceDataUrl: vi.fn(), toWebsiteJpeg: vi.fn() }))
vi.mock('./website', () => ({ readWebsite: vi.fn() }))

const candidate = (index: number) => ({
  url: `https://shop.test/image-${index}.jpg`,
  pageUrl: 'https://shop.test/',
  alt: `Foto ${index}`,
  context: `Produk ${index}`,
  width: 800,
  height: 1000,
  logo: false,
})

const facts = (count: number): WebsiteFacts => ({
  url: 'https://shop.test/',
  title: 'Toko',
  description: '',
  text: '',
  colors: [],
  fonts: [],
  logoUrls: [],
  imageUrls: [],
  pages: [{ url: 'https://shop.test/', title: 'Toko', description: '', text: '' }],
  images: Array.from({ length: count }, (_, index) => candidate(index)),
  warnings: [],
})

beforeEach(() => {
  vi.mocked(readWebsite).mockReset().mockResolvedValue(facts(1))
  vi.mocked(findWebsiteAsset).mockReset().mockResolvedValue(null)
  vi.mocked(loadAssetBytes).mockReset().mockResolvedValue(new Uint8Array([1]))
  vi.mocked(fetchImage).mockReset().mockResolvedValue({ bytes: new Uint8Array([1]), type: 'image/jpeg' })
  vi.mocked(toWebsiteJpeg).mockReset().mockResolvedValue({ bytes: new Uint8Array([0xff, 0xd8, 0xff]), width: 1080, height: 1350 })
  vi.mocked(toReferenceDataUrl).mockReset().mockResolvedValue('data:image/jpeg;base64,AAA')
  vi.mocked(createAsset).mockReset().mockImplementation(async (_user, _blob, width, height) => ({
    id: `asset-${vi.mocked(createAsset).mock.calls.length}`,
    url: 'https://signed/image.jpg',
    width,
    height,
    origin: 'website',
    groupId: null,
    groupPosition: null,
    isActive: true,
    tags: [],
  }))
})

describe('importWebsiteAssets', () => {
  it('stores a normalized JPEG with website provenance', async () => {
    const result = await importWebsiteAssets('user-1', 'ig-1', 'shop.test')

    expect(result).toMatchObject({ imported: 1, duplicates: 0, skipped: 0 })
    expect(createAsset).toHaveBeenCalledWith(
      'user-1',
      expect.any(Blob),
      1080,
      1350,
      expect.objectContaining({ accountId: 'ig-1', origin: 'website', sourceUrl: 'https://shop.test/image-0.jpg' }),
    )
  })

  it('reuses an ungrouped duplicate for a catalog retry and ignores an already grouped duplicate', async () => {
    vi.mocked(readWebsite).mockResolvedValue(facts(2))
    vi.mocked(findWebsiteAsset)
      .mockResolvedValueOnce({ id: 'old-1', groupId: null })
      .mockResolvedValueOnce({ id: 'old-2', groupId: 'group-1' })

    const result = await importWebsiteAssets('user-1', 'ig-1', 'shop.test')

    expect(result).toMatchObject({ imported: 0, duplicates: 2 })
    expect(result.assets.map((asset) => asset.id)).toEqual(['old-1'])
    expect(loadAssetBytes).toHaveBeenCalledTimes(1)
    expect(fetchImage).not.toHaveBeenCalled()
    expect(createAsset).not.toHaveBeenCalled()
  })

  it('imports at most 40 images', async () => {
    vi.mocked(readWebsite).mockResolvedValue(facts(50))

    const result = await importWebsiteAssets('user-1', 'ig-1', 'shop.test')

    expect(result.imported).toBe(40)
    expect(createAsset).toHaveBeenCalledTimes(40)
  })
})
