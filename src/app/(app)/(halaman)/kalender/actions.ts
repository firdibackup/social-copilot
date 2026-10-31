'use server'

import { refresh } from 'next/cache'
import { getLocale, getTranslations } from 'next-intl/server'
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
  const t = await getTranslations('calendar.errors')
  const locale = await getLocale()
  const { userId, accountId } = await requireAccount()
  const at = typeof slot === 'string' ? parseWibInput(slot) : null
  if (!isUuid(postId) || !at) return t('invalidSlot')
  if (at.getTime() - Date.now() < MIN_SLOT_LEAD_MS) return t('pastSlot')

  try {
    const [post, taken] = await Promise.all([
      getPost(userId, postId),
      listTakenTimes(userId, accountId, at, new Date(at.getTime() + 1)),
    ])
    if (!post) return t('missingPost')
    // One post per slot: another tab may have filled it meanwhile.
    if (taken.length > 0) return t('takenSlot')
    if (await hasSlidesInProgress(userId, postId)) return t('slidesPending')
    const captionErrors = post.instagramEnabled ? inspectCaption(post.caption, locale).errors : []
    if (captionErrors.length > 0) return t('fixCaption', { errors: captionErrors.join(' ') })
    const problem = await scheduleProblem(userId, accountId, {
      postId,
      instagram: post.instagramEnabled,
      threads: post.threads?.enabled ?? false,
      caption: post.caption,
      assetIds: post.media.map((item) => item.assetId),
    }, locale)
    if (problem) return problem
    await schedulePost(userId, postId, at, locale)
  } catch (error) {
    if (error instanceof PostLockedError) return error.message
    console.error('[kalender] slot gagal diisi:', describeError(error))
    return t('scheduleFailed')
  }
  refresh()
  return null
}
