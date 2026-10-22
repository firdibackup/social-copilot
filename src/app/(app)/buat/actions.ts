'use server'

import { refresh, revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireAccount, type AccountScope } from '@/lib/auth'
import { inspectCaption } from '@/lib/caption'
import { describeError } from '@/lib/errors'
import { parseWibInput } from '@/lib/format'
import { isUuid } from '@/lib/params'
import { retryStory } from '@/lib/post-stories'
import { getPostTargets, PlatformError, publishThreadsNow, setPostPlatforms } from '@/lib/post-threads'
import { cancelPost, deletePost, duplicatePost, getPost, PostLockedError, retryPost, savePost } from '@/lib/posts'
import { scheduleProblem } from '@/lib/publish-checks'
import { hasSlidesInProgress } from '@/lib/slides'
import { getThreadsConnection } from '@/lib/threads-connection'

const MAX_MEDIA = 10
/** Lets "schedule for this minute" through despite the round trip. */
const PAST_TOLERANCE_MS = 60_000

export interface SaveState {
  error: string | null
}

type Intent = 'draft' | 'schedule' | 'now'

const isIntent = (value: unknown): value is Intent => value === 'draft' || value === 'schedule' || value === 'now'

export async function savePostAction(_previous: SaveState, formData: FormData): Promise<SaveState> {
  const { userId, accountId } = await requireAccount()
  const intent = formData.get('intent')
  if (!isIntent(intent)) return { error: 'Aksi tidak dikenal.' }

  const id = formData.get('id')
  const postId = isUuid(id) ? id : null
  // Browsers submit textarea newlines as CRLF; count them as Instagram and the editor do.
  const caption = String(formData.get('caption') ?? '').replace(/\r\n/g, '\n')
  const assetIds = formData.getAll('assetId').filter(isUuid)
  const rawSchedule = String(formData.get('scheduledAt') ?? '')
  const scheduledAt = intent === 'now' ? new Date() : rawSchedule ? parseWibInput(rawSchedule) : null

  // Where the post goes decides what it needs: photos for Instagram, a connection and a valid chain for Threads.
  let targets: { instagram: boolean; threads: boolean } | null
  try {
    targets = postId ? await getPostTargets(userId, postId) : null
  } catch (error) {
    console.error('[buat] platform post gagal dibaca:', describeError(error))
    return { error: 'Post gagal disimpan. Coba lagi.' }
  }
  const instagram = targets?.instagram ?? true

  const errors = inspectCaption(caption).errors
  if (intent !== 'now' && rawSchedule && !scheduledAt) errors.push('Tanggal dan jam tidak valid.')
  if (assetIds.length > MAX_MEDIA) errors.push('Maksimal 10 foto.')
  if (intent !== 'draft' && instagram && assetIds.length === 0) errors.push('Pilih minimal 1 foto.')
  if (intent === 'schedule' && !rawSchedule) errors.push('Isi tanggal dan jam jadwal.')
  if (intent === 'schedule' && scheduledAt && scheduledAt.getTime() < Date.now() - PAST_TOLERANCE_MS) {
    errors.push('Jadwal sudah lewat. Pilih waktu lain atau Terbitkan sekarang.')
  }
  if (errors.length > 0) return { error: errors.join(' ') }

  let savedId: string
  try {
    // save_post replaces the photo list, which would drop an AI slide that lands meanwhile.
    if (postId && (await hasSlidesInProgress(userId, postId))) return { error: 'Tunggu semua slide selesai dibuat.' }
    if (postId && intent !== 'draft' && targets?.threads) {
      const problem = await scheduleProblem(userId, accountId, { postId, instagram, threads: true, caption, assetIds })
      if (problem) return { error: problem }
    }
    savedId = await savePost(userId, {
      id: postId,
      caption,
      status: intent === 'draft' ? 'draft' : 'scheduled',
      scheduledAt,
      assetIds,
    })
  } catch (error) {
    if (error instanceof PostLockedError) return { error: error.message }
    console.error('[buat] simpan gagal:', describeError(error))
    return { error: 'Post gagal disimpan. Coba lagi.' }
  }
  revalidatePath('/buat', 'layout')
  redirect(`/buat?id=${savedId}&ok=${intent}`)
}

/** Runs a status change and reports it on the editor as `?ok=<code>` or `?gagal=<code>`. */
async function runPostAction(
  formData: FormData,
  code: string,
  action: (scope: AccountScope, id: string) => Promise<boolean>,
) {
  const scope = await requireAccount()
  const id = formData.get('id')
  if (!isUuid(id)) redirect('/kalender')

  const done = await action(scope, id).catch((error: unknown) => {
    console.error(`[buat] aksi ${code} gagal:`, describeError(error))
    return false
  })
  if (done) revalidatePath('/buat', 'layout')
  redirect(`/buat?id=${id}&${done ? 'ok' : 'gagal'}=${code}`)
}

export async function cancelPostAction(formData: FormData): Promise<void> {
  await runPostAction(formData, 'cancel', ({ userId }, id) => cancelPost(userId, id))
}

export async function retryPostAction(formData: FormData): Promise<void> {
  await runPostAction(formData, 'retry', ({ userId, accountId }, id) => retryPost(userId, accountId, id))
}

/**
 * Terbitkan ke Threads, for a post whose schedule already ran on Instagram (published or failed) while its Threads
 * version failed or was switched on afterwards: it goes now, after the same checks as scheduling.
 */
export async function publishThreadsNowAction(formData: FormData): Promise<void> {
  await runPostAction(formData, 'threads', async ({ userId, accountId }, id) => {
    const post = await getPost(userId, id)
    if (!post?.threads?.enabled || !post.instagramEnabled) return false
    if (post.status !== 'published' && post.status !== 'failed') return false
    const problem = await scheduleProblem(userId, accountId, {
      postId: id,
      instagram: false,
      threads: true,
      caption: post.caption,
      assetIds: post.media.map((item) => item.assetId),
    })
    return problem === null && publishThreadsNow(userId, id)
  })
}

/**
 * Pilih platform: Instagram (with or without its Story) and Threads on or off for the post. Returns a message, or
 * null once saved.
 */
export async function setPlatformsAction(input: unknown): Promise<string | null> {
  const { userId, accountId } = await requireAccount()
  const fields = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
  const { postId, instagram, threads, story } = fields
  if (!isUuid(postId) || typeof instagram !== 'boolean' || typeof threads !== 'boolean' || typeof story !== 'boolean') {
    return 'Permintaan tidak valid.'
  }
  try {
    if (threads && (await getThreadsConnection(userId, accountId))?.status !== 'active') {
      return 'Hubungkan Threads dulu di Pengaturan.'
    }
    await setPostPlatforms(userId, postId, instagram, threads, story)
  } catch (error) {
    if (error instanceof PlatformError) return error.message
    console.error('[buat] platform gagal disimpan:', describeError(error))
    return 'Platform gagal disimpan. Coba lagi.'
  }
  refresh()
  return null
}

/** Coba lagi for a Story that failed after its feed post went out. */
export async function retryStoryAction(formData: FormData): Promise<void> {
  await runPostAction(formData, 'story', ({ userId }, id) => retryStory(userId, id))
}

export async function duplicatePostAction(formData: FormData): Promise<void> {
  const { userId } = await requireAccount()
  const id = formData.get('id')
  if (!isUuid(id)) redirect('/kalender')

  const copyId = await duplicatePost(userId, id).catch((error: unknown) => {
    console.error('[buat] duplikat gagal:', describeError(error))
    return null
  })
  if (copyId) revalidatePath('/buat', 'layout')
  redirect(copyId ? `/buat?id=${copyId}&ok=duplicate` : `/buat?id=${id}&gagal=duplicate`)
}

export async function deletePostAction(formData: FormData): Promise<void> {
  const { userId } = await requireAccount()
  const id = formData.get('id')
  if (!isUuid(id)) redirect('/kalender')

  // A Threads version being published keeps its post: the worker is still writing to it.
  const deleted = await getPost(userId, id)
    .then((post) => (post?.threads?.status === 'publishing' ? false : deletePost(userId, id)))
    .catch((error: unknown) => {
      console.error('[buat] hapus gagal:', describeError(error))
      return false
    })
  if (deleted) revalidatePath('/buat', 'layout')
  redirect(deleted ? '/kalender?tampilan=daftar&ok=hapus' : `/buat?id=${id}&gagal=hapus`)
}
