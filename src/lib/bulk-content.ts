import 'server-only'
import { bulkStage, type BulkPlanItem, type BulkStatus } from './chat-options'
import type { ContentJob } from './content-jobs'
import { AUTO_PRODUCT, AUTO_REFERENCE, type ContentRequest } from './content-options'
import type { TextDensity } from './density-options'
import { db, unwrap } from './supabase'

/** Most posts one status request may ask about: the strategy's weekly maximum, with room to spare. */
export const MAX_BULK_POLL = 20

type JobRow = Pick<ContentJob, 'post_id' | 'idea_id' | 'kind' | 'status' | 'error'>

/**
 * How far each post of a bulk card got, in the order asked. Scoped to the owner's connected account; a post that
 * isn't theirs, or was deleted, reads as `gone`.
 */
export async function getBulkStatuses(userId: string, accountId: string, postIds: string[]): Promise<BulkStatus[]> {
  if (postIds.length === 0) return []
  const [jobResult, slideResult] = await Promise.all([
    db().from('content_jobs').select('post_id, idea_id, kind, status, error')
      .eq('user_id', userId).eq('account_id', accountId).in('post_id', postIds),
    db().from('post_slides').select('post_id, status').eq('user_id', userId).in('post_id', postIds).neq('status', 'ready'),
  ])
  const jobs = new Map((unwrap(jobResult) as JobRow[]).map((job) => [job.post_id, job]))
  const slides = unwrap(slideResult) as { post_id: string; status: string }[]

  return postIds.map((postId): BulkStatus => {
    const job = jobs.get(postId) ?? null
    const own = slides.filter((slide) => slide.post_id === postId)
    const stage = bulkStage(job, { inProgress: own.filter((slide) => slide.status === 'pending' || slide.status === 'generating').length })
    return {
      postId,
      stage,
      error: stage === 'failed' ? (job?.error ?? null) : null,
      failedSlides: stage === 'done' ? own.filter((slide) => slide.status === 'failed' || slide.status === 'cancelled').length : 0,
    }
  })
}

/**
 * What Buat's composer would send for one approved plan item: shared text/product choices, portrait slides that
 * follow the account's references, no logo, the item's pillar. Pure, for tests.
 */
export function bulkContentRequest(
  item: Pick<BulkPlanItem, 'title' | 'slides' | 'pillarId'>,
  ideaId: string,
  density: TextDensity,
  productGroupId: string | null = AUTO_PRODUCT,
): ContentRequest {
  return {
    topic: item.title,
    slides: item.slides,
    format: '4:5',
    referenceId: AUTO_REFERENCE,
    productGroupId,
    pillarId: item.pillarId,
    includeLogo: false,
    density,
    ideaId,
  }
}
