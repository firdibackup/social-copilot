'use server'

import { createHash } from 'node:crypto'
import { getLocale, getTranslations } from 'next-intl/server'
import { refresh } from 'next/cache'
import sharp from 'sharp'
import { runLogged } from '@/lib/ai'
import { imageModel } from '@/lib/app-settings'
import { createAsset, deleteAsset, InvalidImageError, loadAssetBytes } from '@/lib/assets'
import { requireAccount } from '@/lib/auth'
import { getBrandVisual, loadLogoBytes } from '@/lib/brand'
import { DEFAULT_BODY_FONT, DEFAULT_HEADING_FONT } from '@/lib/design-styles'
import { describeError } from '@/lib/errors'
import { editAttemptActive, GenerationCancelled, watchGeneration } from '@/lib/generation-cancellation'
import { imageErrorMessage } from '@/lib/image-ai'
import { docAssetIds, isFontName, parseLayerDoc, type LayerDoc } from '@/lib/layer-doc'
import { buildDoc, NoTextError, splitSlide } from '@/lib/magic-layers'
import { isUuid } from '@/lib/params'
import { getPost, type Post } from '@/lib/posts'
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
  type LayerErrorCode,
} from '@/lib/slide-layers'
import { hasSlidesInProgress } from '@/lib/slides'
import { FileTooLargeError, hasStorageRoom, StorageFullError } from '@/lib/storage-quota'
import { fileTooLargeMessage, storageFullMessage } from '@/lib/storage-quota-options'
import { db, unwrap } from '@/lib/supabase'

/** A message for the owner, or null when it worked. */
type ActionError = string | null

type Translate = Awaited<ReturnType<typeof getTranslations<'editor.layerActions'>>>

const EDITABLE_STATUSES = new Set(['draft', 'scheduled', 'failed', 'cancelled'])
const isEditable = (post: Post) => EDITABLE_STATUSES.has(post.status) && !post.isLocked
/** The logo layer's longest side; a logo never needs more on a 1080 px slide. */
const LOGO_MAX_SIDE = 1080

const MESSAGE_OF: Record<LayerErrorCode, Parameters<Translate>[0]> = {
  post_locked: 'locked',
  invalid_media: 'badImage',
  slide_not_found: 'notFound',
  layers_not_found: 'notFound',
  original_missing: 'noOriginal',
  layers_exist: 'alreadyLayered',
  generation_cancelled: 'cancelled',
  conflict: 'conflict',
  invalid_document: 'badDoc',
}

const cleanUp = (userId: string, ids: string[]) => Promise.all(ids.map((id) => deleteAsset(userId, id)
  .catch((failure) => console.error('[lapisan] gambar sementara gagal dibersihkan:', describeError(failure)))))

/** What the editor opens with. `layers` is null for a flat slide: the editor starts an empty doc over the image itself. */
export type LoadLayersResult =
  | {
    layers: {
      doc: LayerDoc
      version: string
      /** The clean background the doc is drawn over. */
      baseAssetId: string
      /** "Kembalikan ke asli" is offered. */
      hasOriginal: boolean
      /** Made by Lapisan ajaib (its background differs from the original): "Hasil kurang rapi" is offered. */
      fromMagic: boolean
    } | null
    /** Natural sizes of every image the doc draws (and of the background), by asset id. */
    sizes: Record<string, { width: number; height: number }>
    /** The post can't be changed: the editor opens read-only. */
    readOnly: boolean
  }
  | { error: string }

export async function loadSlideLayersAction(input: { postId: string; assetId: string }): Promise<LoadLayersResult> {
  const t = await getTranslations('editor.layerActions')
  const { userId, accountId } = await requireAccount()
  const { postId, assetId } = input ?? {}
  if (!isUuid(postId) || !isUuid(assetId)) return { error: t('invalid') }
  try {
    const post = await getPost(userId, postId, accountId)
    if (!post?.media.some((item) => item.assetId === assetId)) return { error: t('notFound') }
    const readOnly = !isEditable(post) || (await hasSlidesInProgress(userId, postId))
    const layers = await getSlideLayers(userId, assetId)
    const sizes = await assetSizes(userId, accountId,
      [assetId, ...(layers ? [layers.baseAssetId, ...(layers.doc ? docAssetIds(layers.doc) : [])] : [])])
    if (!layers) return { layers: null, sizes, readOnly }
    if (!layers.doc) return { error: t('corruptDoc') }
    const base = sizes[layers.baseAssetId]
    if (!base) return { error: t('notFound') }
    return {
      layers: {
        doc: layers.doc,
        version: layers.version,
        baseAssetId: layers.baseAssetId,
        hasOriginal: layers.originalAssetId !== null,
        fromMagic: layers.baseAssetId !== layers.originalAssetId,
      },
      sizes,
      readOnly,
    }
  } catch (error) {
    console.error('[lapisan] lapisan gagal dimuat:', describeError(error))
    return { error: t('loadFailed') }
  }
}

/**
 * Simpan: FormData with `file` (the flattened JPEG from toInstagramJpeg), `width`, `height`, `postId`, `oldAssetId`
 * and `doc` (JSON of a LayerDoc). Free. The slide shows the new image afterwards.
 */
export async function saveSlideLayersAction(formData: FormData): Promise<{ assetId: string } | { error: string }> {
  const t = await getTranslations('editor.layerActions')
  const locale = await getLocale()
  const { userId, accountId } = await requireAccount()
  const file = formData.get('file')
  const postId = formData.get('postId')
  const oldAssetId = formData.get('oldAssetId')
  if (!(file instanceof Blob) || !isUuid(postId) || !isUuid(oldAssetId)) return { error: t('invalid') }
  let raw: unknown
  const json = formData.get('doc')
  // Thirty text layers can each carry a 2,000-character prompt, including JSON escapes.
  if (typeof json !== 'string' || json.length > 1_000_000) return { error: t('badDoc') }
  try { raw = JSON.parse(json) } catch { return { error: t('badDoc') } }
  const parsed = parseLayerDoc(raw)
  if ('error' in parsed) return { error: t('badDoc') }
  const { doc } = parsed
  const versionValue = formData.get('expectedVersion')
  if (typeof versionValue !== 'string' || (versionValue !== '' && !/^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/.test(versionValue))) return { error: t('invalid') }
  const expectedVersion = versionValue || null

  let newAssetId: string | null = null
  try {
    if (!(await ownsAssets(userId, accountId, docAssetIds(doc)))) return { error: t('badImage') }
    const post = await getPost(userId, postId, accountId)
    if (!post?.media.some((item) => item.assetId === oldAssetId)) return { error: t('notFound') }
    if (!isEditable(post)) return { error: t('locked') }
    if (await hasSlidesInProgress(userId, postId)) return { error: t('busy') }
    // The doc is drawn over the slide's background: its existing one, or the flat image itself.
    const stored = await getSlideLayers(userId, oldAssetId)
    if (stored && !stored.doc) return { error: t('corruptDoc') }
    if ((stored?.version ?? null) !== expectedVersion) return { error: t('conflict') }
    const background = stored?.baseAssetId ?? oldAssetId
    const size = (await assetSizes(userId, accountId, [background]))[background]
    if (!size) return { error: t('notFound') }
    if (size.width !== doc.width || size.height !== doc.height) return { error: t('badDoc') }
    if (!(await hasStorageRoom(userId))) return { error: storageFullMessage(locale) }

    const asset = await createAsset(userId, file, Number(formData.get('width')), Number(formData.get('height')),
      { accountId, origin: 'ai', locale })
    newAssetId = asset.id
    const original = stored ? stored.originalAssetId : oldAssetId
    const design = slideDesign(doc, original ?? background, background, original)
    const unused = await saveSlideLayers(userId, { postId, oldAssetId, newAssetId, doc, design, expectedVersion })
    newAssetId = null
    await deleteUnused(userId, unused)
    refresh()
    return { assetId: asset.id }
  } catch (error) {
    if (newAssetId) await cleanUp(userId, [newAssetId])
    if (error instanceof StorageFullError) return { error: storageFullMessage(locale) }
    if (error instanceof FileTooLargeError) return { error: fileTooLargeMessage(locale) }
    // createAsset already wrote it in the owner's language.
    if (error instanceof InvalidImageError) return { error: error.message }
    if (error instanceof LayerError) return { error: t(MESSAGE_OF[error.code]) }
    console.error('[lapisan] desain gagal disimpan:', describeError(error))
    return { error: t('saveFailed') }
  }
}

/** ✨ Lapisan ajaib, inline like editSlideAction; cancel with cancelGeneration(postId, 'edit', operationId). */
export async function magicLayersAction(input: {
  postId: string
  assetId: string
  operationId: string
  splitObject: boolean
}): Promise<{ ok: true; notice: string | null } | { error: string }> {
  const t = await getTranslations('editor.layerActions')
  const locale = await getLocale()
  const { userId, accountId } = await requireAccount()
  const { postId, assetId, operationId } = input ?? {}
  const splitObject = input?.splitObject === true
  if (!isUuid(postId) || !isUuid(assetId) || !isUuid(operationId)) return { error: t('invalid') }
  if (!(await hasStorageRoom(userId))) return { error: storageFullMessage(locale) }

  let watch: Awaited<ReturnType<typeof watchGeneration>> | undefined
  let started = false
  // Layer images stored so far; they go again unless finish_magic_layers took them.
  const created: string[] = []
  try {
    const begin = await db().rpc('begin_slide_edit', {
      p_user_id: userId, p_account_id: accountId, p_post_id: postId, p_id: operationId,
    })
    if (begin.error?.message === 'post_locked') return { error: t('locked') }
    started = unwrap(begin) === true
    if (!started) return { error: t('busy') }
    watch = await watchGeneration(() => editAttemptActive(userId, operationId))
    // Checked before runLogged charges anything.
    const post = await getPost(userId, postId, accountId)
    const media = post?.media.find((item) => item.assetId === assetId)
    if (!post || !media) return { error: t('notFound') }
    if (!isEditable(post)) return { error: t('locked') }
    if (await getSlideLayers(userId, assetId)) return { error: t('alreadyLayered') }

    const result = await runLogged(
      userId,
      'magic_layers',
      { postId, assetId, splitObject },
      async () => {
        const bytes = await loadAssetBytes(userId, assetId)
        if (!bytes) throw new LayerError('slide_not_found')
        const split = await splitSlide({ bytes, width: media.width, height: media.height, splitObject }, watch!.signal)
        await watch!.check()
        // Already paid for, so past the quota too (like a slide job).
        const store = async (image: Uint8Array, width: number, height: number) => {
          const asset = await createAsset(userId, new Blob([image.slice().buffer]), width, height,
            { accountId, origin: 'ai', layer: true, enforceQuota: false, locale })
          created.push(asset.id)
          return asset.id
        }
        const baseAssetId = await store(split.background, media.width, media.height)
        let object: Parameters<typeof buildDoc>[4] = null
        if (split.object) {
          const { png, ...box } = split.object
          const meta = await sharp(png).metadata()
          object = { ...box, assetId: await store(png, meta.width, meta.height) }
        }
        const visual = await getBrandVisual(userId)
        const fonts = {
          heading: isFontName(visual?.headingFont) ? visual.headingFont : DEFAULT_HEADING_FONT,
          body: isFontName(visual?.bodyFont) ? visual.bodyFont : DEFAULT_BODY_FONT,
        }
        const doc = buildDoc(media.width, media.height, split.blocks, fonts, object)
        await watch!.check()
        await finishMagicLayers(userId, { id: operationId, postId, assetId, baseAssetId, doc })
        created.length = 0
        return split
      },
      { model: await imageModel(), units: splitObject ? 2 : 1, logOutput: (split) => split.log },
    )
    refresh()
    return { ok: true, notice: splitObject && !result.object ? t('noObject') : null }
  } catch (error) {
    await cleanUp(userId, created)
    // runLogged has refunded: the error came from inside it.
    if (error instanceof NoTextError) return { error: t('noText') }
    if (error instanceof GenerationCancelled || watch?.signal.reason instanceof GenerationCancelled) return { error: t('cancelled') }
    if (error instanceof LayerError) return { error: t(MESSAGE_OF[error.code]) }
    console.error('[lapisan] lapisan ajaib gagal:', describeError(error))
    return { error: imageErrorMessage(error) }
  } finally {
    watch?.stop()
    if (started) await db().from('slide_edit_jobs').update({ status: 'failed' }).eq('id', operationId)
      .eq('user_id', userId).eq('status', 'running')
  }
}

/** Kembalikan ke asli: the slide's image from before its layers, and the layers are gone. */
export async function resetSlideLayersAction(input: { postId: string; assetId: string }): Promise<ActionError> {
  const t = await getTranslations('editor.layerActions')
  const { userId } = await requireAccount()
  const { postId, assetId } = input ?? {}
  if (!isUuid(postId) || !isUuid(assetId)) return t('invalid')
  try {
    await deleteUnused(userId, await resetSlideLayers(userId, postId, assetId))
  } catch (error) {
    if (error instanceof LayerError) return t(MESSAGE_OF[error.code])
    console.error('[lapisan] kembali ke asli gagal:', describeError(error))
    return t('resetFailed')
  }
  refresh()
  return null
}

/** "Hasil kurang rapi". */
export async function magicFeedbackAction(input: { assetId: string }): Promise<ActionError> {
  const t = await getTranslations('editor.layerActions')
  const { userId } = await requireAccount()
  const assetId = input?.assetId
  if (!isUuid(assetId)) return t('invalid')
  try {
    unwrap(await db().from('magic_layer_feedback').insert({ user_id: userId, asset_id: assetId }))
    console.info(`[lapisan] hasil kurang rapi: user ${userId} asset ${assetId}`)
    return null
  } catch (error) {
    console.error('[lapisan] masukan gagal disimpan:', describeError(error))
    return t('feedbackFailed')
  }
}

/** The brand logo as an image the doc can draw (a PNG/JPEG copy in the media bucket), made once per logo. */
export async function logoLayerAssetAction(): Promise<{ assetId: string; width: number; height: number } | { error: string }> {
  const t = await getTranslations('editor.layerActions')
  const locale = await getLocale()
  const { userId, accountId } = await requireAccount()
  try {
    const logo = await loadLogoBytes(userId)
    if (!logo) return { error: t('noLogo') }
    // A PNG keeps the logo's transparency.
    const { data, info } = await sharp(logo).rotate()
      .resize({ width: LOGO_MAX_SIDE, height: LOGO_MAX_SIDE, fit: 'inside', withoutEnlargement: true })
      .png().toBuffer({ resolveWithObject: true })
    const contentHash = createHash('sha256').update(data).digest('hex')
    const existing = unwrap(await db().from('assets').select('id, width, height').eq('user_id', userId)
      .eq('account_id', accountId).eq('content_hash', contentHash).like('storage_path', `${userId}/layers/%`)
      .limit(1).maybeSingle()) as { id: string; width: number; height: number } | null
    if (existing) return { assetId: existing.id, width: existing.width, height: existing.height }
    const asset = await createAsset(userId, new Blob([new Uint8Array(data)]), info.width, info.height,
      { accountId, origin: 'ai', layer: true, contentHash, locale })
    return { assetId: asset.id, width: asset.width, height: asset.height }
  } catch (error) {
    if (error instanceof StorageFullError) return { error: storageFullMessage(locale) }
    if (error instanceof FileTooLargeError) return { error: fileTooLargeMessage(locale) }
    console.error('[lapisan] logo gagal disiapkan:', describeError(error))
    return { error: t('logoFailed') }
  }
}

/**
 * The owner's own image as a layer: FormData with `file` (from prepareLayerUpload: PNG or JPEG, ≤ 2 MB), `width`
 * and `height`. Stored under <user>/layers/ (never listed in Aset) with origin 'upload', so storage cleanup never
 * offers it as a disposable AI image, e.g. while only an unsaved draft of the editor uses it.
 */
export async function uploadLayerImageAction(
  formData: FormData,
): Promise<{ assetId: string; width: number; height: number } | { error: string }> {
  const t = await getTranslations('editor.layerActions')
  const locale = await getLocale()
  const { userId, accountId } = await requireAccount()
  const file = formData.get('file')
  if (!(file instanceof Blob)) return { error: t('invalid') }
  try {
    const asset = await createAsset(userId, file, Number(formData.get('width')), Number(formData.get('height')),
      { accountId, origin: 'upload', layer: true, locale })
    return { assetId: asset.id, width: asset.width, height: asset.height }
  } catch (error) {
    if (error instanceof StorageFullError) return { error: storageFullMessage(locale) }
    if (error instanceof FileTooLargeError) return { error: fileTooLargeMessage(locale) }
    // createAsset already wrote it in the owner's language.
    if (error instanceof InvalidImageError) return { error: error.message }
    console.error('[lapisan] gambar lapisan gagal diunggah:', describeError(error))
    return { error: t('uploadFailed') }
  }
}
