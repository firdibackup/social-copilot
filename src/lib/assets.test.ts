import sharp from 'sharp'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dbMock, filtered } from '@/test/query-mock'
import {
  createAsset,
  createAssetGroup,
  InvalidImageError,
  listAssetLibrary,
  listProductGroups,
  loadOwnPhotos,
  loadProductImages,
  moveAssetToGroup,
  setAssetsActive,
  setAssetTags,
  updateAssetGroup,
} from './assets'
import { db } from './supabase'

vi.mock('./supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./supabase')>()),
  db: vi.fn(),
}))

vi.mock('./connection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./connection')>()),
  getConnectedAccountId: vi.fn(async () => 'ig-1'),
}))

describe('product photos for AI', () => {
  const group = {
    id: 'group-1',
    title: 'Kopi Botol',
    description: '',
    assets: [
      { id: 'a', storage_path: 'u/website.jpg', is_active: true, origin: 'website', group_position: 0 },
      { id: 'b', storage_path: 'u/paused.jpg', is_active: false, origin: 'upload', group_position: 1 },
      { id: 'c', storage_path: 'u/ai.jpg', is_active: true, origin: 'ai', group_position: 2 },
    ],
  }

  beforeEach(() => vi.mocked(db).mockReset())

  it('counts only active photos that are not AI results', async () => {
    const aiOnly = { ...group, id: 'group-2', assets: [group.assets[2]] }
    vi.mocked(db).mockReturnValue(dbMock([{ data: [group, aiOnly], error: null }]).client as never)

    expect(await listProductGroups('user-1', 'ig-1')).toEqual([{ id: 'group-1', title: 'Kopi Botol', description: '', imageCount: 1 }])
  })

  it('sends only active photos that are not AI results', async () => {
    const mock = dbMock([{ data: group, error: null }])
    const jpeg = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#000000' } }).jpeg().toBuffer()
    mock.storage.download.mockResolvedValue({ data: new Blob([new Uint8Array(jpeg)]), error: null })
    vi.mocked(db).mockReturnValue(mock.client as never)

    const images = await loadProductImages('user-1', 'group-1')

    expect(images).toHaveLength(1)
    expect(mock.storage.download.mock.calls).toEqual([['u/website.jpg']])
  })
})

const JPEG_HEADER = [0xff, 0xd8, 0xff, 0xe0]
const blob = (bytes: number[], size = bytes.length) => {
  const data = new Uint8Array(size)
  data.set(bytes)
  return new Blob([data])
}

describe('createAsset', () => {
  beforeEach(() => {
    vi.mocked(db).mockReset()
  })

  it('rejects a PNG before touching storage', async () => {
    await expect(createAsset('user-1', blob([0x89, 0x50, 0x4e, 0x47]), 1080, 1080)).rejects.toBeInstanceOf(InvalidImageError)
    expect(db).not.toHaveBeenCalled()
  })

  it('rejects a file over 8 MB', async () => {
    await expect(createAsset('user-1', blob(JPEG_HEADER, 8 * 1024 * 1024 + 1), 1080, 1080)).rejects.toThrow('8 MB')
    expect(db).not.toHaveBeenCalled()
  })

  it('rejects impossible dimensions', async () => {
    await expect(createAsset('user-1', blob(JPEG_HEADER), 0, 1080)).rejects.toBeInstanceOf(InvalidImageError)
    expect(db).not.toHaveBeenCalled()
  })

  it('stores account, origin, group and provenance metadata', async () => {
    const mock = dbMock([
      { data: { id: 'asset-1' }, error: null },
    ])
    vi.mocked(db).mockReturnValue(mock.client as never)

    const asset = await createAsset('user-1', blob(JPEG_HEADER), 1080, 1080, {
      accountId: 'ig-1',
      origin: 'website',
      groupId: 'group-1',
      groupPosition: 2,
      sourceUrl: 'https://shop.test/kopi.jpg',
      contentHash: 'a'.repeat(64),
    })

    expect(mock.chains[0].find((call) => call[0] === 'insert')?.[1]).toMatchObject({
      user_id: 'user-1',
      account_id: 'ig-1',
      origin: 'website',
      group_id: 'group-1',
      group_position: 2,
      source_url: 'https://shop.test/kopi.jpg',
      content_hash: 'a'.repeat(64),
    })
    expect(asset).toMatchObject({ id: 'asset-1', origin: 'website', groupId: 'group-1', groupPosition: 2, isActive: true })
  })
})

describe('asset library', () => {
  const row = (id: string, origin: string, groupId: string | null, isActive = true) => ({
    id,
    storage_path: `user-1/${id}.jpg`,
    width: 1080,
    height: 1350,
    origin,
    group_id: groupId,
    group_position: groupId ? 0 : null,
    is_active: isActive,
    tags: ['kopi'],
  })

  it("lists own photos apart from AI results and counts each group's photos", async () => {
    const mock = dbMock([
      { data: [row('asset-1', 'website', 'group-1', false), row('asset-2', 'upload', null)], error: null },
      { data: [row('asset-3', 'ai', null)], error: null },
      {
        data: [
          {
            id: 'group-1',
            category: 'product',
            title: 'Kopi Botol',
            description: 'Botol cokelat',
            origin: 'website',
            source_url: 'https://shop.test/',
          },
        ],
        error: null,
      },
    ])
    vi.mocked(db).mockReturnValue(mock.client as never)

    const library = await listAssetLibrary('user-1', 'ig-1')

    expect(library.groups).toEqual([
      expect.objectContaining({ title: 'Kopi Botol', sourceUrl: 'https://shop.test/', photoCount: 1 }),
    ])
    expect(library.mine.map((asset) => asset.id)).toEqual(['asset-1', 'asset-2'])
    expect(library.mine[0]).toMatchObject({ isActive: false, origin: 'website', tags: ['kopi'] })
    expect(library.ai.map((asset) => asset.id)).toEqual(['asset-3'])
    expect(mock.chains[0]).toContainEqual(['neq', 'origin', 'ai'])
    expect(mock.chains[1]).toContainEqual(['eq', 'origin', 'ai'])
    for (const chain of mock.chains) expect(filtered(chain, 'account_id', 'ig-1')).toBe(true)
  })

  it("loads the account's own photos for tagging, with their product", async () => {
    const mock = dbMock([
      { data: [{ id: 'asset-1', storage_path: 'user-1/a.jpg', asset_groups: { title: 'Kopi Botol' } }], error: null },
    ])
    vi.mocked(db).mockReturnValue(mock.client as never)

    const photos = await loadOwnPhotos('user-1', 'ig-1', ['asset-1'])

    expect(photos).toEqual([{ id: 'asset-1', bytes: expect.any(Uint8Array), product: 'Kopi Botol' }])
    expect(mock.chains[0]).toContainEqual(['in', 'id', ['asset-1']])
    expect(mock.chains[0]).toContainEqual(['neq', 'origin', 'ai'])
    expect(filtered(mock.chains[0], 'user_id', 'user-1')).toBe(true)
    expect(filtered(mock.chains[0], 'account_id', 'ig-1')).toBe(true)
  })

  it("saves tags on one of the user's photos", async () => {
    const mock = dbMock([{ data: [{ id: 'asset-1' }], error: null }])
    vi.mocked(db).mockReturnValue(mock.client as never)

    await expect(setAssetTags('user-1', 'asset-1', ['kopi'])).resolves.toBe(true)
    expect(mock.chains[0]).toContainEqual(['update', { tags: ['kopi'] }])
    expect(filtered(mock.chains[0], 'user_id', 'user-1')).toBe(true)
  })

  it('creates and edits groups through scoped writes', async () => {
    const mock = dbMock([{ data: [], error: null }])
    const rpc = vi.fn(async () => ({ data: 'group-1', error: null }))
    vi.mocked(db).mockReturnValue({ ...mock.client, rpc } as never)

    await expect(
      createAssetGroup('user-1', 'ig-1', {
        category: 'product',
        title: ' Kopi Botol ',
        description: ' Botol cokelat ',
        origin: 'website',
        sourceUrl: 'https://shop.test/',
        assetIds: ['asset-1'],
      }),
    ).resolves.toBe('group-1')
    expect(rpc).toHaveBeenCalledWith('create_asset_group', expect.objectContaining({ p_source_url: 'https://shop.test/' }))

    await updateAssetGroup('user-1', 'group-1', { category: 'product', title: 'Kopi', description: '' })
    expect(filtered(mock.chains[0], 'user_id', 'user-1')).toBe(true)
  })

  it('toggles status and moves a photo through scoped calls', async () => {
    const mock = dbMock([{ data: [{ id: 'asset-1' }, { id: 'asset-2' }], error: null }])
    const rpc = vi.fn(async () => ({ data: true, error: null }))
    vi.mocked(db).mockReturnValue({ ...mock.client, rpc } as never)

    await expect(setAssetsActive('user-1', ['asset-1', 'asset-2'], false)).resolves.toBe(2)
    expect(mock.chains[0]).toContainEqual(['in', 'id', ['asset-1', 'asset-2']])
    expect(filtered(mock.chains[0], 'user_id', 'user-1')).toBe(true)
    await expect(moveAssetToGroup('user-1', 'ig-1', 'asset-1', 'group-1')).resolves.toBe(true)
    expect(rpc).toHaveBeenCalledWith('move_asset_to_group', {
      p_user_id: 'user-1',
      p_account_id: 'ig-1',
      p_asset_id: 'asset-1',
      p_group_id: 'group-1',
    })
  })
})
