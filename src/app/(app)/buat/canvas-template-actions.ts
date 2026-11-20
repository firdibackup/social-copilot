'use server'

import { randomUUID } from 'node:crypto'
import { getLocale, getTranslations } from 'next-intl/server'
import { createAsset, InvalidImageError } from '@/lib/assets'
import { requireAccount } from '@/lib/auth'
import { archiveCanvasTemplate, CanvasTemplateError, getCanvasTemplate, listCanvasTemplates, saveCanvasTemplate } from '@/lib/canvas-templates'
import { describeError } from '@/lib/errors'
import { emptyDoc, parseLayerDoc, type LayerDoc } from '@/lib/layer-doc'
import { combineTemplateDocuments } from '@/lib/design-template'
import { clonePage } from '@/lib/design-operations'
import { STARTER_SIZES, STARTER_TEMPLATES, starterPage } from '@/lib/starter-templates'
import { DESIGN_LIMITS, parseDesignDoc, type DesignDoc } from '@/lib/design-doc'
import { isUuid } from '@/lib/params'
import { getPost } from '@/lib/posts'
import { assetSizes, deleteUnused, getSlideLayers, slideDesign } from '@/lib/slide-layers'
import { FileTooLargeError, StorageFullError } from '@/lib/storage-quota'

export async function listCanvasTemplatesAction() {
  const { userId, accountId } = await requireAccount()
  return listCanvasTemplates(userId, accountId)
}

/** A new template from one starter page, saved at once so the editor can autosave against its version. */
export async function createCanvasTemplateAction(input: { name: string; starterId: string | null; format: '4:5' | '1:1' }): Promise<{ id: string } | { error: string }> {
  const { userId, accountId } = await requireAccount()
  const t = await getTranslations('editor.layerActions')
  const name = typeof input?.name === 'string' ? input.name.trim() : ''
  if (!name || name.length > 120 || !['4:5', '1:1'].includes(input.format)
    || (input.starterId !== null && !STARTER_TEMPLATES.some(item => item.id === input.starterId))) return { error: t('invalid') }
  const size = STARTER_SIZES[input.format]
  const page = input.starterId ? clonePage(starterPage(input.starterId, input.format, 'Slide 1'), randomUUID)
    : { id: randomUUID(), name: 'Slide 1', ...size, background: { type: 'solid' as const, color: { srgb: { r: 1, g: 1, b: 1, a: 1 } } }, children: [] }
  const doc: DesignDoc = { format: 'carousely.design', schemaVersion: 1, id: randomUUID(), title: name, unit: 'px', dpi: 96,
    pages: [page], assets: [], fonts: [], meta: {} }
  try {
    const saved = await saveCanvasTemplate(userId, accountId, { id: doc.id, name, doc, previewAssetId: null, expectedVersion: null })
    return { id: saved.id }
  } catch (error) {
    console.error('[template] gagal membuat:', describeError(error))
    return { error: t('saveFailed') }
  }
}

export async function getCanvasTemplateAction(id: string) {
  const { userId, accountId } = await requireAccount()
  const t = await getTranslations('editor.layerActions')
  if (!isUuid(id)) return { error: t('invalid') }
  try {
    const template = await getCanvasTemplate(userId, accountId, id)
    return template ? { template } : { error: t('notFound') }
  } catch { return { error: t('corruptDoc') } }
}

export async function manageCanvasTemplateAction(input: { id: string; expectedVersion: string; operation: 'rename' | 'duplicate' | 'archive'; name?: string }) {
  const { userId, accountId } = await requireAccount()
  const t = await getTranslations('editor.layerActions')
  if (!input || !isUuid(input.id) || typeof input.expectedVersion !== 'string'
    || !['rename', 'duplicate', 'archive'].includes(input.operation)
    || (input.operation !== 'archive' && (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 120))) return { error: t('invalid') }
  try {
    if (input.operation === 'archive') {
      await archiveCanvasTemplate(userId, accountId, input.id, input.expectedVersion)
      return { ok: true as const }
    }
    const template = await getCanvasTemplate(userId, accountId, input.id)
    if (!template) return { error: t('notFound') }
    if (template.version !== input.expectedVersion) return { error: t('conflict') }
    const doc = input.operation === 'duplicate'
      ? combineTemplateDocuments([template.doc], input.name!.trim(), '', randomUUID) : structuredClone(template.doc)
    doc.meta = structuredClone(template.doc.meta)
    doc.title = input.name!.trim()
    const saved = await saveCanvasTemplate(userId, accountId, { id: doc.id, name: doc.title, doc,
      previewAssetId: template.previewAssetId, expectedVersion: input.operation === 'duplicate' ? null : template.version })
    return { ok: true as const, id: saved.id }
  } catch (error) {
    if (error instanceof CanvasTemplateError && error.code === 'conflict') return { error: t('conflict') }
    console.error('[template] gagal memperbarui:', describeError(error))
    return { error: t('saveFailed') }
  }
}

export async function saveTemplateDocumentAction(form: FormData): Promise<{ version: string } | { error: string; conflict?: true }> {
  const { userId, accountId } = await requireAccount()
  const t = await getTranslations('editor.layerActions')
  const locale = await getLocale()
  const id = form.get('id')
  const json = form.get('doc')
  const version = form.get('expectedVersion')
  const file = form.get('file')
  if (!isUuid(id) || typeof version !== 'string' || typeof json !== 'string' || json.length > DESIGN_LIMITS.bytes
    || !(file instanceof Blob)) return { error: t('invalid') }
  let raw: unknown
  try { raw = JSON.parse(json) } catch { return { error: t('badDoc') } }
  const parsed = parseDesignDoc(raw)
  if ('error' in parsed || parsed.doc.id !== id) return { error: t('badDoc') }
  let previewId: string | null = null
  try {
    const stored = await getCanvasTemplate(userId, accountId, id)
    if (!stored) return { error: t('notFound') }
    if (stored.version !== version) return { error: t('conflict'), conflict: true }
    const first = parsed.doc.pages[0]
    const preview = await createAsset(userId, file, first.width, first.height, { accountId, origin: 'ai', locale })
    previewId = preview.id
    const saved = await saveCanvasTemplate(userId, accountId, { id, name: parsed.doc.title, doc: parsed.doc,
      previewAssetId: preview.id, expectedVersion: version })
    previewId = null
    if (stored.previewAssetId) await deleteUnused(userId, [stored.previewAssetId])
    return { version: saved.version }
  } catch (error) {
    if (previewId) await deleteUnused(userId, [previewId])
    if (error instanceof CanvasTemplateError && error.code === 'conflict') return { error: t('conflict'), conflict: true }
    if (error instanceof StorageFullError || error instanceof FileTooLargeError || error instanceof InvalidImageError) return { error: error.message }
    console.error('[template] gagal menyimpan dokumen:', describeError(error))
    return { error: t('saveFailed') }
  }
}

/** Copy the current editable slide without replacing the post's media or losing its unsaved changes. */
export async function saveSlideTemplateAction(form: FormData): Promise<{ id: string } | { error: string }> {
  const { userId, accountId } = await requireAccount()
  const t = await getTranslations('editor.layerActions')
  const locale = await getLocale()
  const postId = form.get('postId')
  const assetId = form.get('assetId')
  const name = form.get('name')
  const json = form.get('doc')
  const file = form.get('file')
  if (!isUuid(postId) || !isUuid(assetId) || typeof name !== 'string' || !name.trim() || name.trim().length > 120
    || typeof json !== 'string' || json.length > 1_000_000 || !(file instanceof Blob)) return { error: t('invalid') }
  let raw: unknown
  try { raw = JSON.parse(json) } catch { return { error: t('badDoc') } }
  const parsed = parseLayerDoc(raw)
  if ('error' in parsed) return { error: t('badDoc') }
  const drafts = new Map<string, { doc: LayerDoc; expectedVersion: string }>()
  const draftJson = form.get('drafts')
  if (draftJson !== null) {
    if (form.get('allSlides') !== 'true' || typeof draftJson !== 'string' || draftJson.length > DESIGN_LIMITS.bytes) return { error: t('badDoc') }
    try {
      const values: unknown = JSON.parse(draftJson)
      if (!Array.isArray(values) || values.length >= DESIGN_LIMITS.pages) return { error: t('badDoc') }
      for (const value of values) {
        if (!value || !isUuid(value.assetId) || value.assetId === assetId || drafts.has(value.assetId)
          || typeof value.expectedVersion !== 'string') return { error: t('badDoc') }
        const draft = parseLayerDoc(value.doc)
        if ('error' in draft) return { error: t('badDoc') }
        drafts.set(value.assetId, { doc: draft.doc, expectedVersion: value.expectedVersion })
      }
    } catch { return { error: t('badDoc') } }
  }
  let previewId: string | null = null
  try {
    const post = await getPost(userId, postId, accountId)
    if (!post?.media.some(item => item.assetId === assetId)) return { error: t('notFound') }
    if ([...drafts.keys()].some(id => !post.media.some(item => item.assetId === id))) return { error: t('notFound') }
    const stored = await getSlideLayers(userId, assetId)
    if (stored && !stored.doc) return { error: t('corruptDoc') }
    if ((stored?.version ?? '') !== form.get('expectedVersion')) return { error: t('conflict') }
    const base = stored?.baseAssetId ?? assetId
    const size = (await assetSizes(userId, accountId, [base]))[base]
    if (!size || size.width !== parsed.doc.width || size.height !== parsed.doc.height) return { error: t('badDoc') }
    let design = slideDesign(parsed.doc, base, base, null)
    if (form.get('allSlides') === 'true') {
      if (post.media.length > DESIGN_LIMITS.pages) return { error: t('badDoc') }
      const documents: DesignDoc[] = []
      for (const media of [...post.media].sort((a, b) => a.position - b.position)) {
        if (media.assetId === assetId) { documents.push(design); continue }
        const layers = await getSlideLayers(userId, media.assetId)
        const draft = drafts.get(media.assetId)
        if (draft) {
          if (layers && !layers.doc) return { error: t('corruptDoc') }
          if ((layers?.version ?? '') !== draft.expectedVersion) return { error: t('conflict') }
          const base = layers?.baseAssetId ?? media.assetId
          const size = (await assetSizes(userId, accountId, [base]))[base]
          if (!size || size.width !== draft.doc.width || size.height !== draft.doc.height) return { error: t('badDoc') }
          documents.push(slideDesign(draft.doc, base, base, null))
          continue
        }
        if (layers) {
          if (!layers.design && !layers.doc) return { error: t('corruptDoc') }
          documents.push(layers.design ?? slideDesign(layers.doc!, layers.originalAssetId ?? layers.baseAssetId,
            layers.baseAssetId, layers.originalAssetId))
        } else documents.push(slideDesign(emptyDoc(media.width, media.height), media.assetId, media.assetId, null))
      }
      design = combineTemplateDocuments(documents, name.trim(), post.caption, randomUUID)
    } else {
      design.id = randomUUID()
      design.title = name.trim()
    }
    const preview = await createAsset(userId, file, Number(form.get('width')), Number(form.get('height')), { accountId, origin: 'ai', locale })
    previewId = preview.id
    const result = await saveCanvasTemplate(userId, accountId, { id: design.id, name, doc: design,
      previewAssetId: preview.id, expectedVersion: null })
    previewId = null
    return { id: result.id }
  } catch (error) {
    if (previewId) await deleteUnused(userId, [previewId])
    if (error instanceof StorageFullError || error instanceof FileTooLargeError || error instanceof InvalidImageError) return { error: error.message }
    if (error instanceof CanvasTemplateError) return { error: t(error.code === 'conflict' ? 'conflict' : error.code === 'invalid_media' ? 'badImage' : 'badDoc') }
    console.error('[template] gagal menyimpan:', describeError(error))
    return { error: t('saveFailed') }
  }
}
