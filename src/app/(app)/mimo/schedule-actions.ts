'use server'

import { getTranslations } from 'next-intl/server'
import { getUserLocale } from '@/i18n/locale'
import { refresh } from 'next/cache'
import { remainingCredits, aiErrorMessage } from '@/lib/ai'
import { getBillingCatalog } from '@/lib/billing-catalog'
import { requireAccount } from '@/lib/auth'
import { bulkContentRequest } from '@/lib/bulk-content'
import { getMessage, getSession } from '@/lib/chat'
import { commitMimoSchedule, readScheduleItem, scheduleIdeaJob } from '@/lib/chat-schedule'
import { MAX_SCHEDULE_ITEMS, type ScheduleRef, type ScheduleResult } from '@/lib/chat-schedule-options'
import { enqueueContentJob, getContentJob } from '@/lib/content-jobs'
import { getDensityDefault } from '@/lib/density'
import { describeError } from '@/lib/errors'
import { parseWibInput } from '@/lib/format'
import { getAccountIdea } from '@/lib/ideas'
import { isUuid } from '@/lib/params'
import { PostLockedError } from '@/lib/posts'
import { listTakenTimes } from '@/lib/schedule'
import { MIN_SLOT_LEAD_MS } from '@/lib/schedule-slots'
import { StorageFullError } from '@/lib/storage-quota'
import { storageFullMessage } from '@/lib/storage-quota-options'

/** Supports the stored schedule card and the direct schedule controls on a bulk result. */
async function scheduleCardRefs(sessionId: string, messageId: string, cardId: string): Promise<ScheduleRef[] | null> {
  const { userId, accountId } = await requireAccount()
  if (![sessionId, messageId, cardId].every(isUuid)) return null
  if (!await getSession(userId, accountId, sessionId)) return null
  const message = await getMessage(userId, sessionId, messageId)
  const part = message?.parts.find((part) => (part.type === 'schedule' || part.type === 'bulk') && part.id === cardId)
  if (part?.type === 'schedule') return part.items
  if (part?.type === 'bulk' && part.state === 'started') return part.items.map((item) => ({ kind: 'post', id: item.postId, title: item.title }))
  return null
}

/** Each row has its own outcome: a processing or invalid row never prevents ready rows from being scheduled. */
export async function scheduleFromMimoAction(sessionId: string, messageId: string, cardId: string, input: unknown): Promise<{ results: ScheduleResult[]; error?: string }> {
  const t = await getTranslations('mimo.scheduleActions')
  const locale = await getUserLocale()
  const { userId, accountId } = await requireAccount()
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_SCHEDULE_ITEMS) return { results: [], error: t('select') }
  try {
    const refs = await scheduleCardRefs(sessionId, messageId, cardId)
    if (!refs) return { results: [], error: t('missingCard') }
    const allowed = new Set<string>()
    for (const ref of refs) {
      if (ref.kind === 'post') allowed.add(ref.id)
      else {
        const job = await scheduleIdeaJob(userId, accountId, ref.id)
        if (job) allowed.add(job.post_id)
      }
    }
    const seen = new Set<string>()
    const results: ScheduleResult[] = []
    for (const value of input) {
      if (!value || typeof value !== 'object' || !isUuid(value.postId) || !allowed.has(value.postId) || seen.has(value.postId)) {
        return { results, error: t('invalidSelection') }
      }
      seen.add(value.postId)
    }
    for (const { postId, at: value } of input) {
      try {
        const at = typeof value === 'string' ? parseWibInput(value) : null
        if (!at || at.getTime() - Date.now() < MIN_SLOT_LEAD_MS) {
          results.push({ postId, error: t('invalidTime') })
          continue
        }
        const current = await readScheduleItem(userId, accountId, { kind: 'post', id: postId, title: t('content') }, undefined, locale)
        // A retry after a lost response must not move a scheduled post.
        if (current.stage === 'scheduled' && current.scheduledAt === at.toISOString()) {
          results.push({ postId, error: null })
          continue
        }
        if (current.stage !== 'ready') {
          results.push({ postId, error: current.reason })
          continue
        }
        const taken = await listTakenTimes(userId, accountId, at, new Date(at.getTime() + 1))
        if (taken.length) {
          results.push({ postId, error: t('taken') })
          continue
        }
        await commitMimoSchedule(userId, accountId, postId, at, locale)
        results.push({ postId, error: null })
      } catch (error) {
        console.error('[mimo] jadwal gagal:', describeError(error))
        results.push({ postId, error: error instanceof PostLockedError ? error.message : t('failed') })
      }
    }
    refresh()
    return { results }
  } catch (error) {
    console.error('[mimo] kartu jadwal gagal:', describeError(error))
    return { results: [], error: t('loadFailed') }
  }
}

/** Uses the saved script and the queue's atomic idea deduplication, including script-only placeholder posts. */
export async function makeScheduleImagesAction(sessionId: string, messageId: string, cardId: string, refId: string): Promise<string | null> {
  const t = await getTranslations('mimo.scheduleActions')
  const locale = await getUserLocale()
  const { userId, accountId } = await requireAccount()
  try {
    const refs = await scheduleCardRefs(sessionId, messageId, cardId)
    const ref = refs?.find((ref) => ref.id === refId)
    if (!ref) return t('contentMissing')
    const { catalog } = await getBillingCatalog()
    const current = await readScheduleItem(userId, accountId, ref, catalog.rates, locale)
    if (current.stage !== 'script') return current.reason
    const job = current.postId ? await getContentJob(userId, current.postId) : null
    const ideaId = ref.kind === 'idea' ? ref.id : job?.idea_id
    const idea = ideaId ? await getAccountIdea(userId, accountId, ideaId) : null
    if (!idea?.script) return t('scriptMissing')
    const { remaining } = await remainingCredits(userId)
    if ((current.imageCost ?? Infinity) > remaining) return t('quota')
    const density = job?.payload.density ?? await getDensityDefault(userId, accountId)
    const request = bulkContentRequest({ title: idea.title, slides: idea.script.length, pillarId: idea.pillarId }, idea.id, density)
    await enqueueContentJob(userId, accountId, idea.id, idea.id, 'content', { request, script: idea.script, attachmentPath: null }, locale)
    refresh()
    return null
  } catch (error) {
    if (error instanceof StorageFullError) return storageFullMessage(await getUserLocale())
    console.error('[mimo] gambar untuk jadwal gagal:', describeError(error))
    return aiErrorMessage(error)
  }
}
