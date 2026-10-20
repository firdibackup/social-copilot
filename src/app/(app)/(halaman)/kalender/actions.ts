'use server'

import { refresh } from 'next/cache'
import { requireAccount } from '@/lib/auth'
import { inspectCaption } from '@/lib/caption'
import { describeError } from '@/lib/errors'
import { parseWibInput } from '@/lib/format'
import { isUuid } from '@/lib/params'
import { getPost, PostLockedError, schedulePost } from '@/lib/posts'
import { scheduleProblem } from '@/lib/publish-checks'
import { listTakenTimes } from '@/lib/schedule'
import { MIN_SLOT_LEAD_MS } from '@/lib/schedule-slots'
import { hasSlidesInProgress } from '@/lib/slides'

/**
 * Pilih: a finished draft takes an empty slot, with the same checks as scheduling it in Buat. Returns a message, or
 * null once it is on the schedule.
 */
export async function fillSlotAction(postId: unknown, slot: unknown): Promise<string | null> {
  const { userId, accountId } = await requireAccount()
  const at = typeof slot === 'string' ? parseWibInput(slot) : null
  if (!isUuid(postId) || !at) return 'Slot tidak valid.'
  if (at.getTime() - Date.now() < MIN_SLOT_LEAD_MS) return 'Slot ini sudah lewat. Pilih slot lain.'

  try {
    const [post, taken] = await Promise.all([
      getPost(userId, postId),
      listTakenTimes(userId, accountId, at, new Date(at.getTime() + 1)),
    ])
    if (!post) return 'Post tidak ditemukan. Mungkin sudah dihapus.'
    // One post per slot: another tab may have filled it meanwhile.
    if (taken.length > 0) return 'Slot ini sudah terisi. Pilih slot lain.'
    if (await hasSlidesInProgress(userId, postId)) return 'Tunggu semua slide post ini selesai dibuat.'
    const captionErrors = post.instagramEnabled ? inspectCaption(post.caption).errors : []
    if (captionErrors.length > 0) return `${captionErrors.join(' ')} Perbaiki di Buat dulu.`
    const problem = await scheduleProblem(userId, accountId, {
      postId,
      instagram: post.instagramEnabled,
      threads: post.threads?.enabled ?? false,
      caption: post.caption,
      assetIds: post.media.map((item) => item.assetId),
    })
    if (problem) return problem
    await schedulePost(userId, postId, at)
  } catch (error) {
    if (error instanceof PostLockedError) return error.message
    console.error('[kalender] slot gagal diisi:', describeError(error))
    return 'Post gagal dijadwalkan. Coba lagi.'
  }
  refresh()
  return null
}
