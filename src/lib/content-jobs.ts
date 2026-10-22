import 'server-only'
import type { ContentRequest } from './content-options'
import type { TextDensity } from './density-options'
import type { ScriptSlide } from './script-options'
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
  payload: { density?: TextDensity; request?: ContentRequest; script?: ScriptSlide[] | null; attachmentPath?: string | null }
}

export const jobWorking = (job: ContentJob | null) => job?.status === 'pending' || job?.status === 'running'

export async function getContentJob(userId: string, postId: string): Promise<ContentJob | null> {
  return unwrap(await db().from('content_jobs').select('*').eq('user_id', userId).eq('post_id', postId).maybeSingle())
}

export async function enqueueContentJob(userId: string, accountId: string, requestKey: string, ideaId: string | null,
  kind: ContentJob['kind'], payload: ContentJob['payload']): Promise<string> {
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
