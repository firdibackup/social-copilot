import sharp from 'sharp'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dbMock, filtered } from '@/test/query-mock'
import {
  addReference,
  deleteReference,
  getBrandKit,
  hasBrandKit,
  listReferences,
  loadReferenceImage,
  loadVisualReferences,
  ReferenceLimitError,
  startBrandSync,
  updateBrandKit,
} from './brand'
import { db } from './supabase'

vi.mock('./supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./supabase')>()),
  db: vi.fn(),
}))
vi.mock('./connection', () => ({ getConnectedAccountId: vi.fn() }))

const JPEG = { bytes: new Uint8Array([0xff, 0xd8, 0xff]), type: 'image/jpeg' as const }
const NEW = { source: 'instagram' as const, sourceLabel: '@kopi', permalink: null, palette: [] }

function useDb(results: unknown[]) {
  const mock = dbMock(results)
  vi.mocked(db).mockReturnValue(mock.client as never)
  return mock
}

const inserted = (chains: unknown[][][], table: string) =>
  chains.find((chain) => chain[0][1] === table && chain.some((call) => call[0] === 'insert'))?.find((call) => call[0] === 'insert')?.[1]

beforeEach(() => {
  vi.mocked(db).mockReset()
})

describe('addReference', () => {
  it('stores a carousel as one group labelled cover, isi, cta', async () => {
    const { chains, storage } = useDb([{ count: 0, error: null }, { data: { id: 'ref-1' }, error: null }, { data: null, error: null }])

    await expect(addReference('user-1', 'ig-1', { ...NEW, images: [JPEG, JPEG, JPEG] })).resolves.toBe('ref-1')

    expect(filtered(chains[0], 'account_id', 'ig-1')).toBe(true)
    expect(inserted(chains, 'brand_references')).toMatchObject({ user_id: 'user-1', account_id: 'ig-1', source: 'instagram' })
    const images = inserted(chains, 'brand_reference_images') as { position: number; label: string; reference_id: string }[]
    expect(images.map((image) => [image.position, image.label])).toEqual([
      [0, 'cover'],
      [1, 'isi'],
      [2, 'cta'],
    ])
    expect(images.every((image) => image.reference_id === 'ref-1')).toBe(true)
    expect(storage.uploads).toHaveLength(3)
  })

  it('removes the group and its files when the images fail to save', async () => {
    const { chains, storage } = useDb([
      { count: 0, error: null },
      { data: { id: 'ref-1' }, error: null },
      { data: null, error: { message: 'insert failed' } },
      { data: null, error: null },
    ])

    await expect(addReference('user-1', 'ig-1', { ...NEW, images: [JPEG, JPEG] })).rejects.toThrow('insert failed')

    expect(chains.some((chain) => chain[0][1] === 'brand_references' && chain.some((call) => call[0] === 'delete'))).toBe(true)
    expect(storage.removed).toEqual(storage.uploads)
  })

  it('counts groups against the limit', async () => {
    useDb([{ count: 30, error: null }])

    await expect(addReference('user-1', 'ig-1', { ...NEW, images: [JPEG] })).rejects.toBeInstanceOf(ReferenceLimitError)
  })
})

describe('listReferences', () => {
  it('returns the account’s groups with their images in order', async () => {
    const { chains } = useDb([
      {
        data: [
          {
            id: 'ref-1',
            source: 'instagram',
            source_label: '@kopi',
            permalink: null,
            palette: ['#112233'],
            description: '',
            note: '',
            brand_reference_images: [
              { id: 'img-2', position: 1, storage_path: 'u/b.jpg', label: 'cta' },
              { id: 'img-1', position: 0, storage_path: 'u/a.jpg', label: 'cover' },
            ],
          },
        ],
        error: null,
      },
    ])

    const [group] = await listReferences('user-1', 'ig-1')

    expect(filtered(chains[0], 'account_id', 'ig-1')).toBe(true)
    expect(group.images).toEqual([
      { id: 'img-1', url: 'https://signed/u/a.jpg', position: 0, label: 'cover' },
      { id: 'img-2', url: 'https://signed/u/b.jpg', position: 1, label: 'cta' },
    ])
  })
})

describe('loadReferenceImage', () => {
  it('sends the chosen slide small, with its label, so it always fits next to slide 1', async () => {
    const big = await sharp({ create: { width: 1080, height: 1350, channels: 3, background: { r: 200, g: 40, b: 40 } } })
      .jpeg({ quality: 95 })
      .toBuffer()
    const { storage } = useDb([
      {
        data: {
          note: '',
          brand_reference_images: [
            { position: 0, label: 'cover', storage_path: 'u/cover.jpg', content_type: 'image/jpeg' },
            { position: 1, label: 'cta', storage_path: 'u/cta.jpg', content_type: 'image/jpeg' },
          ],
        },
        error: null,
      },
    ])
    storage.download.mockResolvedValue({ data: new Blob([new Uint8Array(big)]), error: null } as never)

    const image = await loadReferenceImage('user-1', 'ref-1', { index: 3, count: 3 })

    expect(image?.label).toBe('cta')
    expect(image?.dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true)
    const { width } = await sharp(Buffer.from(image!.dataUrl.split(',')[1], 'base64')).metadata()
    expect(width).toBe(640)
  })

  it('loads the image the slide follows', async () => {
    const { storage } = useDb([
      {
        data: {
          note: 'warna',
          brand_reference_images: [
            { position: 0, label: 'cover', storage_path: 'u/cover.jpg', content_type: 'image/jpeg' },
            { position: 1, label: 'isi', storage_path: 'u/isi.jpg', content_type: 'image/jpeg' },
            { position: 2, label: 'cta', storage_path: 'u/cta.jpg', content_type: 'image/jpeg' },
          ],
        },
        error: null,
      },
    ])

    const small = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#000000' } }).jpeg().toBuffer()
    storage.download.mockResolvedValue({ data: new Blob([new Uint8Array(small)]), error: null } as never)

    const image = await loadReferenceImage('user-1', 'ref-1', { index: 3, count: 3 })

    expect(storage.download).toHaveBeenCalledWith('u/cta.jpg')
    expect(image?.note).toBe('warna')
    expect(image?.dataUrl).toMatch(/^data:image\/jpeg;base64,/)
  })
})

describe('loadVisualReferences', () => {
  it('sends groups oldest first, each in slide order, so the cover leads its group', async () => {
    const images = (prefix: string) => [
      { position: 2, label: 'cta', storage_path: `${prefix}/cta.jpg`, content_type: 'image/jpeg' },
      { position: 0, label: 'cover', storage_path: `${prefix}/cover.jpg`, content_type: 'image/jpeg' },
      { position: 1, label: 'isi', storage_path: `${prefix}/isi.jpg`, content_type: 'image/jpeg' },
    ]
    useDb([
      {
        data: [
          { id: 'new', note: '', brand_reference_images: images('new') },
          { id: 'old', note: '', brand_reference_images: images('old') },
        ],
        error: null,
      },
    ])

    const { references } = await loadVisualReferences('user-1', 'ig-1')

    const decoded = references.map((reference) => Buffer.from(reference.dataUrl.split(',')[1], 'base64').toString())
    expect(decoded).toEqual(['old/cover.jpg', 'old/isi.jpg', 'old/cta.jpg', 'new/cover.jpg', 'new/isi.jpg', 'new/cta.jpg'])
  })
})

describe('deleteReference', () => {
  it('removes every image file of the group', async () => {
    const { storage } = useDb([
      { data: [{ storage_path: 'u/a.jpg' }, { storage_path: 'u/b.jpg' }], error: null },
      { data: [{ id: 'ref-1' }], error: null },
    ])

    await deleteReference('user-1', 'ref-1')

    expect(storage.removed).toEqual(['u/a.jpg', 'u/b.jpg'])
  })
})

describe('the new-account fill status', () => {
  it('tells whether the account already has a kit', async () => {
    const { chains } = useDb([{ count: 1, error: null }])

    await expect(hasBrandKit('user-1', 'ig-1')).resolves.toBe(true)
    expect(filtered(chains[0], 'account_id', 'ig-1')).toBe(true)
  })

  it('starts the fill with a running kit, once', async () => {
    const { chains } = useDb([{ data: null, error: null }])

    await expect(startBrandSync('user-1', 'ig-1')).resolves.toBe(true)
    expect(inserted(chains, 'brand_kit')).toEqual({ user_id: 'user-1', account_id: 'ig-1', sync_status: 'running' })
  })

  it('reports a fill another request already started', async () => {
    useDb([{ data: null, error: { code: '23505', message: 'duplicate key' } }])

    await expect(startBrandSync('user-1', 'ig-1')).resolves.toBe(false)
  })

  it('updates only the given fields and the status', async () => {
    const { chains } = useDb([{ data: null, error: null }])

    await updateBrandKit('user-1', 'ig-1', { name: 'Kopi', syncStatus: null })

    const update = chains[0].find((call) => call[0] === 'update')?.[1] as Record<string, unknown>
    expect(update).toMatchObject({ name: 'Kopi', sync_status: null })
    expect(update).not.toHaveProperty('voice')
    expect(filtered(chains[0], 'account_id', 'ig-1')).toBe(true)
  })

  it('shows the status on the kit', async () => {
    const updated = new Date(Date.now() - 60_000).toISOString()
    useDb([{ data: { name: 'Kopi', colors: [], logo_path: null, sync_status: 'running', updated_at: updated }, error: null }])

    await expect(getBrandKit('user-1', 'ig-1')).resolves.toMatchObject({ syncStatus: 'running' })
  })

  it('treats a fill that stopped moving as failed, e.g. after a restart', async () => {
    const updated = new Date(Date.now() - 6 * 60_000).toISOString()
    useDb([{ data: { name: 'Kopi', colors: [], logo_path: null, sync_status: 'running', updated_at: updated }, error: null }])

    await expect(getBrandKit('user-1', 'ig-1')).resolves.toMatchObject({ syncStatus: 'failed' })
  })
})
