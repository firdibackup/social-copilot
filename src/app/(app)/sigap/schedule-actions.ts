'use server'

import { refresh } from 'next/cache'
import { remainingCredits, aiErrorMessage } from '@/lib/ai'
import { requireAccount } from '@/lib/auth'
import { bulkContentRequest } from '@/lib/bulk-content'
import { getMessage, getSession } from '@/lib/chat'
import { commitSigapSchedule, readScheduleItem, scheduleIdeaJob } from '@/lib/chat-schedule'
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
export async function scheduleFromSigapAction(sessionId: string, messageId: string, cardId: string, input: unknown): Promise<{ results: ScheduleResult[]; error?: string }> {
  const { userId, accountId } = await requireAccount()
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_SCHEDULE_ITEMS) return { results: [], error: 'Pilih 1–20 konten untuk dijadwalkan.' }
  try {
    const refs = await scheduleCardRefs(sessionId, messageId, cardId)
    if (!refs) return { results: [], error: 'Kartu tidak ditemukan. Muat ulang chat.' }
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
        return { results, error: 'Pilihan konten tidak valid. Muat ulang kartu.' }
      }
      seen.add(value.postId)
    }
    for (const { postId, at: value } of input) {
      try {
        const at = typeof value === 'string' ? parseWibInput(value) : null
        if (!at || at.getTime() - Date.now() < MIN_SLOT_LEAD_MS) {
          results.push({ postId, error: 'Waktu sudah lewat atau terlalu dekat. Pilih waktu lain.' })
          continue
        }
        const current = await readScheduleItem(userId, accountId, { kind: 'post', id: postId, title: 'Konten' })
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
          results.push({ postId, error: 'Waktu ini sudah terisi. Pilih waktu lain.' })
          continue
        }
        await commitSigapSchedule(userId, accountId, postId, at)
        results.push({ postId, error: null })
      } catch (error) {
        console.error('[sigap] jadwal gagal:', describeError(error))
        results.push({ postId, error: error instanceof PostLockedError ? error.message : 'Gagal menjadwalkan. Coba lagi.' })
      }
    }
    refresh()
    return { results }
  } catch (error) {
    console.error('[sigap] kartu jadwal gagal:', describeError(error))
    return { results: [], error: 'Gagal memuat konten. Coba lagi.' }
  }
}

/** Uses the saved script and the queue's atomic idea deduplication, including script-only placeholder posts. */
export async function makeScheduleImagesAction(sessionId: string, messageId: string, cardId: string, refId: string): Promise<string | null> {
  const { userId, accountId } = await requireAccount()
  try {
    const refs = await scheduleCardRefs(sessionId, messageId, cardId)
    const ref = refs?.find((ref) => ref.id === refId)
    if (!ref) return 'Konten tidak ditemukan di kartu ini.'
    const current = await readScheduleItem(userId, accountId, ref)
    if (current.stage !== 'script') return current.reason
    const job = current.postId ? await getContentJob(userId, current.postId) : null
    const ideaId = ref.kind === 'idea' ? ref.id : job?.idea_id
    const idea = ideaId ? await getAccountIdea(userId, accountId, ideaId) : null
    if (!idea?.script) return 'Skrip tidak ditemukan. Periksa di Buat.'
    const { remaining } = await remainingCredits(userId)
    if ((current.imageCost ?? Infinity) > remaining) return 'Kuota AI tidak cukup untuk membuat gambar. Periksa Langganan.'
    const density = job?.payload.density ?? await getDensityDefault(userId, accountId)
    const request = bulkContentRequest({ title: idea.title, slides: idea.script.length, pillarId: idea.pillarId }, idea.id, density)
    await enqueueContentJob(userId, accountId, idea.id, idea.id, 'content', { request, script: idea.script, attachmentPath: null })
    refresh()
    return null
  } catch (error) {
    console.error('[sigap] gambar untuk jadwal gagal:', describeError(error))
    return aiErrorMessage(error)
  }
}
