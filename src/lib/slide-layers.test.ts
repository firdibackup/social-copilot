import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dbMock, filtered } from '@/test/query-mock'
import { AssetInUseError, deleteAsset } from './assets'
import type { LayerDoc } from './layer-doc'
import {
  assetSizes,
  deleteUnused,
  finishMagicLayers,
  getSlideLayers,
  LayerError,
  ownsAssets,
  resetSlideLayers,
  saveSlideLayers,
} from './slide-layers'
import { db } from './supabase'

vi.mock('./supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./supabase')>()),
  db: vi.fn(),
}))
vi.mock('./assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./assets')>()),
  deleteAsset: vi.fn(),
}))

const DOC: LayerDoc = { v: 1, width: 1080, height: 1350, layers: [] }

function answer(results: unknown[], rpcResult: unknown = { data: null, error: null }) {
  const mock = dbMock(results)
  const rpc = vi.fn(async () => rpcResult)
  vi.mocked(db).mockReturnValue({ ...mock.client, rpc } as never)
  return { ...mock, rpc }
}

beforeEach(() => {
  vi.mocked(db).mockReset()
  vi.mocked(deleteAsset).mockReset()
})

describe('getSlideLayers', () => {
  it("reads the user's row and re-validates its doc", async () => {
    const mock = answer([{ data: { doc: DOC, base_asset_id: 'base', original_asset_id: 'orig' }, error: null }])
    expect(await getSlideLayers('user-1', 'asset-1')).toEqual({ doc: DOC, baseAssetId: 'base', originalAssetId: 'orig' })
    expect(filtered(mock.chains[0], 'user_id', 'user-1')).toBe(true)
    expect(filtered(mock.chains[0], 'asset_id', 'asset-1')).toBe(true)
  })

  it('gives a null doc for one that no longer validates, and null for a flat slide', async () => {
    answer([{ data: { doc: { v: 2 }, base_asset_id: 'base', original_asset_id: null }, error: null }])
    expect(await getSlideLayers('user-1', 'asset-1')).toEqual({ doc: null, baseAssetId: 'base', originalAssetId: null })
    answer([{ data: null, error: null }])
    expect(await getSlideLayers('user-1', 'asset-1')).toBeNull()
  })
})

describe('asset checks', () => {
  it("sizes only the account's images", async () => {
    const mock = answer([{ data: [{ id: 'a', width: 1080, height: 1350 }], error: null }])
    expect(await assetSizes('user-1', 'ig-1', ['a', 'a', 'b'])).toEqual({ a: { width: 1080, height: 1350 } })
    expect(mock.chains[0]).toContainEqual(['in', 'id', ['a', 'b']])
    expect(filtered(mock.chains[0], 'user_id', 'user-1')).toBe(true)
    expect(filtered(mock.chains[0], 'account_id', 'ig-1')).toBe(true)
  })

  it('owns only when every image is found', async () => {
    answer([{ data: [{ id: 'a' }], error: null }])
    expect(await ownsAssets('user-1', ['a', 'b'])).toBe(false)
    expect(await ownsAssets('user-1', ['a', 'a'])).toBe(true)
    expect(await ownsAssets('user-1', [])).toBe(true)
  })
})

describe('layer RPCs', () => {
  it('saves and returns the unused ids', async () => {
    const { rpc } = answer([], { data: ['old'], error: null })
    expect(await saveSlideLayers('user-1', { postId: 'p', oldAssetId: 'old', newAssetId: 'new', doc: DOC })).toEqual(['old'])
    expect(rpc).toHaveBeenCalledWith('save_slide_layers', {
      p_user_id: 'user-1', p_post_id: 'p', p_old_asset_id: 'old', p_new_asset_id: 'new', p_doc: DOC,
    })
  })

  it('maps raise codes to LayerError and keeps other errors as database errors', async () => {
    answer([], { data: null, error: { message: 'post_locked' } })
    const refusal = await resetSlideLayers('user-1', 'p', 'a').catch((error) => error)
    expect(refusal).toBeInstanceOf(LayerError)
    expect(refusal.code).toBe('post_locked')

    answer([], { data: null, error: { message: 'boom' } })
    const failure = await finishMagicLayers('user-1', { id: 'j', postId: 'p', assetId: 'a', baseAssetId: 'b', doc: DOC })
      .catch((error) => error)
    expect(failure).not.toBeInstanceOf(LayerError)
    expect(failure.message).toBe('Supabase: boom')
  })
})

describe('deleteUnused', () => {
  it('deletes each id once and swallows failures', async () => {
    vi.mocked(deleteAsset).mockRejectedValueOnce(new AssetInUseError('in use')).mockResolvedValue()
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    await deleteUnused('user-1', ['a', 'b', 'a'])
    expect(vi.mocked(deleteAsset).mock.calls).toEqual([['user-1', 'a'], ['user-1', 'b']])
    expect(log).toHaveBeenCalledTimes(1)
    log.mockRestore()
  })
})
