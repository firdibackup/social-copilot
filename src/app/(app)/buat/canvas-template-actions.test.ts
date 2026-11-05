import { beforeEach, expect, it, vi } from 'vitest'
import { createAsset } from '@/lib/assets'
import { archiveCanvasTemplate, CanvasTemplateError, getCanvasTemplate, saveCanvasTemplate } from '@/lib/canvas-templates'
import { migrateLayerDoc } from '@/lib/design-doc'
import { getPost } from '@/lib/posts'
import { assetSizes, deleteUnused, getSlideLayers } from '@/lib/slide-layers'
import { getCanvasTemplateAction, manageCanvasTemplateAction, saveSlideTemplateAction, saveTemplateDocumentAction } from './canvas-template-actions'

vi.mock('@/lib/auth', () => ({ requireAccount: async () => ({ userId: 'user', accountId: 'account' }) }))
vi.mock('next-intl/server', () => ({ getLocale: async () => 'id', getTranslations: async () => (key: string) => key }))
vi.mock('@/lib/assets', async original => ({ ...await original<typeof import('@/lib/assets')>(), createAsset: vi.fn() }))
vi.mock('@/lib/posts', () => ({ getPost: vi.fn() }))
vi.mock('@/lib/canvas-templates', async original => ({ ...await original<typeof import('@/lib/canvas-templates')>(),
  saveCanvasTemplate: vi.fn(), getCanvasTemplate: vi.fn(), archiveCanvasTemplate: vi.fn() }))
vi.mock('@/lib/slide-layers', async original => ({ ...await original<typeof import('@/lib/slide-layers')>(),
  assetSizes: vi.fn(), deleteUnused: vi.fn(), getSlideLayers: vi.fn() }))
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const doc = { v: 1, width: 1080, height: 1350, layers: [] }
function form() {
  const value = new FormData()
  for (const [key, data] of Object.entries({ postId: id(1), assetId: id(2), name: 'Contoh', doc: JSON.stringify(doc),
    expectedVersion: '', width: '1080', height: '1350' })) value.set(key, data)
  value.set('file', new Blob(['preview']))
  return value
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getPost).mockResolvedValue({ media: [{ assetId: id(2) }] } as never)
  vi.mocked(getSlideLayers).mockResolvedValue(null)
  vi.mocked(assetSizes).mockResolvedValue({ [id(2)]: { width: 1080, height: 1350 } })
  vi.mocked(createAsset).mockResolvedValue({ id: id(3) } as never)
  vi.mocked(saveCanvasTemplate).mockResolvedValue({ id: id(4), name: 'Contoh', previewAssetId: id(3), version: 'v', pages: 1 })
})

it('authorizes the post in the active account before making a template', async () => {
  vi.mocked(getPost).mockResolvedValue(null)
  expect(await saveSlideTemplateAction(form())).toEqual({ error: 'notFound' })
  expect(getPost).toHaveBeenCalledWith('user', id(1), 'account')
  expect(createAsset).not.toHaveBeenCalled()
  expect(saveCanvasTemplate).not.toHaveBeenCalled()
})

it('refuses stale source versions before storing a thumbnail', async () => {
  vi.mocked(getSlideLayers).mockResolvedValue({ doc: doc as never, design: null, version: 'new', baseAssetId: id(2), originalAssetId: null })
  expect(await saveSlideTemplateAction(form())).toEqual({ error: 'conflict' })
  expect(createAsset).not.toHaveBeenCalled()
})

it('creates an independent document and retains the preview after a successful save', async () => {
  expect(await saveSlideTemplateAction(form())).toEqual({ id: id(4) })
  expect(saveCanvasTemplate).toHaveBeenCalledWith('user', 'account', expect.objectContaining({ name: 'Contoh', previewAssetId: id(3),
    expectedVersion: null, doc: expect.objectContaining({ title: 'Contoh', pages: [expect.objectContaining({ background: { type: 'image', assetId: id(2), fit: 'stretch' } })] }) }))
  expect(deleteUnused).not.toHaveBeenCalled()
})

it('cleans the new preview when an unauthorized image prevents the save', async () => {
  vi.mocked(saveCanvasTemplate).mockRejectedValue(new CanvasTemplateError('invalid_media'))
  expect(await saveSlideTemplateAction(form())).toEqual({ error: 'badImage' })
  expect(deleteUnused).toHaveBeenCalledWith('user', [id(3)])
})

it('copies all slides in post order, preserving caption and using the current unsaved slide', async () => {
  vi.mocked(getPost).mockResolvedValue({ caption: 'Caption carousel', media: [
    { assetId: id(5), position: 1, width: 1080, height: 1080 },
    { assetId: id(2), position: 0, width: 1080, height: 1350 },
  ] } as never)
  const value = form()
  value.set('allSlides', 'true')
  expect(await saveSlideTemplateAction(value)).toEqual({ id: id(4) })
  const saved = vi.mocked(saveCanvasTemplate).mock.calls[0][2].doc
  expect(saved.pages.map(page => page.background)).toEqual([
    { type: 'image', assetId: id(2), fit: 'stretch' }, { type: 'image', assetId: id(5), fit: 'stretch' },
  ])
  expect(saved.meta.caption).toEqual({ mode: 'static', value: 'Caption carousel' })
  expect(saved.pages[1].height).toBe(1080)
})

it('refuses an unreadable other slide without creating a partial carousel', async () => {
  vi.mocked(getPost).mockResolvedValue({ caption: '', media: [{ assetId: id(2), position: 0 }, { assetId: id(5), position: 1 }] } as never)
  vi.mocked(getSlideLayers).mockResolvedValueOnce(null).mockResolvedValueOnce({ doc: null, design: null,
    baseAssetId: id(5), originalAssetId: null, version: 'v' })
  const value = form()
  value.set('allSlides', 'true')
  expect(await saveSlideTemplateAction(value)).toEqual({ error: 'corruptDoc' })
  expect(createAsset).not.toHaveBeenCalled()
})

it('scopes template reads and preserves AI caption settings on duplication', async () => {
  const design = migrateLayerDoc(doc as never, { id: id(4), pageId: id(6), nodeIds: [] }, id(2))
  design.meta.caption = { mode: 'ai', prompt: 'Caption untuk usaha lokal' }
  vi.mocked(getCanvasTemplate).mockResolvedValue({ id: id(4), name: 'Contoh', previewAssetId: id(3), version: 'v', pages: 1, doc: design })
  expect(await getCanvasTemplateAction(id(4))).toHaveProperty('template')
  expect(getCanvasTemplate).toHaveBeenCalledWith('user', 'account', id(4))
  expect(await manageCanvasTemplateAction({ id: id(4), expectedVersion: 'v', operation: 'duplicate', name: 'Salinan' })).toHaveProperty('ok', true)
  const input = vi.mocked(saveCanvasTemplate).mock.calls[0][2]
  expect(input.id).not.toBe(design.id)
  expect(input.doc.pages[0].id).not.toBe(design.pages[0].id)
  expect(input.doc.meta).toEqual(design.meta)
  expect(input.expectedVersion).toBeNull()
})

it('rejects stale rename and forwards archive ownership and version', async () => {
  vi.mocked(getCanvasTemplate).mockResolvedValue({ id: id(4), name: 'Contoh', previewAssetId: id(3), version: 'new', pages: 1, doc: {} as never })
  expect(await manageCanvasTemplateAction({ id: id(4), expectedVersion: 'old', operation: 'rename', name: 'Baru' })).toEqual({ error: 'conflict' })
  expect(saveCanvasTemplate).not.toHaveBeenCalled()
  vi.mocked(archiveCanvasTemplate).mockResolvedValue()
  expect(await manageCanvasTemplateAction({ id: id(4), expectedVersion: 'new', operation: 'archive' })).toEqual({ ok: true })
  expect(archiveCanvasTemplate).toHaveBeenCalledWith('user', 'account', id(4), 'new')
})

it('saves native documents with a new preview and removes only the unused prior preview', async () => {
  const design = migrateLayerDoc(doc as never, { id: id(4), pageId: id(6), nodeIds: [] }, id(2))
  design.title = 'Native template'
  vi.mocked(getCanvasTemplate).mockResolvedValue({ id: id(4), name: 'Contoh', previewAssetId: id(7), version: 'v', pages: 1, doc: design })
  const value = form()
  value.set('id', id(4)); value.set('doc', JSON.stringify(design)); value.set('expectedVersion', 'v')
  expect(await saveTemplateDocumentAction(value)).toEqual({ version: 'v' })
  expect(saveCanvasTemplate).toHaveBeenCalledWith('user', 'account', expect.objectContaining({ doc: design, expectedVersion: 'v' }))
  expect(deleteUnused).toHaveBeenCalledWith('user', [id(7)])
  vi.mocked(createAsset).mockClear()
  value.set('expectedVersion', 'stale')
  expect(await saveTemplateDocumentAction(value)).toEqual({ error: 'conflict' })
  expect(createAsset).not.toHaveBeenCalled()
})

it('cleans only the uploaded native preview when the atomic save conflicts', async () => {
  const design = migrateLayerDoc(doc as never, { id: id(4), pageId: id(6), nodeIds: [] }, id(2))
  vi.mocked(getCanvasTemplate).mockResolvedValue({ id: id(4), name: 'Contoh', previewAssetId: id(7), version: 'v', pages: 1, doc: design })
  vi.mocked(saveCanvasTemplate).mockRejectedValue(new CanvasTemplateError('conflict'))
  const value = form()
  value.set('id', id(4)); value.set('doc', JSON.stringify(design)); value.set('expectedVersion', 'v')
  expect(await saveTemplateDocumentAction(value)).toEqual({ error: 'conflict' })
  expect(deleteUnused).toHaveBeenCalledExactlyOnceWith('user', [id(3)])
})

it('copies versioned drafts for other slides and refuses stale, foreign and duplicate draft entries', async () => {
  vi.mocked(getPost).mockResolvedValue({ caption: 'Carousel', media: [
    { assetId: id(2), position: 0 }, { assetId: id(5), position: 1 },
  ] } as never)
  vi.mocked(assetSizes).mockResolvedValue({ [id(2)]: { width: 1080, height: 1350 }, [id(5)]: { width: 1080, height: 1350 } })
  const draft = { assetId: id(5), expectedVersion: '', doc: { ...doc, layers: [{ id: 'text', kind: 'text',
    text: 'Draft slide lain', x: 80, y: 120, w: 800, h: 100, font: 'Inter', size: 56, weight: 700,
    color: '#ffffff', align: 'left', lineHeight: 1.2 }] } }
  const value = form()
  value.set('allSlides', 'true')
  value.set('drafts', JSON.stringify([draft]))
  expect(await saveSlideTemplateAction(value)).toEqual({ id: id(4) })
  expect(vi.mocked(saveCanvasTemplate).mock.calls[0][2].doc.pages[1].children[0]).toMatchObject({ content: [{ runs: [{ text: 'Draft slide lain' }] }] })
  vi.mocked(createAsset).mockClear()
  for (const [drafts, error] of [
    [[{ ...draft, expectedVersion: 'stale' }], 'conflict'],
    [[{ ...draft, assetId: id(99) }], 'notFound'],
    [[draft, draft], 'badDoc'],
    [[{ ...draft, doc: { ...draft.doc, height: 1080 } }], 'badDoc'],
  ] as const) {
    value.set('drafts', JSON.stringify(drafts))
    expect(await saveSlideTemplateAction(value)).toEqual({ error })
  }
  expect(createAsset).not.toHaveBeenCalled()
})
