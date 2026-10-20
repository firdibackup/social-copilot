import 'server-only'
import { signMediaUrls } from './assets'
import { itemsFromCaption, type ThreadItemDraft } from './thread-items'
import { db, unwrap } from './supabase'

export type ThreadsTargetStatus = 'pending' | 'publishing' | 'published' | 'failed'

/** A post's Threads version as the editor and Kalender see it. */
export interface PostThreads {
  enabled: boolean
  status: ThreadsTargetStatus
  /** When it goes out; null while the post is off the schedule. */
  dueAt: Date | null
  attemptCount: number
  nextAttemptAt: Date | null
  lastError: string | null
  permalink: string | null
  publishedAt: Date | null
}

export interface PostThreadsRow {
  enabled: boolean
  status: ThreadsTargetStatus
  due_at: string | null
  attempt_count: number
  next_attempt_at: string | null
  last_error: string | null
  permalink: string | null
  published_at: string | null
}

/** The embed for posts queries: `post_threads(...)`. */
export const POST_THREADS_FIELDS =
  'post_threads(enabled, status, due_at, attempt_count, next_attempt_at, last_error, permalink, published_at)'

const toDate = (value: string | null) => (value ? new Date(value) : null)

/** PostgREST embeds a one-to-one relation as an object, older versions as a list. */
export function toPostThreads(value: PostThreadsRow | PostThreadsRow[] | null | undefined): PostThreads | null {
  const row = Array.isArray(value) ? value[0] : value
  if (!row) return null
  return {
    enabled: row.enabled,
    status: row.status,
    dueAt: toDate(row.due_at),
    attemptCount: row.attempt_count,
    nextAttemptAt: toDate(row.next_attempt_at),
    lastError: row.last_error,
    permalink: row.permalink,
    publishedAt: toDate(row.published_at),
  }
}

/** The owner's change was refused; the message is safe to show. */
export class PlatformError extends Error {
  override name = 'PlatformError'
}

const PLATFORM_ERRORS: Record<string, string> = {
  no_platform: 'Pilih minimal satu platform.',
  not_found: 'Post tidak ditemukan.',
  instagram_locked: 'Instagram tidak bisa diubah lagi: post ini sedang atau sudah diterbitkan di sana.',
  threads_locked: 'Threads tidak bisa diubah lagi: post ini sedang atau sudah terbit di Threads.',
  story_locked: 'Story tidak bisa diubah lagi: post ini sedang atau sudah diterbitkan di Instagram.',
  invalid_media: 'Post terjadwal untuk Instagram butuh minimal 1 foto.',
  post_locked: 'Post sedang atau mungkin sudah diterbitkan, jadi isinya tidak bisa diubah.',
  invalid_items: 'Rantai Threads tidak valid.',
}

function platformError(message: string | undefined): Error {
  const known = message ? PLATFORM_ERRORS[message] : undefined
  return known ? new PlatformError(known) : new Error(`Supabase: ${message ?? 'tidak diketahui'}`)
}

/**
 * Switches Instagram, its Story, and Threads on or off for a post (see set_post_platforms). With Instagram off the
 * Story choice is left as it was.
 */
export async function setPostPlatforms(
  userId: string,
  postId: string,
  instagram: boolean,
  threads: boolean,
  story: boolean,
): Promise<void> {
  const { error } = await db().rpc('set_post_platforms', {
    p_user_id: userId,
    p_id: postId,
    p_instagram: instagram,
    p_threads: threads,
    p_story: story,
  })
  if (error) throw platformError(error.message)
}

type Enabled = { enabled: boolean }
const enabledOf = (value: Enabled | Enabled[] | null) => (Array.isArray(value) ? value[0] : value)?.enabled ?? false

/** Where the post goes; null when it isn't the user's. */
export async function getPostTargets(
  userId: string,
  postId: string,
): Promise<{ instagram: boolean; threads: boolean; story: boolean } | null> {
  const row = unwrap(
    await db()
      .from('posts')
      .select('instagram_enabled, post_threads(enabled), post_stories(enabled)')
      .eq('id', postId)
      .eq('user_id', userId)
      .maybeSingle(),
  ) as {
    instagram_enabled: boolean
    post_threads: Enabled | Enabled[] | null
    post_stories: Enabled | Enabled[] | null
  } | null
  if (!row) return null
  return { instagram: row.instagram_enabled, threads: enabledOf(row.post_threads), story: enabledOf(row.post_stories) }
}

/** A stored chain item with its photos, for the editor. Photo URLs are signed: never log them. */
export interface StoredThreadItem {
  text: string
  media: { assetId: string; url: string; width: number; height: number }[]
  /** Already on Threads: the chain can't change any more. */
  isSent: boolean
}

interface ItemRow {
  position: number
  text: string
  container_id: string | null
  media_id: string | null
  thread_item_media: { position: number; assets: { id: string; storage_path: string; width: number; height: number } }[]
}

const ITEM_FIELDS =
  'thread_items(position, text, container_id, media_id, thread_item_media(position, assets(id, storage_path, width, height)))'

async function loadItemRows(postId: string, userId?: string): Promise<ItemRow[]> {
  let query = db().from('posts').select(`id, ${ITEM_FIELDS}`).eq('id', postId)
  if (userId) query = query.eq('user_id', userId)
  const row = unwrap(await query.maybeSingle()) as { thread_items: ItemRow[] } | null
  return [...(row?.thread_items ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((item) => ({ ...item, thread_item_media: [...item.thread_item_media].sort((a, b) => a.position - b.position) }))
}

/** The chain the owner stored for the post, empty while it follows the caption. */
export async function listThreadItems(userId: string, postId: string): Promise<StoredThreadItem[]> {
  const rows = await loadItemRows(postId, userId)
  const urls = await signMediaUrls(rows.flatMap((row) => row.thread_item_media.map((media) => media.assets.storage_path)))
  let urlIndex = 0
  return rows.map((row) => ({
    text: row.text,
    media: row.thread_item_media.map((media) => ({
      assetId: media.assets.id,
      url: urls[urlIndex++],
      width: media.assets.width,
      height: media.assets.height,
    })),
    isSent: row.container_id !== null || row.media_id !== null,
  }))
}

const toJsonItems = (items: readonly ThreadItemDraft[]) => items.map((item) => ({ text: item.text, asset_ids: item.assetIds }))

/**
 * Replaces the post's chain; an empty one makes it follow the caption again. Without a post it starts a new post for
 * Threads only and returns its id.
 */
export async function saveThreadItems(userId: string, postId: string | null, items: readonly ThreadItemDraft[]): Promise<string> {
  const { data, error } = await db().rpc('save_thread_items', {
    p_user_id: userId,
    p_post_id: postId,
    p_items: toJsonItems(items),
  })
  if (error) throw platformError(error.message)
  return data as string
}

/**
 * Terbitkan ke Threads for a post whose schedule already ran (Instagram published or failed): a failed or unarmed
 * Threads version goes now. False when there is nothing to send.
 */
export async function publishThreadsNow(userId: string, postId: string): Promise<boolean> {
  const rows: unknown[] = unwrap(
    await db()
      .from('post_threads')
      .update({
        status: 'pending',
        due_at: new Date().toISOString(),
        attempt_count: 0,
        next_attempt_at: null,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('post_id', postId)
      .eq('user_id', userId)
      .eq('enabled', true)
      .or('status.eq.failed,and(status.eq.pending,due_at.is.null)')
      .select('post_id'),
  )
  return rows.length === 1
}

// Worker side

export interface ClaimedThreads {
  postId: string
  userId: string
  /** The Instagram account (brand) the post belongs to. */
  accountId: string | null
  dueAt: Date
  attemptCount: number
}

export async function claimDueThreads(): Promise<ClaimedThreads | null> {
  const rows = unwrap(await db().rpc('claim_due_threads')) as {
    post_id: string
    user_id: string
    account_id: string | null
    due_at: string | null
    attempt_count: number
  }[]
  const row = rows[0]
  if (!row) return null
  return {
    postId: row.post_id,
    userId: row.user_id,
    accountId: row.account_id,
    // A claim always has a time; a missing one would mean "now".
    dueAt: row.due_at ? new Date(row.due_at) : new Date(),
    attemptCount: row.attempt_count,
  }
}

/** A chain item as the worker publishes it. */
export interface PublishItem {
  position: number
  text: string
  containerId: string | null
  mediaId: string | null
  storagePaths: string[]
}

const toPublishItems = (rows: ItemRow[]): PublishItem[] =>
  rows.map((row) => ({
    position: row.position,
    text: row.text,
    containerId: row.container_id,
    mediaId: row.media_id,
    storagePaths: row.thread_item_media.map((media) => media.assets.storage_path),
  }))

/**
 * The chain to publish. One that still follows the caption is frozen into rows first (materialize_thread_items), so
 * every item's container and media id has a place and a retry continues where this attempt stopped.
 */
export async function loadPublishItems(postId: string): Promise<PublishItem[]> {
  const stored = await loadItemRows(postId)
  if (stored.length > 0) return toPublishItems(stored)
  const post = unwrap(
    await db().from('posts').select('caption, post_media(position, asset_id)').eq('id', postId).maybeSingle(),
  ) as { caption: string; post_media: { position: number; asset_id: string }[] } | null
  if (!post) return []
  const assetIds = [...post.post_media].sort((a, b) => a.position - b.position).map((media) => media.asset_id)
  unwrap(
    await db().rpc('materialize_thread_items', {
      p_post_id: postId,
      p_items: toJsonItems(itemsFromCaption(post.caption, assetIds)),
    }),
  )
  return toPublishItems(await loadItemRows(postId))
}

async function updateItem(postId: string, position: number, values: Record<string, unknown>): Promise<void> {
  unwrap(await db().from('thread_items').update(values).eq('post_id', postId).eq('position', position))
}

/** Saved before publishing: from then on the item may be on Threads. */
export const setItemContainer = (postId: string, position: number, containerId: string | null) =>
  updateItem(postId, position, { container_id: containerId })

export const setItemMedia = (postId: string, position: number, mediaId: string) =>
  updateItem(postId, position, { media_id: mediaId })

/** The chain's first post and its link, once out. */
export async function setThreadsResult(postId: string, mediaId: string, permalink: string | null): Promise<void> {
  unwrap(
    await db()
      .from('post_threads')
      .update({ media_id: mediaId, permalink, updated_at: new Date().toISOString() })
      .eq('post_id', postId),
  )
}

/** Ends the attempt (see settle_threads): published, failed, or pending again at `nextAttemptAt`. */
export async function settleThreads(
  postId: string,
  status: 'pending' | 'published' | 'failed',
  error: string | null,
  nextAttemptAt: Date | null,
): Promise<void> {
  unwrap(
    await db().rpc('settle_threads', {
      p_post_id: postId,
      p_status: status,
      p_error: error,
      p_next_attempt_at: nextAttemptAt?.toISOString() ?? null,
    }),
  )
}
