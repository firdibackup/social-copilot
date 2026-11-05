import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dbMock, filtered } from '@/test/query-mock'
import { AssetInUseError, deleteAsset } from './assets'
import { parseLayerDoc, type LayerDoc } from './layer-doc'
import { parseDesignDoc } from './design-doc'
import {
  assetSizes,
  deleteUnused,
  finishMagicLayers,
  getSlideLayers,
  LayerError,
  ownsAssets,
  resetSlideLayers,
  saveSlideLayers,
  slideDesign,
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
const VERSION = '2026-11-05T00:00:00+00:00'
const BASE = '00000000-0000-4000-8000-000000000001'

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
    const mock = answer([{ data: { doc: DOC, base_asset_id: 'base', original_asset_id: 'orig', updated_at: VERSION }, error: null }])
    expect(await getSlideLayers('user-1', 'asset-1')).toEqual({ doc: DOC, design: null, version: VERSION, baseAssetId: 'base', originalAssetId: 'orig' })
    expect(filtered(mock.chains[0], 'user_id', 'user-1')).toBe(true)
    expect(filtered(mock.chains[0], 'asset_id', 'asset-1')).toBe(true)
  })

  it('gives a null doc for one that no longer validates, and null for a flat slide', async () => {
    answer([{ data: { doc: { v: 2 }, base_asset_id: 'base', original_asset_id: null, updated_at: VERSION }, error: null }])
    expect(await getSlideLayers('user-1', 'asset-1')).toEqual({ doc: null, design: null, version: VERSION, baseAssetId: 'base', originalAssetId: null })
    answer([{ data: null, error: null }])
    expect(await getSlideLayers('user-1', 'asset-1')).toBeNull()
  })

  it('accepts JSONB key reordering but protects richer documents from the legacy editor', async () => {
    const design = slideDesign(DOC, BASE, BASE, BASE)
    const reordered = Object.fromEntries(Object.entries(design).reverse())
    answer([{ data: { doc: DOC, design_doc: reordered, base_asset_id: BASE, original_asset_id: BASE, updated_at: VERSION }, error: null }])
    expect((await getSlideLayers('user-1', BASE))?.doc).toEqual(DOC)
    design.meta = { caption: { mode: 'ai', prompt: 'Write a caption' } }
    answer([{ data: { doc: DOC, design_doc: design, base_asset_id: BASE, original_asset_id: BASE, updated_at: VERSION }, error: null }])
    expect((await getSlideLayers('user-1', BASE))?.doc).toBeNull()
  })

  it('keeps design identities stable when the original is absent and the flattened asset changes', async () => {
    const design = slideDesign(DOC, BASE, BASE, null)
    answer([{ data: { doc: DOC, design_doc: design, base_asset_id: BASE, original_asset_id: null, updated_at: VERSION }, error: null }])
    expect((await getSlideLayers('user-1', '00000000-0000-4000-8000-000000000009'))?.doc).toEqual(DOC)
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
    const mock = answer([{ data: [{ id: 'a' }], error: null }])
    expect(await ownsAssets('user-1', 'ig-1', ['a', 'b'])).toBe(false)
    expect(await ownsAssets('user-1', 'ig-1', ['a', 'a'])).toBe(true)
    expect(await ownsAssets('user-1', 'ig-1', [])).toBe(true)
    expect(filtered(mock.chains[0], 'account_id', 'ig-1')).toBe(true)
  })
})

describe('layer RPCs', () => {
  it('round-trips text and image AI fields through validation, dual save and reopen', async () => {
    const input: LayerDoc = { ...DOC, layers: [
      { id: 't1', kind: 'text', text: 'Contoh', x: 20, y: 20, w: 800, h: 100, font: 'Inter', size: 56,
        weight: 700, color: '#FFFFFF', align: 'left', lineHeight: 1.2,
        field: { kind: 'text', mode: 'ai', prompt: 'Tips usaha lokal 🙂', length: 'short' } },
      { id: 'i1', kind: 'image', assetId: BASE, role: 'logo', x: 20, y: 200, w: 200, h: 200,
        field: { kind: 'image', mode: 'ai_generate', prompt: 'Foto produk' } },
    ] }
    const parsed = parseLayerDoc(JSON.parse(JSON.stringify(input)))
    if (!('doc' in parsed)) throw new Error('Invalid fixture')
    const design = slideDesign(parsed.doc, BASE, BASE, null)
    expect(parseDesignDoc(design)).toEqual({ doc: design })
    expect(design.pages[0].children.map(node => node.data?.carousely?.field)).toEqual(input.layers.map(layer => layer.field))
    expect(design.pages[0].children[1].data?.carousely?.role).toBe('logo')
    const { rpc } = answer([], { data: [], error: null })
    await saveSlideLayers('user-1', { postId: 'p', oldAssetId: BASE, newAssetId: 'new', doc: parsed.doc, design, expectedVersion: VERSION })
    const saved = rpc.mock.calls[0] as unknown as [string, { p_doc: LayerDoc; p_design: typeof design }]
    answer([{ data: { doc: saved[1].p_doc, design_doc: saved[1].p_design, base_asset_id: BASE, original_asset_id: null, updated_at: VERSION }, error: null }])
    expect((await getSlideLayers('user-1', 'new'))?.doc).toEqual(input)
  })

  it('saves and returns the unused ids', async () => {
    const { rpc } = answer([], { data: ['old'], error: null })
    const design = slideDesign(DOC, BASE, BASE, BASE)
    expect(slideDesign(DOC, BASE, BASE, BASE)).toEqual(design)
    expect(await saveSlideLayers('user-1', { postId: 'p', oldAssetId: 'old', newAssetId: 'new', doc: DOC, design, expectedVersion: VERSION })).toEqual(['old'])
    expect(rpc).toHaveBeenCalledWith('save_slide_design', {
      p_user_id: 'user-1', p_post_id: 'p', p_old_asset_id: 'old', p_new_asset_id: 'new', p_doc: DOC,
      p_design: design, p_expected_version: VERSION,
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
