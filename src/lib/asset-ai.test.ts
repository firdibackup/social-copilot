import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AiOutputError } from './ai'
import { buildTagMessages, parseTags, readTags, tagAssets, visualBatches } from './asset-ai'
import { loadOwnPhotos, setAssetTags } from './assets'
import { chatCompletion } from './nine-router'

const database = vi.hoisted(() => ({ inserted: [] as unknown[] }))

vi.mock('./supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./supabase')>()),
  db: () => ({
    rpc: vi.fn(async () => ({ data: 'reservation-1', error: null })),
    from: () => ({
      insert: async (row: unknown) => {
        database.inserted.push(row)
        return { data: null, error: null }
      },
    }),
  }),
}))
vi.mock('./billing', () => ({
  creditsUsed: async () => 0,
  getCurrentPeriod: async () => ({ start: new Date('2026-10-01'), end: new Date('2026-10-31'), activeUntil: new Date('2026-10-31') }),
}))
vi.mock('./nine-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./nine-router')>()),
  chatCompletion: vi.fn(),
}))
vi.mock('./assets', () => ({ loadOwnPhotos: vi.fn(), setAssetTags: vi.fn() }))
vi.mock('./slide-image', () => ({ toReferenceDataUrl: vi.fn(async () => 'data:image/jpeg;base64,AAAA') }))

const photo = (id: string, size = 100) => ({ id, product: null, dataUrl: `data:image/jpeg;base64,${'a'.repeat(size)}` })

describe('visualBatches', () => {
  it('keeps batches to 12 images', () => {
    expect(visualBatches(Array.from({ length: 13 }, (_, index) => photo(`id-${index}`))).map((batch) => batch.length)).toEqual([12, 1])
  })

  it('starts a new batch before the visual body budget runs out', () => {
    const batches = visualBatches([photo('a', 400_000), photo('b', 400_000), photo('c', 400_000)])
    expect(batches.map((batch) => batch.length)).toEqual([2, 1])
  })
})

describe('buildTagMessages', () => {
  it('pairs each id with its image and quotes the product name', () => {
    const [system, user] = buildTagMessages([{ id: 'asset-1', product: 'Kopi Botol', dataUrl: 'data:image/jpeg;base64,AAAA' }])

    expect(system.content).toContain('JSON')
    const text = JSON.stringify(user.content)
    expect(text).toContain('asset-1')
    expect(text).toContain('Kopi Botol')
    expect(text).toContain('data:image/jpeg')
  })
})

describe('readTags', () => {
  it('keeps the clean tags of expected ids only', () => {
    expect(readTags('{"tags":{"a":["Kopi","kopi"," Botol "],"x":["lain"],"b":[]}}', ['a', 'b'])).toEqual(
      new Map([['a', ['kopi', 'botol']]]),
    )
  })

  it('reads nothing from an answer without tags', () => {
    expect(readTags('Maaf, saya tidak bisa.', ['a']).size).toBe(0)
  })
})

describe('parseTags', () => {
  it('needs tags for every photo', () => {
    expect(() => parseTags('{"tags":{"a":["kopi"]}}', ['a', 'b'])).toThrow(AiOutputError)
    expect(parseTags('{"tags":{"a":["kopi"],"b":["botol"]}}', ['a', 'b']).get('b')).toEqual(['botol'])
  })
})

describe('tagAssets', () => {
  beforeEach(() => {
    vi.stubEnv('ROUTER_MODEL', 'test-model')
    database.inserted = []
    vi.mocked(chatCompletion).mockReset()
    vi.mocked(setAssetTags).mockReset().mockResolvedValue(true)
    vi.mocked(loadOwnPhotos).mockReset().mockResolvedValue([
      { id: 'a', bytes: new Uint8Array([1]), product: 'Kopi Botol' },
      { id: 'b', bytes: new Uint8Array([2]), product: null },
    ])
  })

  afterEach(() => vi.unstubAllEnvs())

  it("saves every photo's tags and charges one credit per photo", async () => {
    vi.mocked(chatCompletion).mockResolvedValue('{"tags":{"a":["kopi"],"b":["botol"]}}')

    await expect(tagAssets('user-1', 'ig-1', ['a', 'b'])).resolves.toBe(2)

    expect(setAssetTags).toHaveBeenCalledWith('user-1', 'a', ['kopi'])
    expect(setAssetTags).toHaveBeenCalledWith('user-1', 'b', ['botol'])
    expect(database.inserted).toEqual([
      expect.objectContaining({ task: 'asset_tags', credits: 2, input: { assetIds: ['a', 'b'], count: 2 } }),
    ])
    expect(JSON.stringify(database.inserted)).not.toContain('base64')
  })

  it('saves and charges nothing when a photo comes back without tags', async () => {
    vi.mocked(chatCompletion).mockResolvedValue('{"tags":{"a":["kopi"]}}')

    await expect(tagAssets('user-1', 'ig-1', ['a', 'b'])).rejects.toBeInstanceOf(AiOutputError)
    expect(setAssetTags).not.toHaveBeenCalled()
    expect(database.inserted).toEqual([expect.objectContaining({ status: 'failed', credits: 0 })])
  })

  it('asks nothing when none of the photos is the owner’s own', async () => {
    vi.mocked(loadOwnPhotos).mockResolvedValue([])

    await expect(tagAssets('user-1', 'ig-1', ['ai-1'])).resolves.toBe(0)
    expect(chatCompletion).not.toHaveBeenCalled()
  })
})
import { DEFAULT_CATALOG } from './billing-catalog-options'
vi.mock('./billing-catalog', () => ({ getBillingCatalog: vi.fn(async () => ({ version: 1, catalog: DEFAULT_CATALOG })) }))
