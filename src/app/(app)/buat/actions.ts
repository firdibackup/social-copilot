'use server'

import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { inspectCaption } from '@/lib/caption'
import { describeError } from '@/lib/errors'
import { parseWibInput } from '@/lib/format'
import { isUuid } from '@/lib/params'
import { cancelPost, deletePost, duplicatePost, PostLockedError, retryPost, savePost } from '@/lib/posts'

const MAX_MEDIA = 10
/** Lets "schedule for this minute" through despite the round trip. */
const PAST_TOLERANCE_MS = 60_000

export interface SaveState {
  error: string | null
}

type Intent = 'draft' | 'schedule' | 'now'

const isIntent = (value: unknown): value is Intent => value === 'draft' || value === 'schedule' || value === 'now'

export async function savePostAction(_previous: SaveState, formData: FormData): Promise<SaveState> {
  const userId = await requireUser()
  const intent = formData.get('intent')
  if (!isIntent(intent)) return { error: 'Aksi tidak dikenal.' }

  const id = formData.get('id')
  // Browsers submit textarea newlines as CRLF; count them as Instagram and the editor do.
  const caption = String(formData.get('caption') ?? '').replace(/\r\n/g, '\n')
  const assetIds = formData.getAll('assetId').filter(isUuid)
  const rawSchedule = String(formData.get('scheduledAt') ?? '')
  const scheduledAt = intent === 'now' ? new Date() : rawSchedule ? parseWibInput(rawSchedule) : null

  const errors = inspectCaption(caption).errors
  if (intent !== 'now' && rawSchedule && !scheduledAt) errors.push('Tanggal dan jam tidak valid.')
  if (assetIds.length > MAX_MEDIA) errors.push('Maksimal 10 foto.')
  if (intent !== 'draft' && assetIds.length === 0) errors.push('Pilih minimal 1 foto.')
  if (intent === 'schedule' && !rawSchedule) errors.push('Isi tanggal dan jam jadwal.')
  if (intent === 'schedule' && scheduledAt && scheduledAt.getTime() < Date.now() - PAST_TOLERANCE_MS) {
    errors.push('Jadwal sudah lewat. Pilih waktu lain atau Terbitkan sekarang.')
  }
  if (errors.length > 0) return { error: errors.join(' ') }

  let savedId: string
  try {
    savedId = await savePost(userId, {
      id: isUuid(id) ? id : null,
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
  redirect(`/buat?id=${savedId}&ok=${intent}`)
}

/** Runs a status change and reports it on the editor as `?ok=<code>` or `?gagal=<code>`. */
async function runPostAction(
  formData: FormData,
  code: string,
  action: (userId: string, id: string) => Promise<boolean>,
) {
  const userId = await requireUser()
  const id = formData.get('id')
  if (!isUuid(id)) redirect('/kalender')

  const done = await action(userId, id).catch((error: unknown) => {
    console.error(`[buat] aksi ${code} gagal:`, describeError(error))
    return false
  })
  redirect(`/buat?id=${id}&${done ? 'ok' : 'gagal'}=${code}`)
}

export async function cancelPostAction(formData: FormData): Promise<void> {
  await runPostAction(formData, 'cancel', cancelPost)
}

export async function retryPostAction(formData: FormData): Promise<void> {
  await runPostAction(formData, 'retry', retryPost)
}

export async function duplicatePostAction(formData: FormData): Promise<void> {
  const userId = await requireUser()
  const id = formData.get('id')
  if (!isUuid(id)) redirect('/kalender')

  const copyId = await duplicatePost(userId, id).catch((error: unknown) => {
    console.error('[buat] duplikat gagal:', describeError(error))
    return null
  })
  redirect(copyId ? `/buat?id=${copyId}&ok=duplicate` : `/buat?id=${id}&gagal=duplicate`)
}

export async function deletePostAction(formData: FormData): Promise<void> {
  const userId = await requireUser()
  const id = formData.get('id')
  if (!isUuid(id)) redirect('/kalender')

  const deleted = await deletePost(userId, id).catch((error: unknown) => {
    console.error('[buat] hapus gagal:', describeError(error))
    return false
  })
  redirect(deleted ? '/kalender?tampilan=daftar&ok=hapus' : `/buat?id=${id}&gagal=hapus`)
}
