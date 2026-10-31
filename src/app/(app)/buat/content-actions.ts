'use server'

import { getLocale } from 'next-intl/server'

import { getTranslations } from 'next-intl/server'

import { refresh } from 'next/cache'
import { aiErrorMessage, loadBrandContext, runLogged } from '@/lib/ai'
import { imageModel } from '@/lib/app-settings'
import { deleteAsset, loadAssetBytes } from '@/lib/assets'
import { readAttachment, removeAttachment, saveAttachment } from '@/lib/attachments'
import { requireAccount } from '@/lib/auth'
import { lengthOf } from '@/lib/brand-options'
import { CAPTION_MAX_LENGTH } from '@/lib/caption'
import { editCaption, reviseSlide, suggestIdeas } from '@/lib/content-ai'
import { enqueueContentJob, getContentJob } from '@/lib/content-jobs'
import { parseContentRequest, parseInstruction } from '@/lib/content-options'
import { isTextDensity } from '@/lib/density-options'
import { getDensityDefault } from '@/lib/density'
import { describeError } from '@/lib/errors'
import { editAttemptActive, GenerationCancelled, watchGeneration } from '@/lib/generation-cancellation'
import { addIdeas, deleteIdea, recentTitles, saveIdeaScript } from '@/lib/ideas'
import { drawImage, imageErrorMessage, imageLog } from '@/lib/image-ai'
import type { ImageFormat } from '@/lib/image-options'
import { isUuid } from '@/lib/params'
import { parseScript } from '@/lib/script-options'
import {
  ContentError,
  deletePost,
  getPost,
  PostLockedError,
  savePost,
  type Post,
} from '@/lib/posts'
import { storeSlideImage } from '@/lib/slide-generation'
import { toReferenceDataUrl } from '@/lib/slide-image'
import { FileTooLargeError, hasStorageRoom, StorageFullError } from '@/lib/storage-quota'
import { storageFullMessage } from '@/lib/storage-quota-options'
import {
  deleteUnfinishedSlide,
  findSlideByAsset,
  hasSlidesInProgress,
  retrySlide,
  SlideError,
} from '@/lib/slides'
import { db, unwrap } from '@/lib/supabase'

/** A message for the owner, or null when it worked. */
type ActionError = string | null

export type CreateResult = { postId: string } | { error: string }
export type CaptionResult = { caption: string } | { error: string }
export type SaveResult = { postId: string } | { error: string }
export type ScriptResult = { postId: string } | { error: string }



type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null
const EDITABLE_STATUSES = new Set(['draft', 'scheduled', 'failed', 'cancelled'])
const MAX_MEDIA = 10


const isEditable = (post: Post) => EDITABLE_STATUSES.has(post.status) && !post.isLocked
/** Textareas submit CRLF; count newlines once, as the editor and Instagram do. */
const captionOf = (value: unknown) => (typeof value === 'string' ? value.replace(/\r\n/g, '\n') : '')

/**
 * Persist a draft and its job before returning; AI and billing run in the worker.
 * The request key and source idea are deduplicated atomically in the database.
 */
export async function createContentAction(input: unknown): Promise<CreateResult> {
  const t = await getTranslations('editor.contentActions')
  const locale = await getLocale()

  const { userId, accountId } = await requireAccount()
  const parsed = parseContentRequest(input, locale)
  if ('error' in parsed) return parsed
  const requestKey = isObject(input) ? input.requestKey : null
  if (!isUuid(requestKey)) return { error: t('message1') }
  if (!(await hasStorageRoom(userId))) return { error: storageFullMessage(await getLocale()) }

  try {
    // The script is the composer's text: it sets the slides' text and how many are paid for.
    const scripted = isObject(input) && input.script != null ? parseScript(input.script, locale) : null
    if (scripted && 'error' in scripted) return scripted
    const script = scripted?.script ?? null
    const brand = await loadBrandContext(userId)
    const pillarId = brand?.strategy?.pillars.some((pillar) => pillar.id === parsed.request.pillarId)
      ? parsed.request.pillarId
      : null
    const request = { ...parsed.request, ...(script ? { slides: script.length } : {}), pillarId }
    const existing = unwrap(await db().from('content_jobs').select('post_id, kind').eq('user_id', userId)
      .eq('account_id', accountId).eq(request.ideaId ? 'idea_id' : 'request_key', request.ideaId ?? requestKey).maybeSingle()) as
      { post_id: string; kind: string } | null
    if (existing?.kind === 'content') return { postId: existing.post_id }
    const attachment = await readAttachment(isObject(input) ? input.attachment : null)
    if (attachment && 'error' in attachment) return attachment
    const attachmentPath = attachment ? await saveAttachment(userId, attachment) : null
    const postId = await enqueueContentJob(userId, accountId, requestKey, request.ideaId, 'content', {
      request, script, attachmentPath,
    }, locale)
    // A concurrent request may have won with a different attachment; remove only this unused upload.
    if (attachmentPath) {
      try {
        const job = await getContentJob(userId, postId)
        if (job && job.payload.attachmentPath !== attachmentPath) await removeAttachment(attachmentPath)
      } catch (error) { console.error('[buat] lampiran antrean gagal dibersihkan:', describeError(error)) }
    }
    return { postId }
  } catch (error) {
    if (error instanceof StorageFullError) return { error: storageFullMessage(await getLocale()) }
    if (error instanceof FileTooLargeError || error instanceof ContentError) return { error: error.message }
    console.error('[buat] konten gagal dibuat:', describeError(error))
    return { error: aiErrorMessage(error) }
  }
}

/** The owner's Coba lagi: a failed slide goes back to the worker's queue. It was paid with the post. */
export async function retrySlideAction(slideId: unknown): Promise<ActionError> {
  const t = await getTranslations('editor.contentActions')

  const { userId } = await requireAccount()
  if (!isUuid(slideId)) return t('message2')
  if (!(await hasStorageRoom(userId))) return storageFullMessage(await getLocale())
  try {
    if (!(await retrySlide(userId, slideId))) return t('message3')
  } catch (error) {
    console.error('[buat] slide gagal diantrekan:', describeError(error))
    return t('message4')
  }
  refresh()
  return null
}

/** Drops a waiting or failed slide from the post. */
export async function deleteSlideAction(slideId: unknown): Promise<ActionError> {
  const t = await getTranslations('editor.contentActions')

  const { userId } = await requireAccount()
  if (!isUuid(slideId)) return t('message2')
  try {
    if (!(await deleteUnfinishedSlide(userId, slideId))) return t('message5')
  } catch (error) {
    console.error('[buat] slide gagal dihapus:', describeError(error))
    return t('message6')
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
  const t = await getTranslations('editor.contentActions')
  const locale = await getLocale()

  const LOCKED = t('message7')

  const { userId, accountId } = await requireAccount()
  const postId = isObject(input) ? input.postId : null
  const assetId = isObject(input) ? input.assetId : null
  const operationId = isObject(input) ? input.operationId : null
  if (!isUuid(postId) || !isUuid(assetId) || !isUuid(operationId)) return t('message2')
  const instruction = parseInstruction(isObject(input) ? input.instruction : null, locale)
  if (typeof instruction !== 'string') return instruction.error
  if (!(await hasStorageRoom(userId))) return storageFullMessage(await getLocale())

  let watch: Awaited<ReturnType<typeof watchGeneration>> | undefined
  let newAssetId: string | null = null
  let started = false
  try {
    started = unwrap(await db().rpc('begin_slide_edit', {
      p_user_id: userId, p_account_id: accountId, p_post_id: postId, p_id: operationId,
    }))
    if (!started) return t('message8')
    watch = await watchGeneration(() => editAttemptActive(userId, operationId))
    const attachment = await readAttachment(isObject(input) ? input.attachment : null)
    if (attachment && 'error' in attachment) return attachment.error
    const post = await getPost(userId, postId)
    const index = post ? post.media.findIndex((item) => item.assetId === assetId) : -1
    if (!post || index < 0) return t('message9')
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
          reviseSlide({ headline: source?.headline ?? '', scene: source?.scene ?? '' }, instruction, attachment?.dataUrl ?? null,
            watch!.signal, post.media.length === 1, locale),
          loadAssetBytes(userId, assetId),
        ])
        if (!bytes) throw new SlideError(t('message10'))
        await watch!.check()
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
        }, watch!.signal)
        await watch!.check()
        newAssetId = await storeSlideImage(userId, accountId, drawn, format)
        unwrap(await db().rpc('finish_slide_edit', { p_user_id: userId, p_id: operationId, p_replacement: {
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
        } }))
        newAssetId = null
        return drawn
      },
      { model: await imageModel(), logOutput: imageLog },
    )
  } catch (error) {
    if (newAssetId) await deleteAsset(userId, newAssetId).catch((failure) => console.error('[buat] gambar sementara gagal dibersihkan:', describeError(failure)))
    if (error instanceof GenerationCancelled) return t('message11')
    if (error instanceof SlideError) return error.message
    console.error('[buat] edit slide gagal:', describeError(error))
    return imageErrorMessage(error)
  } finally {
    watch?.stop()
    if (started) await db().from('slide_edit_jobs').update({ status: 'failed' }).eq('id', operationId)
      .eq('user_id', userId).eq('status', 'running')
  }
  return null
}

/** A caption changed as the owner asked. It only fills the editor, which saves it like typed text. */
export async function editCaptionAction(input: unknown): Promise<CaptionResult> {
  const t = await getTranslations('editor.contentActions')
  const locale = await getLocale()

  const { userId } = await requireAccount()
  const caption = captionOf(isObject(input) ? input.caption : null)
  if (lengthOf(caption) > CAPTION_MAX_LENGTH) return { error: t('message12') }
  const instruction = parseInstruction(isObject(input) ? input.instruction : null, locale)
  if (typeof instruction !== 'string') return instruction

  try {
    return { caption: await editCaption(userId, caption, instruction, locale) }
  } catch (error) {
    console.error('[buat] edit caption gagal:', describeError(error))
    return { error: aiErrorMessage(error) }
  }
}

/** Ten new ideas from the brand kit, unlike the open ones and the newest posts. */
export async function generateIdeasAction(): Promise<ActionError> {
  const t = await getTranslations('editor.contentActions')
  const locale = await getLocale()

  const { userId, accountId } = await requireAccount()
  try {
    const brand = await loadBrandContext(userId)
    if (!brand) return t('message13')
    await suggestIdeas(userId, brand, await recentTitles(userId, accountId), (ideas) => addIdeas(userId, accountId, ideas), locale)
  } catch (error) {
    console.error('[buat] ide gagal dibuat:', describeError(error))
    return aiErrorMessage(error)
  }
  refresh()
  return null
}

/** Open an idea's durable draft; explicit rewrites requeue only a finished/failed script job. */
export async function generateScriptAction(ideaId: unknown, density: unknown = null, rewrite = false): Promise<ScriptResult> {
  const t = await getTranslations('editor.contentActions')
  const locale = await getLocale()

  const { userId, accountId } = await requireAccount()
  if (!isUuid(ideaId)) return { error: t('message14') }
  try {
    density ??= await getDensityDefault(userId, accountId)
    if (!isTextDensity(density)) return { error: t('message15') }
    const postId = await enqueueContentJob(userId, accountId, ideaId, ideaId, 'script', { density }, locale)
    if (rewrite) {
      unwrap(await db().from('content_jobs').update({ status: 'pending', payload: { density, language: locale }, attempts: 0, error: null })
        .eq('post_id', postId).eq('user_id', userId).eq('account_id', accountId).eq('kind', 'script').in('status', ['ready', 'failed', 'cancelled']))
    }
    return { postId }
  } catch (error) {
    if (error instanceof ContentError) return { error: error.message }
    console.error('[buat] skrip gagal dibuat:', describeError(error))
    return { error: aiErrorMessage(error) }
  }
}

/** Delete an abandoned draft and its queued work; generated assets stay in the library. */
export async function deleteDraftAction(postId: unknown): Promise<ActionError> {
  const t = await getTranslations('editor.contentActions')

  const { userId, accountId } = await requireAccount()
  if (!isUuid(postId)) return t('message16')
  try {
    const post = await getPost(userId, postId, accountId)
    if (!post) return t('message16')
    if (post.status === 'publishing' || post.threads?.status === 'publishing') {
      return t('message17')
    }
    const job = await getContentJob(userId, postId)
    if (job?.status === 'pending' || job?.status === 'running') {
      return t('message18')
    }
    if (!(await deletePost(userId, postId))) return t('message19')
    if (job?.payload.attachmentPath) {
      try { await removeAttachment(job.payload.attachmentPath) }
      catch (error) { console.error('[buat] lampiran draft gagal dibersihkan:', describeError(error)) }
    }
  } catch (error) {
    console.error('[buat] draft gagal dihapus:', describeError(error))
    return t('message20')
  }
  refresh()
  return null
}

export async function retryContentJobAction(postId: string): Promise<ActionError> {
  const t = await getTranslations('editor.contentActions')

  const { userId, accountId } = await requireAccount()
  if (!isUuid(postId)) return t('message16')
  if (!(await hasStorageRoom(userId))) return storageFullMessage(await getLocale())
  try {
    unwrap(await db().from('content_jobs').update({ status: 'pending', error: null, attempts: 0 })
      .eq('post_id', postId).eq('user_id', userId).eq('account_id', accountId).in('status', ['failed', 'cancelled']))
    refresh()
    return null
  } catch { return t('message21') }
}

/** The owner's edits to an idea's script, saved as they type. */
export async function saveScriptAction(input: unknown): Promise<ActionError> {
  const t = await getTranslations('editor.contentActions')
  const locale = await getLocale()

  const IDEA_GONE = t('message22')

  const { userId } = await requireAccount()
  const ideaId = isObject(input) ? input.ideaId : null
  if (!isUuid(ideaId)) return t('message14')
  const parsed = parseScript(isObject(input) ? input.script : null, locale)
  if ('error' in parsed) return parsed.error
  try {
    if (!(await saveIdeaScript(userId, ideaId, parsed.script))) return IDEA_GONE
  } catch (error) {
    console.error('[buat] skrip gagal disimpan:', describeError(error))
    return t('message23')
  }
  return null
}

export async function deleteIdeaAction(id: unknown): Promise<ActionError> {
  const t = await getTranslations('editor.contentActions')

  const { userId } = await requireAccount()
  if (!isUuid(id)) return t('message14')
  try {
    await deleteIdea(userId, id)
  } catch (error) {
    console.error('[buat] ide gagal dihapus:', describeError(error))
    return t('message24')
  }
  refresh()
  return null
}

/**
 * The editor's autosave: caption and photo order, keeping the post's status and schedule. A post without an id is
 * a new draft from the owner's own photos.
 */
export async function saveContentAction(input: unknown): Promise<SaveResult> {
  const t = await getTranslations('editor.contentActions')

  const LOCKED = t('message7')

  const { userId } = await requireAccount()
  if (!isObject(input)) return { error: t('message25') }
  const caption = captionOf(input.caption)
  const assetIds = Array.isArray(input.assetIds) ? input.assetIds.filter(isUuid) : []
  const postId = input.postId === null ? null : isUuid(input.postId) ? input.postId : undefined
  if (postId === undefined) return { error: t('message26') }
  if (lengthOf(caption) > CAPTION_MAX_LENGTH) return { error: t('message27') }
  if (assetIds.length > MAX_MEDIA) return { error: t('message28') }

  try {
    if (postId === null) {
      return { postId: await savePost(userId, { id: null, caption, status: 'draft', scheduledAt: null, assetIds }, await getLocale()) }
    }
    const post = await getPost(userId, postId)
    if (!post) return { error: t('message26') }
    const job = await getContentJob(userId, postId)
    if (job && (job.kind === 'script' || job.status !== 'ready')) return { error: t('message29') }
    if (!isEditable(post)) return { error: LOCKED }
    if (await hasSlidesInProgress(userId, postId)) return { error: t('message30') }
    const scheduled = post.status === 'scheduled'
    if (scheduled && assetIds.length === 0) {
      return { error: t('message31') }
    }
    await savePost(userId, {
      id: postId,
      caption,
      status: scheduled ? 'scheduled' : 'draft',
      scheduledAt: scheduled ? post.scheduledAt : null,
      assetIds,
    }, await getLocale())
    return { postId }
  } catch (error) {
    if (error instanceof PostLockedError) return { error: error.message }
    console.error('[buat] simpan otomatis gagal:', describeError(error))
    return { error: t('message32') }
  }
}
