import { createTranslator } from 'next-intl'
import type { Locale } from '@/i18n/locale-config'
import idMessages from '../../messages/id/mimo.json'
import enMessages from '../../messages/en/mimo.json'

const scheduleTranslator = (locale: Locale) => createTranslator({ locale, messages: locale === 'en' ? enMessages : idMessages, namespace: 'schedule' })
import 'server-only'
import { getPlan } from './app-settings'
import { getCurrentPeriod } from './billing'
import { getBillingCatalog } from './billing-catalog'
import type { BillingCatalog } from './billing-catalog-options'
import { contentCost } from './billing-options'
import { inspectCaption } from './caption'
import { MAX_SCHEDULE_ITEMS, type ScheduleData, type ScheduleItem, type ScheduleRef } from './chat-schedule-options'
import { getContentJob, jobWorking, type ContentJob } from './content-jobs'
import { toWibInput } from './format'
import { getAccountIdea, listIdeas } from './ideas'
import { getPost, listContentPosts, PostLockedError } from './posts'
import { scheduleProblem } from './publish-checks'
import { getScheduleSettings, listTakenTimes } from './schedule'
import { nextEmptySlots, SLOT_LOOKAHEAD_DAYS } from './schedule-slots'
import { listUnfinishedSlides } from './slides'
import { db, unwrap } from './supabase'

export async function commitMimoSchedule(userId: string, accountId: string, postId: string, at: Date, locale: Locale = 'id'): Promise<void> {
  const t = scheduleTranslator(locale)
  const { error } = await db().rpc('schedule_sigap_post', {
    p_user_id: userId, p_account_id: accountId, p_id: postId, p_scheduled_at: at.toISOString(),
  })
  if (!error) return
  const messages: Record<string, string> = {
    wrong_account: t('wrongAccount'),
    post_locked: t('locked'),
    invalid_time: t('invalidTime'),
    content_not_ready: t('notReady'),
    slot_taken: t('taken'),
    invalid_media: t('media'),
  }
  if (messages[error.message]) throw new PostLockedError(messages[error.message])
  throw new Error(`Supabase: ${error.message}`)
}

export async function scheduleIdeaJob(userId: string, accountId: string, ideaId: string): Promise<ContentJob | null> {
  return unwrap(await db().from('content_jobs').select('*').eq('user_id', userId).eq('account_id', accountId)
    .eq('idea_id', ideaId).maybeSingle())
}

/** Re-read the same Buat sources for both the card and its mutations. Never trust a client readiness flag. */
export async function readScheduleItem(userId: string, accountId: string, ref: ScheduleRef, rates?: BillingCatalog['rates'], locale: Locale = 'id'): Promise<ScheduleItem> {
  const t = scheduleTranslator(locale)
  const item: ScheduleItem = { ...ref, postId: null, stage: 'gone', reason: t('gone'), scheduledAt: null, imageCost: null }
  const linked = ref.kind === 'idea' ? await scheduleIdeaJob(userId, accountId, ref.id) : null
  const postId = ref.kind === 'post' ? ref.id : linked?.post_id
  if (!postId) {
    const idea = await getAccountIdea(userId, accountId, ref.id)
    if (!idea) return item
    return { ...item, title: idea.title, stage: idea.script ? 'script' : 'blocked',
      reason: idea.script ? t('scriptReady') : t('writeScript'),
      imageCost: idea.script ? contentCost(idea.script.length, rates) : null }
  }
  const post = await getPost(userId, postId, accountId)
  if (!post) return item
  Object.assign(item, { postId, title: post.title || ref.title, scheduledAt: post.scheduledAt?.toISOString() ?? null })
  if (post.status === 'scheduled') return { ...item, stage: 'scheduled', reason: t('scheduled') }
  if (post.status !== 'draft' || post.isLocked) return { ...item, stage: 'blocked', reason: t('notDraft') }
  const [job, slides] = await Promise.all([linked ?? getContentJob(userId, postId), listUnfinishedSlides(userId, postId)])
  if (jobWorking(job) || slides.some((slide) => slide.status === 'pending' || slide.status === 'generating')) {
    return { ...item, stage: 'processing', reason: t('processing') }
  }
  if (job && job.status !== 'ready') return { ...item, stage: 'blocked', reason: job.error || t('failed') }
  if (job?.kind === 'script') {
    const idea = job.idea_id ? await getAccountIdea(userId, accountId, job.idea_id) : null
    return { ...item, stage: idea?.script ? 'script' : 'blocked',
      reason: idea?.script ? t('scriptReady') : t('scriptMissing'),
      imageCost: idea?.script ? contentCost(idea.script.length, rates) : null }
  }
  if (slides.length > 0) return { ...item, stage: 'blocked', reason: t('slidesFailed') }
  const errors = post.instagramEnabled ? inspectCaption(post.caption, locale).errors : []
  const problem = errors.length ? t('fix', { errors: errors.join(' ') }) : await scheduleProblem(userId, accountId, {
    postId, instagram: post.instagramEnabled, threads: post.threads?.enabled ?? false,
    caption: post.caption, assetIds: post.media.map((media) => media.assetId),
  }, locale)
  return { ...item, stage: problem ? 'blocked' : 'ready', reason: problem || t('ready') }
}

export async function discoverScheduleRefs(userId: string, accountId: string, query: string, locale: Locale = 'id'): Promise<ScheduleRef[]> {
  const [posts, ideas] = await Promise.all([listContentPosts(userId, accountId, locale), listIdeas(userId, accountId)])
  const words = query.toLocaleLowerCase('id').split(/\s+/).filter(Boolean)
  const matches = (title: string) => words.every((word) => title.toLocaleLowerCase('id').includes(word))
  const refs: ScheduleRef[] = posts.filter((post) => post.status === 'draft' && matches(post.label))
    .map((post) => ({ kind: 'post', id: post.id, title: post.label }))
  const jobs = ideas.length ? unwrap(await db().from('content_jobs').select('idea_id').eq('user_id', userId)
    .eq('account_id', accountId).in('idea_id', ideas.map((idea) => idea.id))) as { idea_id: string }[] : []
  const linked = new Set(jobs.map((job) => job.idea_id))
  refs.push(...ideas.filter((idea) => idea.script && !linked.has(idea.id) && matches(idea.title))
    .map((idea): ScheduleRef => ({ kind: 'idea', id: idea.id, title: idea.title })))
  return refs.slice(0, MAX_SCHEDULE_ITEMS)
}

export async function loadScheduleData(userId: string, accountId: string, refs: ScheduleRef[], from?: Date, locale: Locale = 'id'): Promise<ScheduleData> {
  const now = new Date()
  const start = from && from > now ? from : now
  const end = new Date(start.getTime() + SLOT_LOOKAHEAD_DAYS * 86400000)
  const billing = await getBillingCatalog()
  const [items, settings, taken, period] = await Promise.all([
    Promise.all(refs.map((ref) => readScheduleItem(userId, accountId, ref, billing.catalog.rates, locale))),
    getScheduleSettings(userId, accountId), listTakenTimes(userId, accountId, start, end), getCurrentPeriod(userId),
  ])
  const plan = period?.plan ?? await getPlan()
  return { items, slots: nextEmptySlots(settings.slots, taken, start, MAX_SCHEDULE_ITEMS).map(toWibInput), planCredits: plan.credits }
}
