import 'server-only'
import { contentRevision, type ContentRevisionRow } from './content-revision'
import { signMediaUrls } from './assets'
import { truncate, type SlideRole } from './brand-options'
import type { ContentPlan } from './content-ai'
import type { ContentRequest } from './content-options'
import type { PostStatus } from './post-status'
import { POST_STORY_FIELDS, toPostStory, type PostStory, type PostStoryRow } from './post-stories'
import {
  getPostTargets,
  listThreadItems,
  POST_THREADS_FIELDS,
  saveThreadItems,
  setPostPlatforms,
  toPostThreads,
  type PostThreads,
  type PostThreadsRow,
} from './post-threads'
import { db, unwrap } from './supabase'

const POST_FIELDS =
  'id, title, caption, pillar_id, status, scheduled_at, published_at, attempt_count, next_attempt_at, last_error, ig_container_id, ig_permalink, instagram_enabled'
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
  pillarId: string | null
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
  /** Off for a post made for Threads only; the Instagram loop then skips it. */
  instagramEnabled: boolean
  /** The Threads version, or null when Threads was never switched on for the post. */
  threads: PostThreads | null
  /** The Story of the first slide, or null when it was never switched on for the post. */
  story: PostStory | null
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
  /** The Instagram account the post belongs to; the worker publishes only while that account is connected. */
  accountId: string | null
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
  pillar_id: string | null
  status: PostStatus
  scheduled_at: string | null
  published_at: string | null
  attempt_count: number
  next_attempt_at: string | null
  last_error: string | null
  ig_container_id: string | null
  ig_permalink: string | null
  instagram_enabled: boolean
  post_threads: PostThreadsRow | PostThreadsRow[] | null
  post_stories: PostStoryRow | PostStoryRow[] | null
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
    pillarId: row.pillar_id,
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
    instagramEnabled: row.instagram_enabled,
    threads: toPostThreads(row.post_threads),
    story: toPostStory(row.post_stories),
  }))
}

export interface PostFilter {
  status?: PostStatus
  /** Scheduled at or after. */
  from?: Date
  /** Scheduled before. */
  to?: Date
}

/** The account's posts, newest schedule first; posts without a date (drafts) come first. */
export async function listPosts(userId: string, accountId: string, filter: PostFilter = {}): Promise<Post[]> {
  let query = db()
    .from('posts')
    .select(`${POST_FIELDS}, ${POST_THREADS_FIELDS}, ${POST_STORY_FIELDS}, ${MEDIA_FIELDS}`)
    .eq('user_id', userId)
    .eq('account_id', accountId)
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
      .select(`${POST_FIELDS}, ${POST_THREADS_FIELDS}, ${POST_STORY_FIELDS}, ${MEDIA_FIELDS}`)
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
  if (error?.message === 'wrong_account') throw new PostLockedError('Post ini milik akun Instagram lain.')
  if (error) throw new Error(`Supabase: ${error.message}`)
  return data as string
}

/** Puts a finished post on the schedule without touching its content: Kalender's Pilih (see schedule_post). */
export async function schedulePost(userId: string, id: string, at: Date): Promise<void> {
  const { error } = await db().rpc('schedule_post', { p_user_id: userId, p_id: id, p_scheduled_at: at.toISOString() })
  if (error?.message === 'post_locked') {
    throw new PostLockedError('Post sedang atau mungkin sudah diterbitkan, jadi tidak bisa dijadwalkan di sini.')
  }
  if (error?.message === 'invalid_media') throw new PostLockedError('Post untuk Instagram butuh minimal 1 foto.')
  if (error?.message === 'wrong_account') throw new PostLockedError('Post ini milik akun Instagram lain.')
  if (error) throw new Error(`Supabase: ${error.message}`)
}

/** Updates the post only while it is in one of `statuses`. False means the worker got there first. */
async function updateIfStatus(
  userId: string,
  id: string,
  statuses: PostStatus[],
  values: Record<string, unknown>,
  accountId?: string,
): Promise<boolean> {
  let query = db()
    .from('posts')
    .update({ ...values, updated_at: now() })
    .eq('id', id)
    .eq('user_id', userId)
  if (accountId) query = query.eq('account_id', accountId)
  const rows: unknown[] = unwrap(await query.in('status', statuses).select('id'))
  return rows.length === 1
}

export function cancelPost(userId: string, id: string): Promise<boolean> {
  return updateIfStatus(userId, id, ['scheduled'], { status: 'cancelled', next_attempt_at: null })
}

/**
 * Publishes now, and only on the connected account. Keeps ig_container_id, so the worker checks Instagram before
 * publishing again.
 */
export function retryPost(userId: string, accountId: string, id: string): Promise<boolean> {
  return updateIfStatus(userId, id, ['failed', 'cancelled'], {
    status: 'scheduled',
    scheduled_at: now(),
    attempt_count: 0,
    next_attempt_at: null,
    last_error: null,
  }, accountId)
}

/** How many of the account's posts wait to be published, for the Putuskan dialog. */
export async function countScheduledPosts(userId: string, accountId: string): Promise<number> {
  const { count, error } = await db()
    .from('posts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('account_id', accountId)
    .eq('status', 'scheduled')
  if (error || count === null) throw new Error(`Supabase: ${error?.message || 'jumlah posting tidak terbaca'}`)
  return count
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
  revision: string
  generation?: string | null
  id: string
  label: string
  /** The caption's first line under a title, for cards that show both; empty when the label is the caption. */
  subtitle: string
  status: PostStatus
  scheduledAt: Date | null
  coverUrl: string | null
  /** Photos plus slides still being made. */
  slideCount: number
  /** Slides still waiting or being made. */
  inProgress: number
  instagramEnabled: boolean
  threadsEnabled: boolean
}

const WORK_STATUSES: PostStatus[] = ['draft', 'scheduled', 'failed', 'cancelled']
// ponytail: the 50 most recently changed posts; paginate if the list outgrows them.
const CONTENT_LIST_LIMIT = 50

interface ContentListRow {
  updated_at: string
  content_jobs?: { kind: string; status: string } | { kind: string; status: string }[] | null
  id: string
  title: string
  caption: string
  status: PostStatus
  scheduled_at: string | null
  post_media: { position: number; assets: { storage_path: string } }[]
  post_slides: { id: string; status: string; updated_at: string }[]
  instagram_enabled: boolean
  post_threads: { enabled: boolean } | { enabled: boolean }[] | null
}

const threadsEnabledOf = (value: ContentListRow['post_threads']) =>
  Boolean((Array.isArray(value) ? value[0] : value)?.enabled)

/** The account's unpublished posts, most recently changed first. */
export async function listContentPosts(userId: string, accountId: string): Promise<ContentListItem[]> {
  const rows = unwrap(
    await db()
      .from('posts')
      .select(
        'id, updated_at, title, caption, status, scheduled_at, instagram_enabled, post_media(position, assets(storage_path)), post_slides(id, status, updated_at), post_threads(enabled), content_jobs(kind, status)',
      )
      .eq('user_id', userId)
      .eq('account_id', accountId)
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
    const captionLine = row.caption.split('\n', 1)[0].trim()
    const job = Array.isArray(row.content_jobs) ? row.content_jobs[0] : row.content_jobs
    const pending = job?.status === 'pending' || job?.status === 'running'
    const generation = job?.status === 'cancelled' ? 'Pembuatan dibatalkan'
      : job?.status === 'failed' ? 'Pembuatan gagal · coba lagi'
      : pending ? (job.kind === 'script' ? 'Menyusun skrip…' : 'Menyusun caption dan slide…')
        : job?.kind === 'script' ? 'Draft · skrip siap' : null
    return {
      revision: contentRevision({ ...row, content_jobs: row.content_jobs ?? null }),
      generation,
      id: row.id,
      label: postLabel(row),
      subtitle: row.title && captionLine !== row.title ? truncate(captionLine, LABEL_MAX_LENGTH) : '',
      status: row.status,
      scheduledAt: toDate(row.scheduled_at),
      coverUrl: covers[index] ? urls[urlIndex++] : null,
      slideCount: row.post_media.length + unfinished.length,
      inProgress: (pending ? 1 : 0) + unfinished.filter((slide) => slide.status === 'pending' || slide.status === 'generating').length,
      instagramEnabled: row.instagram_enabled,
      threadsEnabled: threadsEnabledOf(row.post_threads),
    }
  })
}

/** Poll only watched drafts, with no storage signing or editor/workspace queries. */
export async function getContentRevisions(userId: string, accountId: string, ids: string[]) {
  if (ids.length === 0) return {}
  const rows = unwrap(await db().from('posts')
    .select('id, updated_at, post_slides(id, status, updated_at), content_jobs(kind, status)')
    .eq('user_id', userId).eq('account_id', accountId).in('id', ids)
    .overrideTypes<ContentRevisionRow[], { merge: false }>())
  return Object.fromEntries(rows.map((row) => [row.id, contentRevision(row)]))
}

/** A reference the user doesn't have. The message is safe to show. */
export class ContentError extends Error {
  override name = 'ContentError'
}

/** What each slide of a new post follows: its role, and a brand reference image or a style example. */
export interface SlideReference {
  role: SlideRole | null
  referenceImageId: string | null
  example: string | null
}

/**
 * The draft of an AI post with its slides waiting for their images, in one transaction (see create_content). The
 * owner's stored attachment goes only to the slides the plan uses it on.
 */
export async function createContentPost(
  userId: string,
  request: Omit<ContentRequest, 'pillarId' | 'density'> & Partial<Pick<ContentRequest, 'pillarId'>>,
  plan: ContentPlan,
  references: SlideReference[],
  attachmentPath: string | null = null,
  job?: { postId: string; lease: string },
): Promise<string> {
  const { data, error } = await db().rpc(job ? 'finish_content_job' : 'create_content', {
    ...(job ? { p_post_id: job.postId, p_lease: job.lease } : { p_user_id: userId, p_idea_id: request.ideaId }),
    p_title: plan.title,
    p_caption: plan.caption,
    p_slides: plan.slides.map((slide, index) => {
      const attached = attachmentPath !== null && slide.attachment !== ''
      return {
        headline: slide.headline,
        scene: slide.scene,
        format: request.format,
        role: references[index]?.role ?? null,
        reference_image_id: references[index]?.referenceImageId ?? null,
        example: references[index]?.example ?? null,
        product_group_id: slide.productGroupId,
        include_logo: request.includeLogo,
        attachment_path: attached ? attachmentPath : null,
        attachment_note: attached ? slide.attachment : '',
      }
    }),
    p_pillar_id: request.pillarId ?? null,
  })
  if (error?.message === 'invalid_reference') throw new ContentError('Referensi brand tidak ditemukan.')
  if (error?.message === 'invalid_product') throw new ContentError('Produk tidak ditemukan.')
  if (error) throw new Error(`Supabase: ${error.message}`)
  return data as string
}

/**
 * Copies caption and photos into a new draft, and where it goes (Story included) with its Threads chain when the post
 * has Threads.
 * Returns the new id, or null when the post is gone.
 */
export async function duplicatePost(userId: string, id: string): Promise<string | null> {
  const post = await getPost(userId, id)
  if (!post) return null
  const copyId = await savePost(userId, {
    id: null,
    caption: post.caption,
    status: 'draft',
    scheduledAt: null,
    assetIds: post.media.map((item) => item.assetId),
  })
  const threads = post.threads?.enabled ?? false
  const story = post.story?.enabled ?? false
  // The copy took the account's Story default; it keeps the original's choice instead.
  const copyStory = (await getPostTargets(userId, copyId))?.story ?? false
  if (threads || !post.instagramEnabled || story !== copyStory) {
    await setPostPlatforms(userId, copyId, post.instagramEnabled, threads, story)
  }
  if (threads || !post.instagramEnabled) {
    const items = await listThreadItems(userId, id)
    if (items.length > 0) {
      await saveThreadItems(
        userId,
        copyId,
        items.map((item) => ({ text: item.text, assetIds: item.media.map((media) => media.assetId) })),
      )
    }
  }
  return copyId
}

// Worker side

export async function claimDuePost(): Promise<ClaimedPost | null> {
  const rows: (PostRow & { user_id: string; account_id: string | null })[] = unwrap(await db().rpc('claim_due_post'))
  const row = rows[0]
  if (!row?.scheduled_at) return null
  return {
    id: row.id,
    userId: row.user_id,
    accountId: row.account_id,
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
