import 'server-only'
import type { Locale } from './ai-language'
import type { ContentRequest } from './content-options'
import type { TextDensity } from './density-options'
import type { ScriptSlide } from './script-options'
import { hasStorageRoom, StorageFullError } from './storage-quota'
import { db, unwrap } from './supabase'

export interface ContentJob {
  post_id: string
  user_id: string
  account_id: string
  idea_id: string | null
  kind: 'script' | 'content'
  status: 'pending' | 'running' | 'ready' | 'failed' | 'cancelled'
  error: string | null
  lease: string | null
  payload: {
    /** Captured at enqueue time; workers never access request cookies. */
    language?: Locale
    density?: TextDensity
    request?: ContentRequest & { language?: Locale }
    script?: ScriptSlide[] | null
    attachmentPath?: string | null
    /** A script's direction from Mimo's approved bulk plan. */
    brief?: string
    /** A script that goes straight on to its caption and images once written (finish_script_job), with this request. */
    auto?: { request: ContentRequest & { language?: Locale } }
  }
}

export const jobWorking = (job: ContentJob | null) => job?.status === 'pending' || job?.status === 'running'

export async function getContentJob(userId: string, postId: string): Promise<ContentJob | null> {
  return unwrap(await db().from('content_jobs').select('*').eq('user_id', userId).eq('post_id', postId).maybeSingle())
}

/** The job a request made, found by its request key; for a request that may run twice. */
export async function getContentJobByKey(userId: string, accountId: string, requestKey: string): Promise<ContentJob | null> {
  return unwrap(await db().from('content_jobs').select('*').eq('user_id', userId).eq('account_id', accountId)
    .eq('request_key', requestKey).maybeSingle())
}

export async function enqueueContentJob(userId: string, accountId: string, requestKey: string, ideaId: string | null,
  kind: ContentJob['kind'], payload: ContentJob['payload'], language: Locale = payload.language ?? 'id'): Promise<string> {
  // finish_script_job rebuilds payload from auto.request. Keep language there too so the atomic
  // script -> content transition preserves it without a schema or stored-procedure migration.
  payload = {
    ...payload,
    language,
    ...(payload.request ? { request: { ...payload.request, language } } : {}),
    ...(payload.auto ? { auto: { ...payload.auto, request: { ...payload.auto.request, language } } } : {}),
  }
  const createsImages = kind === 'content' || (kind === 'script' && payload.auto !== undefined)
  if (createsImages && !(await hasStorageRoom(userId))) throw new StorageFullError()
  return unwrap(await db().rpc('enqueue_content_job', {
    p_user_id: userId, p_account_id: accountId, p_request_key: requestKey, p_idea_id: ideaId, p_kind: kind, p_payload: payload,
  })) as string
}

export async function claimContentJob(): Promise<ContentJob | null> {
  const rows = unwrap(await db().rpc('claim_content_job')) as ContentJob[]
  return rows[0] ?? null
}

export async function failContentJob(job: ContentJob, message: string): Promise<void> {
  unwrap(await db().from('content_jobs').update({ status: 'failed', error: message, lease: null })
    .eq('post_id', job.post_id).eq('lease', job.lease).eq('status', 'running'))
}
