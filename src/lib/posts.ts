import 'server-only'
import { signMediaUrls } from './assets'
import type { PostStatus } from './post-status'
import { db, unwrap } from './supabase'

const POST_FIELDS =
  'id, caption, status, scheduled_at, published_at, attempt_count, next_attempt_at, last_error, ig_container_id, ig_permalink'
const MEDIA_FIELDS = 'post_media(position, assets(id, storage_path, width, height))'
const LIST_LIMIT = 200

export type AttemptOutcome = 'published' | 'retry' | 'failed'

export interface PostMedia {
  assetId: string
  url: string
  width: number
  height: number
}

export interface Post {
  id: string
  caption: string
  status: PostStatus
  scheduledAt: Date | null
  publishedAt: Date | null
  attemptCount: number
  nextAttemptAt: Date | null
  lastError: string | null
  /** Instagram may already have this post (a container exists): its content can't change. */
  isLocked: boolean
  permalink: string | null
  /** Lists carry only the cover photo; `mediaCount` has the full count. */
  media: PostMedia[]
  mediaCount: number
}

export interface PostInput {
  id: string | null
  caption: string
  status: 'draft' | 'scheduled'
  scheduledAt: Date | null
  assetIds: string[]
}

/** What the worker needs from a post it claimed. */
export interface ClaimedPost {
  id: string
  caption: string
  scheduledAt: Date
  attemptCount: number
  igContainerId: string | null
}

interface MediaRow {
  position: number
  assets: { id: string; storage_path: string; width: number; height: number }
}

interface PostRow {
  id: string
  caption: string
  status: PostStatus
  scheduled_at: string | null
  published_at: string | null
  attempt_count: number
  next_attempt_at: string | null
  last_error: string | null
  ig_container_id: string | null
  ig_permalink: string | null
  post_media: MediaRow[]
}

/** The editor's change was refused because the worker owns the post or Instagram may have it. */
export class PostLockedError extends Error {
  override name = 'PostLockedError'
}

const toDate = (value: string | null) => (value ? new Date(value) : null)
const now = () => new Date().toISOString()

async function toPosts(rows: PostRow[], coverOnly: boolean): Promise<Post[]> {
  const withMedia = rows.map((row) => ({
    row,
    media: [...row.post_media].sort((a, b) => a.position - b.position).slice(0, coverOnly ? 1 : undefined),
  }))
  const urls = await signMediaUrls(withMedia.flatMap(({ media }) => media.map((item) => item.assets.storage_path)))

  let urlIndex = 0
  return withMedia.map(({ row, media }) => ({
    id: row.id,
    caption: row.caption,
    status: row.status,
    scheduledAt: toDate(row.scheduled_at),
    publishedAt: toDate(row.published_at),
    attemptCount: row.attempt_count,
    nextAttemptAt: toDate(row.next_attempt_at),
    lastError: row.last_error,
    isLocked: row.ig_container_id !== null,
    permalink: row.ig_permalink,
    media: media.map((item) => ({
      assetId: item.assets.id,
      url: urls[urlIndex++],
      width: item.assets.width,
      height: item.assets.height,
    })),
    mediaCount: row.post_media.length,
  }))
}

export interface PostFilter {
  status?: PostStatus
  /** Scheduled at or after. */
  from?: Date
  /** Scheduled before. */
  to?: Date
}

/** Newest schedule first; posts without a date (drafts) come first. */
export async function listPosts(filter: PostFilter = {}): Promise<Post[]> {
  let query = db().from('posts').select(`${POST_FIELDS}, ${MEDIA_FIELDS}`)
  if (filter.status) query = query.eq('status', filter.status)
  if (filter.from) query = query.gte('scheduled_at', filter.from.toISOString())
  if (filter.to) query = query.lt('scheduled_at', filter.to.toISOString())
  const rows = unwrap(
    await query
      .order('scheduled_at', { ascending: false, nullsFirst: true })
      .limit(LIST_LIMIT)
      .overrideTypes<PostRow[], { merge: false }>(),
  )
  return toPosts(rows, true)
}

export async function getPost(id: string): Promise<Post | null> {
  const row = unwrap(
    await db()
      .from('posts')
      .select(`${POST_FIELDS}, ${MEDIA_FIELDS}`)
      .eq('id', id)
      .maybeSingle()
      .overrideTypes<PostRow | null, { merge: false }>(),
  )
  return row ? (await toPosts([row], false))[0] : null
}

/** Creates or replaces a post's content in one transaction (see `save_post`). Returns the post id. */
export async function savePost(input: PostInput): Promise<string> {
  const { data, error } = await db().rpc('save_post', {
    p_id: input.id,
    p_caption: input.caption,
    p_status: input.status,
    p_scheduled_at: input.scheduledAt?.toISOString() ?? null,
    p_asset_ids: input.assetIds,
  })
  if (error?.message === 'post_locked') {
    throw new PostLockedError('Post sedang atau mungkin sudah diterbitkan, jadi isinya tidak bisa diubah.')
  }
  if (error) throw new Error(`Supabase: ${error.message}`)
  return data as string
}

/** Updates the post only while it is in one of `statuses`. False means the worker got there first. */
async function updateIfStatus(id: string, statuses: PostStatus[], values: Record<string, unknown>): Promise<boolean> {
  const rows: unknown[] = unwrap(
    await db()
      .from('posts')
      .update({ ...values, updated_at: now() })
      .eq('id', id)
      .in('status', statuses)
      .select('id'),
  )
  return rows.length === 1
}

export function cancelPost(id: string): Promise<boolean> {
  return updateIfStatus(id, ['scheduled'], { status: 'cancelled', next_attempt_at: null })
}

/** Publishes now. Keeps ig_container_id, so the worker checks Instagram before publishing again. */
export function retryPost(id: string): Promise<boolean> {
  return updateIfStatus(id, ['failed', 'cancelled'], {
    status: 'scheduled',
    scheduled_at: now(),
    attempt_count: 0,
    next_attempt_at: null,
    last_error: null,
  })
}

/** Removes the post from the app only; a published post stays on Instagram. */
export async function deletePost(id: string): Promise<boolean> {
  const rows: unknown[] = unwrap(await db().from('posts').delete().eq('id', id).neq('status', 'publishing').select('id'))
  return rows.length === 1
}

/** Copies caption and photos into a new draft. Returns the new id, or null when the post is gone. */
export async function duplicatePost(id: string): Promise<string | null> {
  const post = await getPost(id)
  if (!post) return null
  return savePost({
    id: null,
    caption: post.caption,
    status: 'draft',
    scheduledAt: null,
    assetIds: post.media.map((item) => item.assetId),
  })
}

// Worker side

export async function claimDuePost(): Promise<ClaimedPost | null> {
  const rows: PostRow[] = unwrap(await db().rpc('claim_due_post'))
  const row = rows[0]
  if (!row?.scheduled_at) return null
  return {
    id: row.id,
    caption: row.caption,
    scheduledAt: new Date(row.scheduled_at),
    attemptCount: row.attempt_count,
    igContainerId: row.ig_container_id,
  }
}

/** Storage paths of the post's photos, in carousel order. */
export async function getMediaPaths(postId: string): Promise<string[]> {
  const rows = unwrap(
    await db()
      .from('post_media')
      .select('position, assets(storage_path)')
      .eq('post_id', postId)
      .order('position')
      .overrideTypes<{ assets: { storage_path: string } }[], { merge: false }>(),
  )
  return rows.map((row) => row.assets.storage_path)
}

async function updatePost(id: string, values: Record<string, unknown>): Promise<void> {
  unwrap(
    await db()
      .from('posts')
      .update({ ...values, updated_at: now() })
      .eq('id', id),
  )
}

export function setContainerId(id: string, containerId: string | null): Promise<void> {
  return updatePost(id, { ig_container_id: containerId })
}

/** `mediaId` is null when only the container status proved the post went out. */
export function markPublished(id: string, mediaId: string | null): Promise<void> {
  return updatePost(id, {
    status: 'published',
    published_at: now(),
    ig_media_id: mediaId,
    locked_at: null,
    next_attempt_at: null,
    last_error: null,
  })
}

export function setPermalink(id: string, permalink: string): Promise<void> {
  return updatePost(id, { ig_permalink: permalink })
}

export function scheduleRetry(id: string, at: Date, error: string): Promise<void> {
  return updatePost(id, { status: 'scheduled', next_attempt_at: at.toISOString(), locked_at: null, last_error: error })
}

/** `clearContainer` only when the post certainly did not go out; otherwise the content stays locked. */
export function markFailed(id: string, error: string, clearContainer: boolean): Promise<void> {
  return updatePost(id, {
    status: 'failed',
    locked_at: null,
    next_attempt_at: null,
    last_error: error,
    ...(clearContainer ? { ig_container_id: null } : {}),
  })
}

export async function startAttempt(postId: string): Promise<number> {
  const row = unwrap(
    await db().from('publish_attempts').insert({ post_id: postId }).select('id').single<{ id: number }>(),
  )
  return row.id
}

export async function finishAttempt(attemptId: number, outcome: AttemptOutcome, error: string | null): Promise<void> {
  unwrap(
    await db()
      .from('publish_attempts')
      .update({ finished_at: now(), outcome, error })
      .eq('id', attemptId),
  )
}
