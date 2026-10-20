import 'server-only'
import { db, unwrap } from './supabase'

export type StoryStatus = 'pending' | 'publishing' | 'published' | 'failed'

/** A post's Story as the editor and Kalender see it. */
export interface PostStory {
  enabled: boolean
  status: StoryStatus
  lastError: string | null
}

export interface PostStoryRow {
  enabled: boolean
  status: StoryStatus
  last_error: string | null
}

/** The embed for posts queries: `post_stories(...)`. */
export const POST_STORY_FIELDS = 'post_stories(enabled, status, last_error)'

/** PostgREST embeds a one-to-one relation as an object, older versions as a list. */
export function toPostStory(value: PostStoryRow | PostStoryRow[] | null | undefined): PostStory | null {
  const row = Array.isArray(value) ? value[0] : value
  if (!row) return null
  return { enabled: row.enabled, status: row.status, lastError: row.last_error }
}

/** Whether the account's new Instagram posts share to Story by default. */
export async function getStoryDefault(userId: string, accountId: string): Promise<boolean> {
  const row = unwrap(
    await db()
      .from('schedule_settings')
      .select('always_share_to_story')
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .maybeSingle(),
  ) as { always_share_to_story: boolean } | null
  return row?.always_share_to_story ?? false
}

/** Leaves the slots alone: a row made here keeps following the Brand strategy. */
export async function setStoryDefault(userId: string, accountId: string, enabled: boolean): Promise<void> {
  unwrap(
    await db()
      .from('schedule_settings')
      .upsert(
        { user_id: userId, account_id: accountId, always_share_to_story: enabled, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,account_id' },
      ),
  )
}

/** Scheduled Instagram posts of the account that don't share to Story yet. */
export async function countStoryCandidates(userId: string, accountId: string): Promise<number> {
  const count = unwrap(await db().rpc('story_candidates', { p_user_id: userId, p_account_id: accountId })) as number
  return count ?? 0
}

/** Turns Story on for those posts; returns how many changed. */
export async function applyStoryToScheduled(userId: string, accountId: string): Promise<number> {
  const count = unwrap(await db().rpc('apply_story_to_scheduled', { p_user_id: userId, p_account_id: accountId })) as number
  return count ?? 0
}

/** Coba lagi for a failed Story. False when there is nothing to retry. */
export async function retryStory(userId: string, postId: string): Promise<boolean> {
  return unwrap(await db().rpc('retry_story', { p_user_id: userId, p_post_id: postId })) as boolean
}

// Worker side

export interface ClaimedStory {
  postId: string
  userId: string
  accountId: string | null
  dueAt: Date
  attemptCount: number
  containerId: string | null
}

export async function claimDueStory(): Promise<ClaimedStory | null> {
  const rows = unwrap(await db().rpc('claim_due_story')) as {
    post_id: string
    user_id: string
    account_id: string | null
    due_at: string | null
    attempt_count: number
    container_id: string | null
  }[]
  const row = rows[0]
  if (!row) return null
  return {
    postId: row.post_id,
    userId: row.user_id,
    accountId: row.account_id,
    dueAt: row.due_at ? new Date(row.due_at) : new Date(),
    attemptCount: row.attempt_count,
    containerId: row.container_id,
  }
}

/** Saved before publishing: from then on the Story may be on Instagram. */
export async function setStoryContainer(postId: string, containerId: string | null): Promise<void> {
  unwrap(
    await db()
      .from('post_stories')
      .update({ container_id: containerId, updated_at: new Date().toISOString() })
      .eq('post_id', postId),
  )
}

export interface StorySettlement {
  status: 'pending' | 'published' | 'failed'
  error: string | null
  nextAttemptAt: Date | null
  mediaId: string | null
  clearContainer: boolean
}

/** Ends the attempt (see settle_story). */
export async function settleStory(postId: string, settlement: StorySettlement): Promise<void> {
  unwrap(
    await db().rpc('settle_story', {
      p_post_id: postId,
      p_status: settlement.status,
      p_error: settlement.error,
      p_next_attempt_at: settlement.nextAttemptAt?.toISOString() ?? null,
      p_media_id: settlement.mediaId,
      p_clear_container: settlement.clearContainer,
    }),
  )
}
