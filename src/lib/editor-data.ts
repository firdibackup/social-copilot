import 'server-only'
import { getPlan } from './app-settings'
import { getBillingCatalog } from './billing-catalog'
import { remainingCredits } from './ai'
import { listProductGroups } from './assets'
import type { AccountScope } from './auth'
import { getBrandKit } from './brand'
import { getConnection } from './connection'
import { getContentJob } from './content-jobs'
import { getDensityDefault } from './density'
import { DEFAULT_DENSITY } from './density-options'
import { describeError } from './errors'
import { toSlot } from './format'
import { getAccountIdea } from './ideas'
import { firstValue, isUuid, type SearchParams } from './params'
import { listThreadItems } from './post-threads'
import { getPost } from './posts'
import { getScheduleSettings, listTakenTimes } from './schedule'
import { nextEmptySlots, SLOT_LOOKAHEAD_DAYS } from './schedule-slots'
import { listUnfinishedSlides } from './slides'
import { getThreadsConnection } from './threads-connection'

const DAY_MS = 86_400_000

/** Independent of the selected draft. The browser reuses this for five minutes. */
export async function loadEditorSupport({ userId, accountId }: AccountScope) {
  const [instagram, kit, products, balance, legacyPlan, threads, defaultDensity, billing] = await Promise.all([
    getConnection(userId), getBrandKit(userId, accountId), listProductGroups(userId, accountId),
    remainingCredits(userId).catch(() => null), getPlan(),
    getThreadsConnection(userId, accountId).catch(logAndNull),
    getDensityDefault(userId, accountId).catch(() => DEFAULT_DENSITY),
    getBillingCatalog(),
  ])
  return { instagram, kit: { logoUrl: kit.logoUrl }, products, credits: balance?.remaining ?? null,
    plan: balance?.period.plan ?? legacyPlan, rates: billing.catalog.rates, threads, defaultDensity }
}

/** Authorization is checked by the caller; ownership is also scoped to the connected account. */
export async function loadEditorDetail({ userId, accountId }: AccountScope, params: SearchParams) {
  const id = firstValue(params.id)
  const ideaParam = firstValue(params.ide)
  const postId = isUuid(id) ? id : null
  const now = new Date()
  // Check account ownership before loading dependent records or signing their media.
  const post = postId ? await getPost(userId, postId, accountId) : null
  const jobPromise = post ? getContentJob(userId, post.id) : Promise.resolve(null)
  const [job, slides, idea, threadItems, schedule, taken] = await Promise.all([
    jobPromise,
    post ? listUnfinishedSlides(userId, post.id) : [],
    jobPromise.then((job) => job?.kind === 'script' && job.idea_id
      ? getAccountIdea(userId, accountId, job.idea_id)
      : !postId && isUuid(ideaParam) ? getAccountIdea(userId, accountId, ideaParam) : null),
    post ? listThreadItems(userId, post.id) : [],
    getScheduleSettings(userId, accountId).catch(logAndNull),
    listTakenTimes(userId, accountId, now, new Date(now.getTime() + SLOT_LOOKAHEAD_DAYS * DAY_MS)).catch(() => []),
  ])
  return {
    post, job, idea, threadItems,
    slides: slides.map(({ id, position, format, status, error }) => ({
      id, position, format, status: status === 'ready' ? 'generating' as const : status, error,
    })),
    queue: schedule ? nextEmptySlots(schedule.slots, taken, now, 5).map((at) => toSlot(at, now)) : [],
  }
}

function logAndNull(error: unknown): null {
  console.error('[buat] data pendukung gagal dimuat:', describeError(error))
  return null
}
