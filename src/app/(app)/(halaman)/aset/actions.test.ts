import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AiLimitError } from '@/lib/ai'
import { tagAssets } from '@/lib/asset-ai'
import { AssetInUseError, createAsset, deleteAsset, moveAssetToGroup, setAssetsActive, setAssetTags } from '@/lib/assets'
import {
  deleteAssetsAction,
  moveAssetsAction,
  setAssetActiveAction,
  tagAssetsAction,
  updateAssetTagsAction,
  uploadAsset,
} from './actions'

vi.mock('next-intl/server', async () => {
  const { createTranslator } = await import('next-intl')
  const { idMessages } = await import('@/i18n/messages')
  return { getTranslations: async (namespace: 'brand' | 'assets') => createTranslator({ locale: 'id', messages: idMessages, namespace }) }
})
vi.mock('@/i18n/locale', () => ({ getUserLocale: async () => 'id' }))

vi.mock('next/cache', () => ({ refresh: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requireAccount: vi.fn(async () => ({ userId: 'user-1', accountId: 'ig-1' })) }))
vi.mock('@/lib/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/assets')>()),
  createAsset: vi.fn(),
  deleteAsset: vi.fn(),
  moveAssetToGroup: vi.fn(),
  setAssetsActive: vi.fn(),
  setAssetTags: vi.fn(),
}))
vi.mock('@/lib/asset-ai', () => ({ tagAssets: vi.fn() }))
vi.mock('@/lib/website-ai', () => ({ catalogWebsiteAssets: vi.fn() }))
vi.mock('@/lib/website-import', () => ({ importWebsiteAssets: vi.fn() }))

const ID_1 = '0b9c7a0e-3f43-4c2a-9a52-2f5b0d6f1e11'
const ID_2 = '1c8d6b1f-4e54-4d3b-8b63-3a6c1e7f2f22'
const GROUP = '2d7e5c2a-5f65-4e4c-9c74-4b7d2f8a3a33'
const EMPTY = { error: null, success: null }

function form(fields: Record<string, string | string[]>): FormData {
  const data = new FormData()
  for (const [name, value] of Object.entries(fields)) {
    for (const item of [value].flat()) data.append(name, item)
  }
  return data
}

beforeEach(() => vi.clearAllMocks())

describe('uploadAsset', () => {
  const asset = {
    id: ID_1,
    url: 'https://signed/a.jpg',
    width: 1080,
    height: 1350,
    origin: 'upload' as const,
    groupId: null,
    groupPosition: null,
    isActive: true,
    tags: [],
  }
  const upload = (groupId: string) => {
    const data = form({ width: '1080', height: '1350', groupId })
    data.set('file', new Blob([new Uint8Array([0xff, 0xd8, 0xff])]), 'foto.jpg')
    return data
  }

  it('puts the photo into the chosen product', async () => {
    vi.mocked(createAsset).mockResolvedValue(asset)
    vi.mocked(moveAssetToGroup).mockResolvedValue(true)

    expect(await uploadAsset(upload(GROUP))).toEqual({ asset: { ...asset, groupId: GROUP } })
    expect(moveAssetToGroup).toHaveBeenCalledWith('user-1', 'ig-1', ID_1, GROUP)
  })

  it('keeps the photo outside any product without a valid one', async () => {
    vi.mocked(createAsset).mockResolvedValue(asset)

    expect(await uploadAsset(upload(''))).toEqual({ asset })
    expect(moveAssetToGroup).not.toHaveBeenCalled()
  })
})

describe('moveAssetsAction', () => {
  it('moves every selected photo once and counts them', async () => {
    vi.mocked(moveAssetToGroup).mockResolvedValue(true)

    const result = await moveAssetsAction(EMPTY, form({ id: [ID_1, ID_2, ID_1], groupId: GROUP }))

    expect(result).toEqual({ error: null, success: '2 foto dimasukkan ke produk.' })
    expect(moveAssetToGroup).toHaveBeenCalledTimes(2)
  })

  it('refuses without a selection or a product field', async () => {
    expect((await moveAssetsAction(EMPTY, form({ groupId: GROUP }))).error).toBeTruthy()
    expect((await moveAssetsAction(EMPTY, form({ id: ID_1 }))).error).toBeTruthy()
    expect(moveAssetToGroup).not.toHaveBeenCalled()
  })
})

describe('setAssetActiveAction', () => {
  it('pauses every selected photo at once', async () => {
    vi.mocked(setAssetsActive).mockResolvedValue(2)

    const result = await setAssetActiveAction(EMPTY, form({ id: [ID_1, ID_2], active: 'false' }))

    expect(result.success).toBeTruthy()
    expect(setAssetsActive).toHaveBeenCalledWith('user-1', [ID_1, ID_2], false)
  })
})

describe('deleteAssetsAction', () => {
  it('deletes what it can and counts the photos still in a post', async () => {
    vi.mocked(deleteAsset)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new AssetInUseError('Foto ini masih dipakai di post.'))

    const result = await deleteAssetsAction(EMPTY, form({ id: [ID_1, ID_2] }))

    expect(result.error).toBe('1 foto dihapus. 1 foto masih dipakai di post dan tidak dihapus.')
  })
})

describe('updateAssetTagsAction', () => {
  it("saves the owner's tags", async () => {
    vi.mocked(setAssetTags).mockResolvedValue(true)

    expect(await updateAssetTagsAction(EMPTY, form({ id: ID_1, tags: 'Kopi, botol' }))).toEqual({
      error: null,
      success: 'Tag disimpan.',
    })
    expect(setAssetTags).toHaveBeenCalledWith('user-1', ID_1, ['kopi', 'botol'])
  })

  it('refuses a tag that is too long', async () => {
    expect((await updateAssetTagsAction(EMPTY, form({ id: ID_1, tags: 'x'.repeat(41) }))).error).toBeTruthy()
    expect(setAssetTags).not.toHaveBeenCalled()
  })
})

describe('tagAssetsAction', () => {
  it('reports how many photos got tags', async () => {
    vi.mocked(tagAssets).mockResolvedValue(2)

    expect(await tagAssetsAction(EMPTY, form({ id: [ID_1, ID_2] }))).toEqual({ error: null, success: 'Tag dibuat untuk 2 foto.' })
    expect(tagAssets).toHaveBeenCalledWith('user-1', 'ig-1', [ID_1, ID_2], 'id')
  })

  it('shows why AI could not tag', async () => {
    vi.mocked(tagAssets).mockRejectedValue(new AiLimitError('Kuota AI periode ini tidak cukup.'))

    expect((await tagAssetsAction(EMPTY, form({ id: ID_1 }))).error).toBe('Kuota AI periode ini tidak cukup.')
  })
})
