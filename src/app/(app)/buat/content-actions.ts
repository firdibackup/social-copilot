'use server'

import { refresh } from 'next/cache'
import { aiErrorMessage, loadBrandContext, runLogged } from '@/lib/ai'
import { createAsset, loadAssetBytes } from '@/lib/assets'
import { requireAccount } from '@/lib/auth'
import { lengthOf } from '@/lib/brand-options'
import { CAPTION_MAX_LENGTH } from '@/lib/caption'
import { editCaption, planContent, reviseSlide, suggestIdeas } from '@/lib/content-ai'
import { parseContentRequest, parseInstruction } from '@/lib/content-options'
import { describeError } from '@/lib/errors'
import { addIdeas, deleteIdea, recentTitles } from '@/lib/ideas'
import { drawImage, imageErrorMessage, imageLog, type DrawnImage } from '@/lib/image-ai'
import type { ImageFormat } from '@/lib/image-options'
import { imageModel } from '@/lib/nine-router'
import { isUuid } from '@/lib/params'
import { ContentError, createContentPost, getPost, PostLockedError, savePost, type Post } from '@/lib/posts'
import { toReferenceDataUrl, toSlideJpeg } from '@/lib/slide-image'
import {
  attachSlide,
  claimSlide,
  deleteUnfinishedSlide,
  failSlide,
  findSlideByAsset,
  hasSlidesInProgress,
  listUnfinishedSlides,
  replaceSlide,
  SlideError,
} from '@/lib/slides'

/** A message for the owner, or null when it worked. */
type ActionError = string | null

export type CreateResult = { postId: string } | { error: string }
export type CaptionResult = { caption: string } | { error: string }
export type SaveResult = { postId: string } | { error: string }

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null
const EDITABLE_STATUSES = new Set(['draft', 'scheduled', 'failed', 'cancelled'])
const MAX_MEDIA = 10
const LOCKED = 'Post ini sedang atau mungkin sudah diterbitkan, jadi isinya tidak bisa diubah.'

const isEditable = (post: Post) => EDITABLE_STATUSES.has(post.status) && !post.isLocked
/** Textareas submit CRLF; count newlines once, as the editor and Instagram do. */
const captionOf = (value: unknown) => (typeof value === 'string' ? value.replace(/\r\n/g, '\n') : '')

/**
 * A new post from a topic: one charge for the caption, the plan and every slide's image (contentCost). The draft
 * and its waiting slides are stored inside that charged request, so a failure on either side costs nothing.
 */
export async function createContentAction(input: unknown): Promise<CreateResult> {
  const { userId } = await requireAccount()
  const parsed = parseContentRequest(input)
  if ('error' in parsed) return parsed
  const { request } = parsed

  try {
    const { saved } = await planContent(userId, request, (plan) => createContentPost(userId, request, plan))
    return { postId: saved }
  } catch (error) {
    if (error instanceof ContentError) return { error: error.message }
    console.error('[buat] konten gagal dibuat:', describeError(error))
    return { error: aiErrorMessage(error) }
  }
}

/** The provider's image as an Instagram-ready JPEG in Aset. */
async function storeImage(userId: string, drawn: DrawnImage, format: ImageFormat): Promise<string> {
  const image = await toSlideJpeg(drawn.bytes, format)
  const asset = await createAsset(userId, new Blob([image.bytes.slice().buffer]), image.width, image.height)
  return asset.id
}

/**
 * Makes one waiting slide's image and puts it into the post. It was paid with the post, so it costs nothing;
 * claim_slide keeps two tabs from making it twice. Returns null when there was nothing (left) to do.
 */
export async function generateSlideAction(slideId: unknown): Promise<ActionError> {
  const { userId } = await requireAccount()
  if (!isUuid(slideId)) return 'Slide tidak ditemukan.'

  let slide
  try {
    slide = await claimSlide(userId, slideId)
  } catch (error) {
    console.error('[buat] slide gagal diambil:', describeError(error))
    return 'Database tidak bisa diakses. Coba lagi.'
  }
  if (!slide) return null
  const claimed = slide

  try {
    await runLogged(
      userId,
      'content_slide',
      { postId: claimed.postId, position: claimed.position, headline: claimed.headline, scene: claimed.scene },
      async () => {
        const [post, unfinished] = await Promise.all([
          getPost(userId, claimed.postId),
          listUnfinishedSlides(userId, claimed.postId),
        ])
        if (!post) throw new SlideError('Post tidak ditemukan.')
        const count = post.media.length + unfinished.length
        // Later slides keep slide 1's look.
        const cover = claimed.position > 0 ? post.media[0] : undefined
        const coverBytes = cover ? await loadAssetBytes(userId, cover.assetId) : null
        const drawn = await drawImage(userId, {
          headline: claimed.headline,
          scene: claimed.scene,
          format: claimed.format,
          referenceId: claimed.referenceId,
          includeLogo: claimed.includeLogo,
          previousImage: coverBytes ? await toReferenceDataUrl(coverBytes) : null,
          currentImage: null,
          slide: count > 1 ? { index: Math.min(claimed.position + 1, count), count } : null,
        })
        await attachSlide(claimed.id, await storeImage(userId, drawn, claimed.format))
        return drawn
      },
      { model: imageModel(), logOutput: imageLog },
    )
    return null
  } catch (error) {
    const message = error instanceof SlideError ? error.message : imageErrorMessage(error)
    if (!(error instanceof SlideError)) console.error('[buat] slide gagal dibuat:', describeError(error))
    await failSlide(claimed.id, message).catch((failure: unknown) =>
      console.error('[buat] status slide gagal disimpan:', describeError(failure)),
    )
    return message
  }
}

/** Drops a waiting or failed slide from the post. */
export async function deleteSlideAction(slideId: unknown): Promise<ActionError> {
  const { userId } = await requireAccount()
  if (!isUuid(slideId)) return 'Slide tidak ditemukan.'
  try {
    if (!(await deleteUnfinishedSlide(userId, slideId))) return 'Slide sedang dibuat. Tunggu sebentar.'
  } catch (error) {
    console.error('[buat] slide gagal dihapus:', describeError(error))
    return 'Slide gagal dihapus. Coba lagi.'
  }
  refresh()
  return null
}

/**
 * Remakes one slide as the owner asked: the AI rewrites its text and scene, then draws it again from its current
 * image. One charge covers both. The old photo stays in Aset.
 */
export async function editSlideAction(input: unknown): Promise<ActionError> {
  const { userId } = await requireAccount()
  const postId = isObject(input) ? input.postId : null
  const assetId = isObject(input) ? input.assetId : null
  if (!isUuid(postId) || !isUuid(assetId)) return 'Slide tidak ditemukan.'
  const instruction = parseInstruction(isObject(input) ? input.instruction : null)
  if (typeof instruction !== 'string') return instruction.error

  try {
    const post = await getPost(userId, postId)
    const index = post ? post.media.findIndex((item) => item.assetId === assetId) : -1
    if (!post || index < 0) return 'Slide tidak ditemukan. Muat ulang halaman.'
    if (!isEditable(post)) return LOCKED
    const media = post.media[index]
    const source = await findSlideByAsset(userId, assetId)
    // An uploaded photo has no prompt: it keeps its own shape, square when it isn't portrait.
    const format: ImageFormat = source?.format ?? (media.width >= media.height ? '1:1' : '4:5')
    const referenceId = source?.referenceId ?? null
    const includeLogo = source?.includeLogo ?? false

    await runLogged(
      userId,
      'slide_edit',
      { postId, assetId, instruction },
      async () => {
        const [revised, bytes] = await Promise.all([
          reviseSlide({ headline: source?.headline ?? '', scene: source?.scene ?? '' }, instruction),
          loadAssetBytes(userId, assetId),
        ])
        if (!bytes) throw new SlideError('Foto slide ini tidak ditemukan.')
        const drawn = await drawImage(userId, {
          ...revised,
          format,
          referenceId,
          includeLogo,
          previousImage: null,
          currentImage: await toReferenceDataUrl(bytes),
          slide: post.media.length > 1 ? { index: index + 1, count: post.media.length } : null,
        })
        const newAssetId = await storeImage(userId, drawn, format)
        await replaceSlide(userId, { postId, oldAssetId: assetId, newAssetId, ...revised, format, referenceId, includeLogo })
        return drawn
      },
      { model: imageModel(), logOutput: imageLog },
    )
  } catch (error) {
    if (error instanceof SlideError) return error.message
    console.error('[buat] edit slide gagal:', describeError(error))
    return imageErrorMessage(error)
  }
  return null
}

/** A caption changed as the owner asked. It only fills the editor, which saves it like typed text. */
export async function editCaptionAction(input: unknown): Promise<CaptionResult> {
  const { userId } = await requireAccount()
  const caption = captionOf(isObject(input) ? input.caption : null)
  if (lengthOf(caption) > CAPTION_MAX_LENGTH) return { error: 'Caption lebih dari 2.200 karakter.' }
  const instruction = parseInstruction(isObject(input) ? input.instruction : null)
  if (typeof instruction !== 'string') return instruction

  try {
    return { caption: await editCaption(userId, caption, instruction) }
  } catch (error) {
    console.error('[buat] edit caption gagal:', describeError(error))
    return { error: aiErrorMessage(error) }
  }
}

/** Ten new ideas from the brand kit, unlike the open ones and the newest posts. */
export async function generateIdeasAction(): Promise<ActionError> {
  const { userId, accountId } = await requireAccount()
  try {
    const brand = await loadBrandContext(userId)
    if (!brand) return 'Lengkapi Brand dulu, minimal nama dan deskripsi, supaya idenya sesuai bisnis Anda.'
    await suggestIdeas(userId, brand, await recentTitles(userId, accountId), (ideas) => addIdeas(userId, ideas))
  } catch (error) {
    console.error('[buat] ide gagal dibuat:', describeError(error))
    return aiErrorMessage(error)
  }
  refresh()
  return null
}

export async function deleteIdeaAction(id: unknown): Promise<ActionError> {
  const { userId } = await requireAccount()
  if (!isUuid(id)) return 'Ide tidak ditemukan.'
  try {
    await deleteIdea(userId, id)
  } catch (error) {
    console.error('[buat] ide gagal dihapus:', describeError(error))
    return 'Ide gagal dihapus. Coba lagi.'
  }
  refresh()
  return null
}

/**
 * The editor's autosave: caption and photo order, keeping the post's status and schedule. A post without an id is
 * a new draft from the owner's own photos.
 */
export async function saveContentAction(input: unknown): Promise<SaveResult> {
  const { userId } = await requireAccount()
  if (!isObject(input)) return { error: 'Permintaan tidak valid.' }
  const caption = captionOf(input.caption)
  const assetIds = Array.isArray(input.assetIds) ? input.assetIds.filter(isUuid) : []
  const postId = input.postId === null ? null : isUuid(input.postId) ? input.postId : undefined
  if (postId === undefined) return { error: 'Post tidak ditemukan.' }
  if (lengthOf(caption) > CAPTION_MAX_LENGTH) return { error: 'Caption lebih dari 2.200 karakter, jadi belum disimpan.' }
  if (assetIds.length > MAX_MEDIA) return { error: 'Maksimal 10 foto.' }

  try {
    if (postId === null) {
      return { postId: await savePost(userId, { id: null, caption, status: 'draft', scheduledAt: null, assetIds }) }
    }
    const post = await getPost(userId, postId)
    if (!post) return { error: 'Post tidak ditemukan.' }
    if (!isEditable(post)) return { error: LOCKED }
    if (await hasSlidesInProgress(userId, postId)) return { error: 'Tunggu semua slide selesai dibuat.' }
    const scheduled = post.status === 'scheduled'
    if (scheduled && assetIds.length === 0) {
      return { error: 'Post terjadwal butuh minimal 1 foto. Batalkan jadwalnya dulu untuk mengosongkan foto.' }
    }
    await savePost(userId, {
      id: postId,
      caption,
      status: scheduled ? 'scheduled' : 'draft',
      scheduledAt: scheduled ? post.scheduledAt : null,
      assetIds,
    })
    return { postId }
  } catch (error) {
    if (error instanceof PostLockedError) return { error: error.message }
    console.error('[buat] simpan otomatis gagal:', describeError(error))
    return { error: 'Perubahan gagal disimpan. Coba lagi.' }
  }
}
