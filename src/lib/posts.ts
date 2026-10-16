import 'server-only'
import { signMediaUrls } from './assets'
import { truncate } from './brand-options'
import type { ContentPlan } from './content-ai'
import type { ContentRequest } from './content-options'
import type { PostStatus } from './post-status'
import { db, unwrap } from './supabase'

const POST_FIELDS =
  'id, title, caption, status, scheduled_at, published_at, attempt_count, next_attempt_at, last_error, ig_container_id, ig_permalink'
const MEDIA_FIELDS = 'post_media(position, assets(id, storage_path, width, height))'
const LIST_LIMIT = 200

export type AttemptOutcome = 'published' | 'retry' | 'failed'

export interface PostMedia {
  assetId: string
  /** Its place in post_media; there can be gaps until the post is saved again. */
  position: number
  url: string
  width: number
  height: number
}

export interface Post {
  id: string
  /** Short name for lists; may be empty, see postLabel. */
  title: string
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
  userId: string
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
  title: string
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
    title: row.title,
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
      position: item.position,
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
export async function listPosts(userId: string, filter: PostFilter = {}): Promise<Post[]> {
  let query = db().from('posts').select(`${POST_FIELDS}, ${MEDIA_FIELDS}`).eq('user_id', userId)
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

export async function getPost(userId: string, id: string): Promise<Post | null> {
  const row = unwrap(
    await db()
      .from('posts')
      .select(`${POST_FIELDS}, ${MEDIA_FIELDS}`)
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle()
      .overrideTypes<PostRow | null, { merge: false }>(),
  )
  return row ? (await toPosts([row], false))[0] : null
}

/** Creates or replaces a post's content in one transaction (see `save_post`). Returns the post id. */
export async function savePost(userId: string, input: PostInput): Promise<string> {
  const { data, error } = await db().rpc('save_post', {
    p_user_id: userId,
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
async function updateIfStatus(
  userId: string,
  id: string,
  statuses: PostStatus[],
  values: Record<string, unknown>,
): Promise<boolean> {
  const rows: unknown[] = unwrap(
    await db()
      .from('posts')
      .update({ ...values, updated_at: now() })
      .eq('id', id)
      .eq('user_id', userId)
      .in('status', statuses)
      .select('id'),
  )
  return rows.length === 1
}

export function cancelPost(userId: string, id: string): Promise<boolean> {
  return updateIfStatus(userId, id, ['scheduled'], { status: 'cancelled', next_attempt_at: null })
}

/** Publishes now. Keeps ig_container_id, so the worker checks Instagram before publishing again. */
export function retryPost(userId: string, id: string): Promise<boolean> {
  return updateIfStatus(userId, id, ['failed', 'cancelled'], {
    status: 'scheduled',
    scheduled_at: now(),
    attempt_count: 0,
    next_attempt_at: null,
    last_error: null,
  })
}

/** Removes the post from the app only; a published post stays on Instagram. */
export async function deletePost(userId: string, id: string): Promise<boolean> {
  const rows: unknown[] = unwrap(
    await db().from('posts').delete().eq('id', id).eq('user_id', userId).neq('status', 'publishing').select('id'),
  )
  return rows.length === 1
}

const LABEL_MAX_LENGTH = 80

/** What a list calls a post: its title, else its caption's first line. */
export function postLabel(post: Pick<Post, 'title' | 'caption'>): string {
  const label = post.title || post.caption.split('\n', 1)[0].trim()
  return label ? truncate(label, LABEL_MAX_LENGTH) : 'Tanpa judul'
}

/** A post in Buat's list: not published yet, so still worth opening in the editor. */
export interface ContentListItem {
  id: string
  label: string
  status: PostStatus
  scheduledAt: Date | null
  coverUrl: string | null
  /** Photos plus slides still being made. */
  slideCount: number
  /** Slides still waiting or being made. */
  inProgress: number
}

const WORK_STATUSES: PostStatus[] = ['draft', 'scheduled', 'failed', 'cancelled']
// ponytail: the 50 most recently changed posts; paginate if the list outgrows them.
const CONTENT_LIST_LIMIT = 50

interface ContentListRow {
  id: string
  title: string
  caption: string
  status: PostStatus
  scheduled_at: string | null
  post_media: { position: number; assets: { storage_path: string } }[]
  post_slides: { status: string }[]
}

/** Most recently changed first. */
export async function listContentPosts(userId: string): Promise<ContentListItem[]> {
  const rows = unwrap(
    await db()
      .from('posts')
      .select('id, title, caption, status, scheduled_at, post_media(position, assets(storage_path)), post_slides(status)')
      .eq('user_id', userId)
      .in('status', WORK_STATUSES)
      .order('updated_at', { ascending: false })
      .limit(CONTENT_LIST_LIMIT)
      .overrideTypes<ContentListRow[], { merge: false }>(),
  )
  const covers = rows.map((row) => [...row.post_media].sort((a, b) => a.position - b.position)[0]?.assets.storage_path)
  const urls = await signMediaUrls(covers.filter((path): path is string => Boolean(path)))
  let urlIndex = 0
  return rows.map((row, index) => {
    const unfinished = row.post_slides.filter((slide) => slide.status !== 'ready')
    return {
      id: row.id,
      label: postLabel(row),
      status: row.status,
      scheduledAt: toDate(row.scheduled_at),
      coverUrl: covers[index] ? urls[urlIndex++] : null,
      slideCount: row.post_media.length + unfinished.length,
      inProgress: unfinished.filter((slide) => slide.status === 'pending' || slide.status === 'generating').length,
    }
  })
}

/** A reference the user doesn't have. The message is safe to show. */
export class ContentError extends Error {
  override name = 'ContentError'
}

/** The draft of an AI post with its slides waiting for their images, in one transaction (see create_content). */
export async function createContentPost(userId: string, request: ContentRequest, plan: ContentPlan): Promise<string> {
  const { data, error } = await db().rpc('create_content', {
    p_user_id: userId,
    p_title: plan.title,
    p_caption: plan.caption,
    p_slides: plan.slides.map((slide) => ({
      headline: slide.headline,
      scene: slide.scene,
      format: request.format,
      reference_id: request.referenceId,
      include_logo: request.includeLogo,
    })),
    p_idea_id: request.ideaId,
  })
  if (error?.message === 'invalid_reference') throw new ContentError('Referensi brand tidak ditemukan.')
  if (error) throw new Error(`Supabase: ${error.message}`)
  return data as string
}

/** Copies caption and photos into a new draft. Returns the new id, or null when the post is gone. */
export async function duplicatePost(userId: string, id: string): Promise<string | null> {
  const post = await getPost(userId, id)
  if (!post) return null
  return savePost(userId, {
    id: null,
    caption: post.caption,
    status: 'draft',
    scheduledAt: null,
    assetIds: post.media.map((item) => item.assetId),
  })
}

// Worker side

export async function claimDuePost(): Promise<ClaimedPost | null> {
  const rows: (PostRow & { user_id: string })[] = unwrap(await db().rpc('claim_due_post'))
  const row = rows[0]
  if (!row?.scheduled_at) return null
  return {
    id: row.id,
    userId: row.user_id,
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
