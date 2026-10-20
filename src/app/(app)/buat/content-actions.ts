'use server'

import { refresh } from 'next/cache'
import { aiErrorMessage, loadBrandContext, runLogged } from '@/lib/ai'
import { imageModel } from '@/lib/app-settings'
import { listProductGroups, loadAssetBytes } from '@/lib/assets'
import { readAttachment, removeAttachment, saveAttachment, type Attachment } from '@/lib/attachments'
import { requireAccount } from '@/lib/auth'
import { getBrandVisual, listReferencePool } from '@/lib/brand'
import { lengthOf, pickFirst, pickRandom, planReferenceImages, slideRoles, type SlideRole } from '@/lib/brand-options'
import { CAPTION_MAX_LENGTH } from '@/lib/caption'
import { editCaption, planContent, reviseSlide, suggestIdeas, writeScript, type ContentPlan } from '@/lib/content-ai'
import { AUTO_PRODUCT, AUTO_REFERENCE, parseContentRequest, parseInstruction, type ContentRequest } from '@/lib/content-options'
import { styleIdForBrand } from '@/lib/design-styles'
import { describeError } from '@/lib/errors'
import { addIdeas, deleteIdea, getIdea, recentTitles, saveIdeaScript } from '@/lib/ideas'
import { drawImage, imageErrorMessage, imageLog } from '@/lib/image-ai'
import type { ImageFormat } from '@/lib/image-options'
import { isUuid } from '@/lib/params'
import { parseScript, type ScriptSlide } from '@/lib/script-options'
import {
  ContentError,
  createContentPost,
  getPost,
  PostLockedError,
  savePost,
  type Post,
  type SlideReference,
} from '@/lib/posts'
import { storeSlideImage } from '@/lib/slide-generation'
import { toReferenceDataUrl } from '@/lib/slide-image'
import {
  deleteUnfinishedSlide,
  findSlideByAsset,
  hasSlidesInProgress,
  replaceSlide,
  retrySlide,
  SlideError,
} from '@/lib/slides'
import { planTemplates } from '@/lib/template-options'
import { listTemplatePool } from '@/lib/templates'

/** A message for the owner, or null when it worked. */
type ActionError = string | null

export type CreateResult = { postId: string } | { error: string }
export type CaptionResult = { caption: string } | { error: string }
export type SaveResult = { postId: string } | { error: string }
export type ScriptResult = { script: ScriptSlide[] } | { error: string }

const IDEA_GONE = 'Ide ini sudah tidak ada. Mungkin sudah dipakai atau dihapus.'

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null
const EDITABLE_STATUSES = new Set(['draft', 'scheduled', 'failed', 'cancelled'])
const MAX_MEDIA = 10
const LOCKED = 'Post ini sedang atau mungkin sudah diterbitkan, jadi isinya tidak bisa diubah.'

const isEditable = (post: Post) => EDITABLE_STATUSES.has(post.status) && !post.isLocked
/** Textareas submit CRLF; count newlines once, as the editor and Instagram do. */
const captionOf = (value: unknown) => (typeof value === 'string' ? value.replace(/\r\n/g, '\n') : '')

/**
 * A new post from a topic, and the image the owner attached to it: one charge for the caption, the plan and every
 * slide's image (contentCost). The draft and its waiting slides are stored inside that charged request, so a
 * failure on either side costs nothing.
 */
export async function createContentAction(input: unknown): Promise<CreateResult> {
  const { userId, accountId } = await requireAccount()
  const parsed = parseContentRequest(input)
  if ('error' in parsed) return parsed

  try {
    // The script is the composer's text: it sets the slides' text and how many are paid for.
    const scripted = isObject(input) && input.script != null ? parseScript(input.script) : null
    if (scripted && 'error' in scripted) return scripted
    const script = scripted?.script ?? null
    const brand = await loadBrandContext(userId)
    const pillarId = brand?.strategy?.pillars.some((pillar) => pillar.id === parsed.request.pillarId)
      ? parsed.request.pillarId
      : null
    const request = { ...parsed.request, ...(script ? { slides: script.length } : {}), pillarId }
    const attachment = await readAttachment(isObject(input) ? input.attachment : null)
    if (attachment && 'error' in attachment) return attachment
    const [references, listedProducts] = await Promise.all([
      chooseSlideReferences(userId, accountId, request),
      request.productGroupId ? listProductGroups(userId, accountId) : [],
    ])
    const products = listedProducts
      .filter((product) => request.productGroupId === AUTO_PRODUCT || product.id === request.productGroupId)
      .map(({ id, title, description }) => ({ id, title, description }))
    if (request.productGroupId && request.productGroupId !== AUTO_PRODUCT && products.length === 0) {
      throw new ContentError('Produk tidak ditemukan.')
    }
    const { saved } = await planContent(
      userId,
      request,
      (plan) => saveContent(userId, request, plan, references, attachment),
      products,
      attachment?.dataUrl ?? null,
      script,
    )
    return { postId: saved }
  } catch (error) {
    if (error instanceof ContentError) return { error: error.message }
    console.error('[buat] konten gagal dibuat:', describeError(error))
    return { error: aiErrorMessage(error) }
  }
}

/**
 * The draft, with the owner's image stored first when a slide of the plan uses it, for the slides that are made
 * later; the image is removed again when the draft can't be stored.
 */
async function saveContent(
  userId: string,
  request: ContentRequest,
  plan: ContentPlan,
  references: SlideReference[],
  attachment: Attachment | null,
): Promise<string> {
  const path = attachment && plan.slides.some((slide) => slide.attachment) ? await saveAttachment(userId, attachment) : null
  try {
    return await createContentPost(userId, request, plan, references, path)
  } catch (error) {
    if (path) {
      await removeAttachment(path).catch((failure: unknown) =>
        console.error('[buat] lampiran gagal dihapus:', describeError(failure)),
      )
    }
    throw error
  }
}

/**
 * Each planned slide's role and what it follows: a reference image (see planReferenceImages), picked at random from
 * all of the account's references on Otomatis, so posts vary, and the first of each label from a group the owner
 * picked. On Otomatis an account without references follows the admin's templates of its design style (see
 * planTemplates).
 */
async function chooseSlideReferences(userId: string, accountId: string, request: ContentRequest): Promise<SlideReference[]> {
  const roles = slideRoles(request.slides)
  if (!request.referenceId) return roles.map((role) => ({ role, referenceImageId: null, example: null }))
  const auto = request.referenceId === AUTO_REFERENCE
  const pool = await listReferencePool(userId, accountId, auto ? null : request.referenceId)
  if (!auto && pool.length === 0) throw new ContentError('Referensi brand tidak ditemukan.')
  if (pool.length === 0) {
    const examples = await planStyleTemplates(userId, roles)
    return roles.map((role, index) => ({ role, referenceImageId: null, example: examples[index] }))
  }
  const images = planReferenceImages(pool, roles, auto ? pickRandom : pickFirst)
  return roles.map((role, index) => ({ role, referenceImageId: images[index], example: null }))
}

/** Templates are a nicety: a post still gets made, from the style's recipe, when they can't be read. */
async function planStyleTemplates(userId: string, roles: (SlideRole | null)[]): Promise<(string | null)[]> {
  const none = roles.map(() => null)
  const style = styleIdForBrand(await getBrandVisual(userId))
  if (!style) return none
  try {
    return planTemplates(await listTemplatePool(style), roles, pickRandom)
  } catch (error) {
    console.error('[konten] template desain gagal dimuat, lanjut tanpa template:', describeError(error))
    return none
  }
}

/** The owner's Coba lagi: a failed slide goes back to the worker's queue. It was paid with the post. */
export async function retrySlideAction(slideId: unknown): Promise<ActionError> {
  const { userId } = await requireAccount()
  if (!isUuid(slideId)) return 'Slide tidak ditemukan.'
  try {
    if (!(await retrySlide(userId, slideId))) return 'Slide sedang dibuat atau sudah selesai. Muat ulang halaman.'
  } catch (error) {
    console.error('[buat] slide gagal diantrekan:', describeError(error))
    return 'Database tidak bisa diakses. Coba lagi.'
  }
  refresh()
  return null
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
 * Remakes one slide as the owner asked, with the image they attached, if any: the AI rewrites its text and scene,
 * then draws it again from its current image. One charge covers both. The old photo stays in Aset; the attachment
 * is not kept, since the new image already carries it.
 */
export async function editSlideAction(input: unknown): Promise<ActionError> {
  const { userId, accountId } = await requireAccount()
  const postId = isObject(input) ? input.postId : null
  const assetId = isObject(input) ? input.assetId : null
  if (!isUuid(postId) || !isUuid(assetId)) return 'Slide tidak ditemukan.'
  const instruction = parseInstruction(isObject(input) ? input.instruction : null)
  if (typeof instruction !== 'string') return instruction.error

  try {
    const attachment = await readAttachment(isObject(input) ? input.attachment : null)
    if (attachment && 'error' in attachment) return attachment.error
    const post = await getPost(userId, postId)
    const index = post ? post.media.findIndex((item) => item.assetId === assetId) : -1
    if (!post || index < 0) return 'Slide tidak ditemukan. Muat ulang halaman.'
    if (!isEditable(post)) return LOCKED
    const media = post.media[index]
    const source = await findSlideByAsset(userId, assetId)
    // An uploaded photo has no prompt: it keeps its own shape, square when it isn't portrait.
    const format: ImageFormat = source?.format ?? (media.width >= media.height ? '1:1' : '4:5')
    const referenceImageId = source?.referenceImageId ?? null
    const productGroupId = source?.productGroupId ?? null
    const role = source?.role ?? null
    const includeLogo = source?.includeLogo ?? false
    const example = source?.example ?? null

    await runLogged(
      userId,
      'slide_edit',
      { postId, assetId, instruction, attachment: attachment !== null },
      async () => {
        const [revised, bytes] = await Promise.all([
          reviseSlide({ headline: source?.headline ?? '', scene: source?.scene ?? '' }, instruction, attachment?.dataUrl ?? null),
          loadAssetBytes(userId, assetId),
        ])
        if (!bytes) throw new SlideError('Foto slide ini tidak ditemukan.')
        const drawn = await drawImage(userId, {
          ...revised,
          format,
          referenceImageId,
          example,
          productGroupId,
          includeLogo,
          siblingImage: null,
          currentImage: await toReferenceDataUrl(bytes),
          attachment: attachment ? { dataUrl: attachment.dataUrl, note: instruction } : null,
          slide: post.media.length > 1 ? { index: index + 1, count: post.media.length, role } : null,
        })
        const newAssetId = await storeSlideImage(userId, accountId, drawn, format)
        await replaceSlide(userId, {
          postId,
          oldAssetId: assetId,
          newAssetId,
          ...revised,
          format,
          role,
          referenceImageId,
          productGroupId,
          includeLogo,
          example,
        })
        return drawn
      },
      { model: await imageModel(), logOutput: imageLog },
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

/** A new slide-by-slide script for the idea, stored on it, replacing the one it had. */
export async function generateScriptAction(ideaId: unknown): Promise<ScriptResult> {
  const { userId } = await requireAccount()
  if (!isUuid(ideaId)) return { error: 'Ide tidak ditemukan.' }
  try {
    const idea = await getIdea(userId, ideaId)
    if (!idea) return { error: IDEA_GONE }
    const script = await writeScript(userId, idea, async (written) => {
      if (!(await saveIdeaScript(userId, idea.id, written))) throw new ContentError(IDEA_GONE)
    })
    return { script }
  } catch (error) {
    if (error instanceof ContentError) return { error: error.message }
    console.error('[buat] skrip gagal dibuat:', describeError(error))
    return { error: aiErrorMessage(error) }
  }
}

/** The owner's edits to an idea's script, saved as they type. */
export async function saveScriptAction(input: unknown): Promise<ActionError> {
  const { userId } = await requireAccount()
  const ideaId = isObject(input) ? input.ideaId : null
  if (!isUuid(ideaId)) return 'Ide tidak ditemukan.'
  const parsed = parseScript(isObject(input) ? input.script : null)
  if ('error' in parsed) return parsed.error
  try {
    if (!(await saveIdeaScript(userId, ideaId, parsed.script))) return IDEA_GONE
  } catch (error) {
    console.error('[buat] skrip gagal disimpan:', describeError(error))
    return 'Skrip gagal disimpan. Coba lagi.'
  }
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
