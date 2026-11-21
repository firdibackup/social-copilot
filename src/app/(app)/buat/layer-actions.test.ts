import { beforeEach, describe, expect, it, vi } from 'vitest'
import { refresh } from 'next/cache'
import { runLogged } from '@/lib/ai'
import { createAsset, deleteAsset, InvalidImageError, loadAssetBytes } from '@/lib/assets'
import { buildDoc, NoTextError, splitSlide, splitSubject } from '@/lib/magic-layers'
import { getPost } from '@/lib/posts'
import {
  assetSizes,
  deleteUnused,
  finishMagicLayers,
  getSlideLayers,
  LayerError,
  ownsAssets,
  resetSlideLayers,
  saveSlideLayers,
} from '@/lib/slide-layers'
import { hasSlidesInProgress } from '@/lib/slides'
import { FileTooLargeError, StorageFullError } from '@/lib/storage-quota'
import { fileTooLargeMessage, storageFullMessage } from '@/lib/storage-quota-options'
import { db } from '@/lib/supabase'
import { queryMock } from '@/test/query-mock'
import {
  loadSlideLayersAction, magicLayersAction, resetSlideLayersAction, saveSlideLayersAction, splitObjectAction, uploadLayerImageAction,
} from './layer-actions'

vi.mock('next-intl/server', async () => {
  const { createTranslator } = await import('next-intl')
  const { idMessages } = await import('@/i18n/messages')
  return {
    getLocale: async () => 'id',
    getTranslations: async (namespace: 'editor.layerActions') => createTranslator({ locale: 'id', messages: idMessages, namespace }),
  }
})
vi.mock('next/cache', () => ({ refresh: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requireAccount: vi.fn(async () => ({ userId: USER, accountId: 'ig-1' })) }))
vi.mock('@/lib/posts', () => ({ getPost: vi.fn() }))
vi.mock('@/lib/slides', () => ({ hasSlidesInProgress: vi.fn() }))
vi.mock('@/lib/ai', () => ({ runLogged: vi.fn((_user: string, _task: string, _input: unknown, ask: () => Promise<unknown>) => ask()) }))
vi.mock('@/lib/app-settings', () => ({ imageModel: vi.fn(async () => 'image-model') }))
vi.mock('@/lib/image-ai', () => ({ imageErrorMessage: vi.fn(() => 'AI gagal.') }))
vi.mock('@/lib/brand', () => ({ getBrandVisual: vi.fn(async () => null), loadLogoBytes: vi.fn() }))
vi.mock('@/lib/storage-quota', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage-quota')>()),
  hasStorageRoom: vi.fn(async () => true),
}))
vi.mock('@/lib/generation-cancellation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/generation-cancellation')>()),
  watchGeneration: vi.fn(async () => ({ signal: new AbortController().signal, check: async () => {}, stop: () => {} })),
}))
vi.mock('@/lib/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/assets')>()),
  createAsset: vi.fn(),
  deleteAsset: vi.fn(async () => {}),
  loadAssetBytes: vi.fn(),
}))
vi.mock('@/lib/magic-layers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/magic-layers')>()),
  splitSlide: vi.fn(),
  splitSubject: vi.fn(),
  buildDoc: vi.fn(),
}))
vi.mock('@/lib/slide-layers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/slide-layers')>()),
  assetSizes: vi.fn(),
  deleteUnused: vi.fn(),
  finishMagicLayers: vi.fn(),
  getSlideLayers: vi.fn(),
  ownsAssets: vi.fn(),
  resetSlideLayers: vi.fn(),
  saveSlideLayers: vi.fn(),
}))
vi.mock('@/lib/supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/supabase')>()),
  db: vi.fn(),
}))

const USER = 'user-1'
const POST = '11111111-1111-4111-8111-000000000001'
const OLD = '00000000-0000-4000-8000-000000000001'
const NEW = '00000000-0000-4000-8000-000000000002'
const LOGO = '00000000-0000-4000-8000-000000000003'
const OP = '22222222-2222-4222-8222-000000000001'
const DOC = {
  v: 1, width: 1080, height: 1350,
  layers: [{ id: 'l1', kind: 'image', assetId: LOGO, role: 'logo', x: 10, y: 10, w: 100, h: 100 }],
}
const post = (overrides = {}) => ({
  id: POST, status: 'draft', isLocked: false,
  media: [{ assetId: OLD, position: 0, url: '', width: 1080, height: 1350 }],
  ...overrides,
})

function form(doc: unknown = DOC): FormData {
  const data = new FormData()
  data.append('file', new Blob([new Uint8Array([0xff, 0xd8, 0xff])]))
  data.append('width', '1080')
  data.append('height', '1350')
  data.append('postId', POST)
  data.append('oldAssetId', OLD)
  data.append('doc', typeof doc === 'string' ? doc : JSON.stringify(doc))
  data.append('expectedVersion', '')
  return data
}

let rpc: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getPost).mockResolvedValue(post() as never)
  vi.mocked(hasSlidesInProgress).mockResolvedValue(false)
  vi.mocked(ownsAssets).mockResolvedValue(true)
  vi.mocked(getSlideLayers).mockResolvedValue(null)
  vi.mocked(assetSizes).mockResolvedValue({ [OLD]: { width: 1080, height: 1350 } })
  vi.mocked(createAsset).mockResolvedValue({ id: NEW, width: 1080, height: 1350 } as never)
  const { query } = queryMock({ data: null, error: null })
  rpc = vi.fn(async () => ({ data: true, error: null }))
  vi.mocked(db).mockReturnValue({ ...query, rpc } as never)
})

describe('saveSlideLayersAction', () => {
  it('rejects a doc that fails validation before touching anything', async () => {
    expect(await saveSlideLayersAction(form({ ...DOC, extra: 1 }))).toEqual({ error: expect.stringContaining('Data lapisan tidak valid') })
    expect(await saveSlideLayersAction(form('{'))).toEqual({ error: expect.stringContaining('Data lapisan tidak valid') })
    expect(ownsAssets).not.toHaveBeenCalled()
    expect(createAsset).not.toHaveBeenCalled()
  })

  it("rejects a doc drawing someone else's image", async () => {
    vi.mocked(ownsAssets).mockResolvedValue(false)
    expect(await saveSlideLayersAction(form())).toEqual({ error: expect.stringContaining('Gambar lapisan tidak ditemukan') })
    expect(ownsAssets).toHaveBeenCalledWith(USER, 'ig-1', [LOGO])
    expect(createAsset).not.toHaveBeenCalled()
  })

  it('rejects a locked post', async () => {
    vi.mocked(getPost).mockResolvedValue(post({ isLocked: true }) as never)
    expect(await saveSlideLayersAction(form())).toEqual({ error: expect.stringContaining('sudah diterbitkan') })
    expect(createAsset).not.toHaveBeenCalled()
  })

  it('rejects a doc not sized like its background', async () => {
    vi.mocked(assetSizes).mockResolvedValue({ [OLD]: { width: 1080, height: 1080 } })
    expect(await saveSlideLayersAction(form())).toEqual({ error: expect.stringContaining('Data lapisan tidak valid') })
    expect(createAsset).not.toHaveBeenCalled()
  })

  it('stores the flattened image, saves, then deletes what nothing uses', async () => {
    vi.mocked(saveSlideLayers).mockResolvedValue([OLD])
    expect(await saveSlideLayersAction(form())).toEqual({ assetId: NEW })
    expect(createAsset).toHaveBeenCalledWith(USER, expect.any(Blob), 1080, 1350, { accountId: 'ig-1', origin: 'ai', locale: 'id' })
    expect(saveSlideLayers).toHaveBeenCalledWith(USER, expect.objectContaining({ postId: POST, oldAssetId: OLD, newAssetId: NEW, doc: DOC,
      expectedVersion: null, design: expect.objectContaining({ format: 'carousely.design' }) }))
    expect(deleteUnused).toHaveBeenCalledWith(USER, [OLD])
    expect(refresh).toHaveBeenCalled()
  })

  it('deletes the new image when the save is refused', async () => {
    vi.mocked(saveSlideLayers).mockRejectedValue(new LayerError('post_locked'))
    expect(await saveSlideLayersAction(form())).toEqual({ error: expect.stringContaining('sudah diterbitkan') })
    expect(deleteAsset).toHaveBeenCalledWith(USER, NEW)
    expect(deleteUnused).not.toHaveBeenCalled()
  })

  it('accepts full-length AI prompts even when JSON escaping exceeds the former size limit', async () => {
    const field = { kind: 'image', mode: 'ai_generate', prompt: '\n'.repeat(2000) }
    const doc = { ...DOC, layers: Array.from({ length: 30 }, (_, index) => ({ ...DOC.layers[0], id: `l${index}`, field })) }
    expect(JSON.stringify(doc).length).toBeGreaterThan(100_000)
    vi.mocked(saveSlideLayers).mockResolvedValue([])
    expect(await saveSlideLayersAction(form(doc))).toEqual({ assetId: NEW })
    expect(saveSlideLayers).toHaveBeenCalledWith(USER, expect.objectContaining({ doc }))
  })

  it('refuses stale edits before uploading their flattened image', async () => {
    vi.mocked(getSlideLayers).mockResolvedValue({ doc: DOC as never, design: null, version: '2026-11-05T00:00:00+00:00', baseAssetId: OLD, originalAssetId: OLD })
    expect(await saveSlideLayersAction(form())).toEqual({ error: expect.stringContaining('sesi lain') })
    expect(createAsset).not.toHaveBeenCalled()
  })

  it('does not open or overwrite an unreadable stored design as empty layers', async () => {
    vi.mocked(getSlideLayers).mockResolvedValue({ doc: null, design: null, version: '2026-11-05T00:00:00+00:00', baseAssetId: OLD, originalAssetId: OLD })
    expect(await loadSlideLayersAction({ postId: POST, assetId: OLD })).toEqual({ error: expect.stringContaining('tidak dapat dibaca') })
    expect(await saveSlideLayersAction(form())).toEqual({ error: expect.stringContaining('tidak dapat dibaca') })
    expect(createAsset).not.toHaveBeenCalled()
  })

  describe('with backgroundAssetId', () => {
    const CLEANED = '00000000-0000-4000-8000-000000000007'
    const BASE = '00000000-0000-4000-8000-000000000004'
    const VERSION = '2026-11-05T00:00:00+00:00'
    const swapForm = (background: string, version = '') => {
      const data = form()
      data.set('backgroundAssetId', background)
      data.set('expectedVersion', version)
      return data
    }

    it("saves a flat slide over the new background, keeping the slide's image as the original", async () => {
      vi.mocked(assetSizes).mockResolvedValue({ [CLEANED]: { width: 1080, height: 1350 } })
      vi.mocked(saveSlideLayers).mockResolvedValue([])
      expect(await saveSlideLayersAction(swapForm(CLEANED))).toEqual({ assetId: NEW })
      expect(assetSizes).toHaveBeenCalledWith(USER, 'ig-1', [CLEANED])
      expect(saveSlideLayers).toHaveBeenCalledWith(USER, expect.objectContaining({ oldAssetId: OLD, newAssetId: NEW, baseAssetId: CLEANED }))
      const { design } = vi.mocked(saveSlideLayers).mock.calls[0][1]
      expect(JSON.stringify(design)).toContain(CLEANED)
      expect(JSON.stringify(design)).toContain(OLD)
    })

    it('replaces a layered background and deletes what the save reports unused', async () => {
      vi.mocked(getSlideLayers).mockResolvedValue({ doc: DOC as never, design: null, version: VERSION, baseAssetId: BASE, originalAssetId: OLD })
      vi.mocked(assetSizes).mockResolvedValue({ [CLEANED]: { width: 1080, height: 1350 } })
      vi.mocked(saveSlideLayers).mockResolvedValue([BASE])
      expect(await saveSlideLayersAction(swapForm(CLEANED, VERSION))).toEqual({ assetId: NEW })
      expect(saveSlideLayers).toHaveBeenCalledWith(USER, expect.objectContaining({ baseAssetId: CLEANED, expectedVersion: VERSION }))
      expect(deleteUnused).toHaveBeenCalledWith(USER, [BASE])
    })

    it("refuses a background that isn't the account's before uploading", async () => {
      vi.mocked(assetSizes).mockResolvedValue({})
      expect(await saveSlideLayersAction(swapForm(CLEANED))).toEqual({ error: expect.stringContaining('Gambar lapisan tidak ditemukan') })
      expect(createAsset).not.toHaveBeenCalled()
      expect(saveSlideLayers).not.toHaveBeenCalled()
    })

    it('refuses a background not sized like the doc, and a malformed id', async () => {
      vi.mocked(assetSizes).mockResolvedValue({ [CLEANED]: { width: 640, height: 480 } })
      expect(await saveSlideLayersAction(swapForm(CLEANED))).toEqual({ error: expect.stringContaining('Data lapisan tidak valid') })
      expect(await saveSlideLayersAction(swapForm('nope'))).toEqual({ error: expect.stringContaining('tidak valid') })
      expect(createAsset).not.toHaveBeenCalled()
    })

    it('keeps the current background when the field is absent, empty or the same id', async () => {
      vi.mocked(saveSlideLayers).mockResolvedValue([])
      expect(await saveSlideLayersAction(form())).toEqual({ assetId: NEW })
      expect(await saveSlideLayersAction(swapForm(''))).toEqual({ assetId: NEW })
      expect(await saveSlideLayersAction(swapForm(OLD))).toEqual({ assetId: NEW })
      for (const [, input] of vi.mocked(saveSlideLayers).mock.calls) expect(input).not.toHaveProperty('baseAssetId')
      expect(assetSizes).toHaveBeenCalledTimes(3)
      expect(assetSizes).toHaveBeenCalledWith(USER, 'ig-1', [OLD])
    })
  })
})

describe('magicLayersAction', () => {
  const input = { postId: POST, assetId: OLD, operationId: OP, splitObject: true }

  beforeEach(() => {
    vi.mocked(loadAssetBytes).mockResolvedValue(new Uint8Array([0xff, 0xd8, 0xff]))
    vi.mocked(buildDoc).mockReturnValue(DOC as never)
  })

  it('answers no-text without storing anything, and closes the edit job', async () => {
    vi.mocked(splitSlide).mockRejectedValue(new NoTextError())
    expect(await magicLayersAction(input)).toEqual({ error: expect.stringContaining('Tidak ada teks atau elemen') })
    expect(createAsset).not.toHaveBeenCalled()
    expect(runLogged).toHaveBeenCalledWith(USER, 'magic_layers', expect.anything(), expect.any(Function),
      expect.objectContaining({ units: 5 }))
    expect(rpc).toHaveBeenCalledWith('begin_slide_edit', expect.objectContaining({ p_id: OP }))
    expect(db().from).toHaveBeenCalledWith('slide_edit_jobs')
  })

  it('stores each graphic crop as a layer image and places it at its box', async () => {
    const crop = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1])
    const shape = { x: 10, y: 20, w: 300, h: 60, shape: 'rect' as const, color: '#FF5A36', radius: 30 }
    vi.mocked(splitSlide).mockResolvedValue({
      background: new Uint8Array([0xff, 0xd8, 0xff]), blocks: [], object: null, log: {},
      images: [{ kind: 'icon', bytes: crop, x: 40, y: 50, w: 120, h: 90 }],
      shapes: [shape],
    })
    vi.mocked(createAsset)
      .mockResolvedValueOnce({ id: NEW, width: 1080, height: 1350 } as never)
      .mockResolvedValueOnce({ id: LOGO, width: 120, height: 90 } as never)
    vi.mocked(finishMagicLayers).mockResolvedValue()
    expect(await magicLayersAction({ ...input, splitObject: false })).toEqual({ ok: true, notice: null })
    expect(createAsset).toHaveBeenCalledTimes(2)
    expect(createAsset).toHaveBeenNthCalledWith(2, USER, expect.any(Blob), 120, 90, expect.objectContaining({ layer: true, origin: 'ai', enforceQuota: false }))
    const stored = vi.mocked(createAsset).mock.calls[1][1] as Blob
    expect(new Uint8Array(await stored.arrayBuffer())).toEqual(crop)
    expect(buildDoc).toHaveBeenCalledWith(1080, 1350, [], expect.anything(), null, {
      images: [{ kind: 'icon', assetId: LOGO, x: 40, y: 50, w: 120, h: 90 }],
      shapes: [shape],
      labels: { photo: 'Foto', icon: 'Ikon', logo: 'Logo', illustration: 'Ilustrasi' },
    })
    expect(finishMagicLayers).toHaveBeenCalledWith(USER, expect.objectContaining({ baseAssetId: NEW }))
  })

  it('places real layers from the crops it stored', async () => {
    const { buildDoc: realBuildDoc } = await vi.importActual<typeof import('@/lib/magic-layers')>('@/lib/magic-layers')
    vi.mocked(buildDoc).mockImplementation(realBuildDoc)
    vi.mocked(splitSlide).mockResolvedValue({
      background: new Uint8Array([0xff, 0xd8, 0xff]), blocks: [], object: null, log: {},
      images: [{ kind: 'logo', bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]), x: 40, y: 50, w: 120, h: 90 }],
      shapes: [],
    })
    vi.mocked(createAsset)
      .mockResolvedValueOnce({ id: NEW, width: 1080, height: 1350 } as never)
      .mockResolvedValueOnce({ id: LOGO, width: 120, height: 90 } as never)
    vi.mocked(finishMagicLayers).mockResolvedValue()
    expect(await magicLayersAction({ ...input, splitObject: false })).toEqual({ ok: true, notice: null })
    expect(finishMagicLayers).toHaveBeenCalledWith(USER, expect.objectContaining({
      doc: { v: 1, width: 1080, height: 1350, layers: [{ id: 'i1', kind: 'image', role: 'object', assetId: LOGO, name: 'Logo 1', x: 40, y: 50, w: 120, h: 90 }] },
    }))
  })

  it('deletes the layer images it stored when finishing fails', async () => {
    vi.mocked(splitSlide).mockResolvedValue({
      background: new Uint8Array([0xff, 0xd8, 0xff]), blocks: [], images: [], shapes: [], object: null, log: {},
    })
    vi.mocked(finishMagicLayers).mockRejectedValue(new LayerError('layers_exist'))
    expect(await magicLayersAction(input)).toEqual({ error: expect.stringContaining('sudah punya lapisan') })
    expect(createAsset).toHaveBeenCalledWith(USER, expect.any(Blob), 1080, 1350, expect.objectContaining({ layer: true, enforceQuota: false }))
    expect(deleteAsset).toHaveBeenCalledWith(USER, NEW)
  })

  it('finishes and notes a missing object', async () => {
    vi.mocked(splitSlide).mockResolvedValue({
      background: new Uint8Array([0xff, 0xd8, 0xff]), blocks: [], images: [], shapes: [], object: null, log: {},
    })
    vi.mocked(finishMagicLayers).mockResolvedValue()
    expect(await magicLayersAction(input)).toEqual({ ok: true, notice: expect.stringContaining('Objek utama tidak ditemukan') })
    expect(finishMagicLayers).toHaveBeenCalledWith(USER, { id: OP, postId: POST, assetId: OLD, baseAssetId: NEW, doc: DOC })
    expect(deleteAsset).not.toHaveBeenCalled()
    expect(refresh).toHaveBeenCalled()
  })

  it('refuses a slide that already has layers before charging', async () => {
    vi.mocked(getSlideLayers).mockResolvedValue({ doc: null, design: null, version: '2026-11-05T00:00:00+00:00', baseAssetId: OLD, originalAssetId: OLD })
    expect(await magicLayersAction(input)).toEqual({ error: expect.stringContaining('sudah punya lapisan') })
    expect(runLogged).not.toHaveBeenCalled()
  })
})

describe('splitObjectAction', () => {
  const BASE = '00000000-0000-4000-8000-000000000004'
  const LAYER = '00000000-0000-4000-8000-000000000005'
  const OBJECT = '00000000-0000-4000-8000-000000000006'
  const CLEANED = '00000000-0000-4000-8000-000000000007'
  const input = { postId: POST, assetId: OLD, operationId: OP, source: { kind: 'background' as const } }
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1])
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 2])
  const found = { object: { png, box: { x: 30, y: 40, w: 200, h: 300 } }, cleaned: jpeg, log: { objectFound: true } }
  const layered = { doc: DOC as never, design: null, version: '2026-11-05T00:00:00+00:00', baseAssetId: BASE, originalAssetId: OLD }

  beforeEach(() => {
    vi.mocked(loadAssetBytes).mockResolvedValue(new Uint8Array([0xff, 0xd8, 0xff]))
    vi.mocked(createAsset)
      .mockResolvedValueOnce({ id: OBJECT, width: 200, height: 300 } as never)
      .mockResolvedValueOnce({ id: CLEANED, width: 1080, height: 1350 } as never)
    // Closing the edit job finds it still running.
    const { query } = queryMock({ data: [{ id: OP }], error: null })
    vi.mocked(db).mockReturnValue({ ...query, rpc } as never)
  })

  it("splits a flat slide's own image, stores both images and charges 4 units", async () => {
    vi.mocked(assetSizes).mockResolvedValue({ [OLD]: { width: 1080, height: 1350 } })
    vi.mocked(splitSubject).mockResolvedValue(found)
    expect(await splitObjectAction(input)).toEqual({
      object: { assetId: OBJECT, width: 200, height: 300, box: { x: 30, y: 40, w: 200, h: 300 } },
      cleaned: { assetId: CLEANED, width: 1080, height: 1350 },
    })
    expect(runLogged).toHaveBeenCalledWith(USER, 'magic_layers', expect.objectContaining({ source: 'background', sourceAssetId: OLD }),
      expect.any(Function), expect.objectContaining({ units: 4 }))
    expect(loadAssetBytes).toHaveBeenCalledWith(USER, OLD)
    expect(splitSubject).toHaveBeenCalledWith({ bytes: expect.any(Uint8Array), width: 1080, height: 1350 }, expect.anything())
    expect(createAsset).toHaveBeenNthCalledWith(1, USER, expect.any(Blob), 200, 300, expect.objectContaining({ layer: true, origin: 'ai', enforceQuota: false }))
    expect(createAsset).toHaveBeenNthCalledWith(2, USER, expect.any(Blob), 1080, 1350, expect.objectContaining({ layer: true, origin: 'ai', enforceQuota: false }))
    expect(new Uint8Array(await (vi.mocked(createAsset).mock.calls[0][1] as Blob).arrayBuffer())).toEqual(png)
    expect(new Uint8Array(await (vi.mocked(createAsset).mock.calls[1][1] as Blob).arrayBuffer())).toEqual(jpeg)
    expect(rpc).toHaveBeenCalledWith('begin_slide_edit', expect.objectContaining({ p_id: OP }))
    expect(deleteAsset).not.toHaveBeenCalled()
    expect(saveSlideLayers).not.toHaveBeenCalled()
  })

  it("splits the layers' clean background, not the slide image", async () => {
    vi.mocked(getSlideLayers).mockResolvedValue(layered)
    vi.mocked(assetSizes).mockResolvedValue({ [BASE]: { width: 1080, height: 1350 } })
    vi.mocked(splitSubject).mockResolvedValue(found)
    expect(await splitObjectAction(input)).toMatchObject({ cleaned: { assetId: CLEANED } })
    expect(assetSizes).toHaveBeenCalledWith(USER, 'ig-1', [BASE])
    expect(loadAssetBytes).toHaveBeenCalledWith(USER, BASE)
  })

  it("splits an image layer at its own natural size, once it is the account's", async () => {
    vi.mocked(getSlideLayers).mockResolvedValue(layered)
    vi.mocked(assetSizes).mockResolvedValue({ [LAYER]: { width: 640, height: 480 } })
    vi.mocked(splitSubject).mockResolvedValue(found)
    const result = await splitObjectAction({ ...input, source: { kind: 'layer', layerAssetId: LAYER } })
    expect(result).toMatchObject({ cleaned: { assetId: CLEANED, width: 640, height: 480 } })
    expect(assetSizes).toHaveBeenCalledWith(USER, 'ig-1', [LAYER])
    expect(splitSubject).toHaveBeenCalledWith({ bytes: expect.any(Uint8Array), width: 640, height: 480 }, expect.anything())
    expect(createAsset).toHaveBeenNthCalledWith(2, USER, expect.any(Blob), 640, 480, expect.anything())
  })

  it("refuses someone else's layer image before charging", async () => {
    vi.mocked(assetSizes).mockResolvedValue({})
    expect(await splitObjectAction({ ...input, source: { kind: 'layer', layerAssetId: LAYER } }))
      .toEqual({ error: expect.stringContaining('Gambar lapisan ini tidak ditemukan') })
    expect(runLogged).not.toHaveBeenCalled()
    expect(loadAssetBytes).not.toHaveBeenCalled()
  })

  it('refuses an invalid source and a slide of another post', async () => {
    expect(await splitObjectAction({ ...input, source: { kind: 'layer', layerAssetId: 'nope' } })).toEqual({ error: expect.stringContaining('tidak valid') })
    expect(await splitObjectAction({ ...input, source: { kind: 'other' } as never })).toEqual({ error: expect.stringContaining('tidak valid') })
    vi.mocked(getPost).mockResolvedValue(post({ media: [] }) as never)
    expect(await splitObjectAction(input)).toEqual({ error: expect.stringContaining('Slide tidak ditemukan') })
    vi.mocked(getPost).mockResolvedValue(post({ isLocked: true }) as never)
    expect(await splitObjectAction(input)).toEqual({ error: expect.stringContaining('sudah diterbitkan') })
    expect(runLogged).not.toHaveBeenCalled()
  })

  it('refunds and stores nothing when there is no main subject', async () => {
    vi.mocked(assetSizes).mockResolvedValue({ [OLD]: { width: 1080, height: 1350 } })
    vi.mocked(splitSubject).mockResolvedValue({ object: null, cleaned: jpeg, log: {} })
    expect(await splitObjectAction(input)).toEqual({ error: expect.stringContaining('Tidak ada objek utama') })
    // The error came out of runLogged's own callback, so runLogged released the reservation.
    await expect(vi.mocked(runLogged).mock.results[0].value).rejects.toThrow()
    expect(createAsset).not.toHaveBeenCalled()
    expect(db().from).toHaveBeenCalledWith('slide_edit_jobs')
  })

  it('deletes what it stored when the run was cancelled before it closed', async () => {
    vi.mocked(assetSizes).mockResolvedValue({ [OLD]: { width: 1080, height: 1350 } })
    vi.mocked(splitSubject).mockResolvedValue(found)
    const { query } = queryMock({ data: [], error: null })
    vi.mocked(db).mockReturnValue({ ...query, rpc } as never)
    expect(await splitObjectAction(input)).toEqual({ error: expect.stringContaining('Pisahkan objek dibatalkan') })
    expect(deleteAsset).toHaveBeenCalledWith(USER, OBJECT)
    expect(deleteAsset).toHaveBeenCalledWith(USER, CLEANED)
  })

  it('deletes the cut-out when storing the cleaned image fails', async () => {
    vi.mocked(assetSizes).mockResolvedValue({ [OLD]: { width: 1080, height: 1350 } })
    vi.mocked(splitSubject).mockResolvedValue(found)
    vi.mocked(createAsset).mockReset()
      .mockResolvedValueOnce({ id: OBJECT, width: 200, height: 300 } as never)
      .mockRejectedValueOnce(new FileTooLargeError('id'))
    expect(await splitObjectAction(input)).toEqual({ error: fileTooLargeMessage('id') })
    expect(deleteAsset).toHaveBeenCalledWith(USER, OBJECT)
  })
})

describe('resetSlideLayersAction', () => {
  it('resets and deletes what nothing uses', async () => {
    vi.mocked(resetSlideLayers).mockResolvedValue([NEW])
    expect(await resetSlideLayersAction({ postId: POST, assetId: NEW })).toBeNull()
    expect(resetSlideLayers).toHaveBeenCalledWith(USER, POST, NEW)
    expect(deleteUnused).toHaveBeenCalledWith(USER, [NEW])
    expect(refresh).toHaveBeenCalled()
  })

  it('explains a missing original', async () => {
    vi.mocked(resetSlideLayers).mockRejectedValue(new LayerError('original_missing'))
    expect(await resetSlideLayersAction({ postId: POST, assetId: NEW })).toContain('Gambar asli sudah tidak ada')
    expect(refresh).not.toHaveBeenCalled()
  })
})

describe('uploadLayerImageAction', () => {
  function upload(file: unknown = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])])): FormData {
    const data = new FormData()
    if (file) data.append('file', file as Blob)
    data.append('width', '640')
    data.append('height', '480')
    return data
  }

  it("stores the owner's image as an upload-origin layer", async () => {
    vi.mocked(createAsset).mockResolvedValue({ id: NEW, width: 640, height: 480 } as never)
    expect(await uploadLayerImageAction(upload())).toEqual({ assetId: NEW, width: 640, height: 480 })
    expect(createAsset).toHaveBeenCalledWith(USER, expect.any(Blob), 640, 480,
      { accountId: 'ig-1', origin: 'upload', layer: true, locale: 'id' })
  })

  it('refuses a form without a file', async () => {
    expect(await uploadLayerImageAction(upload(null))).toEqual({ error: expect.any(String) })
    expect(createAsset).not.toHaveBeenCalled()
  })

  it('explains storage, size and image errors, and hides anything else', async () => {
    vi.mocked(createAsset).mockRejectedValueOnce(new StorageFullError('id'))
    expect(await uploadLayerImageAction(upload())).toEqual({ error: storageFullMessage('id') })
    vi.mocked(createAsset).mockRejectedValueOnce(new FileTooLargeError('id'))
    expect(await uploadLayerImageAction(upload())).toEqual({ error: fileTooLargeMessage('id') })
    vi.mocked(createAsset).mockRejectedValueOnce(new InvalidImageError('Bukan gambar.'))
    expect(await uploadLayerImageAction(upload())).toEqual({ error: 'Bukan gambar.' })
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(createAsset).mockRejectedValueOnce(new Error('Supabase Storage: secret detail'))
    expect(await uploadLayerImageAction(upload())).toEqual({ error: 'Gambar gagal diunggah. Coba lagi.' })
    errors.mockRestore()
  })
})
