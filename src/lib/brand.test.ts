import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dbMock, filtered } from '@/test/query-mock'
import { addReference, deleteReference, listReferences, loadReferenceImage, ReferenceLimitError } from './brand'
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

    const image = await loadReferenceImage('user-1', 'ref-1', { index: 3, count: 3 })

    expect(storage.download).toHaveBeenCalledWith('u/cta.jpg')
    expect(image?.note).toBe('warna')
    expect(image?.dataUrl).toMatch(/^data:image\/jpeg;base64,/)
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
