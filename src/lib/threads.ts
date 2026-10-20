import 'server-only'
import { env } from './env'
import { InstagramApiError, request, type LongLivedToken } from './instagram'

/** Reading replies for Balasan; connections made without it get a Hubungkan ulang notice there. */
export const THREADS_REPLIES_SCOPE = 'threads_read_replies'

/** Profile, publishing, a chain (replies to our own post) and the Komentar tab. Checked against Meta's docs 2026-10-20. */
export const THREADS_SCOPES = [
  'threads_basic',
  'threads_content_publish',
  'threads_manage_replies',
  THREADS_REPLIES_SCOPE,
] as const

const AUTHORIZE_URL = 'https://threads.com/oauth/authorize'
const GRAPH_URL = 'https://graph.threads.com'
const VERSION = '/v1.0'
const SERVICE = 'Threads'
const PAGE_SIZE = 50

const CONTAINER_STATUSES = ['EXPIRED', 'ERROR', 'FINISHED', 'IN_PROGRESS', 'PUBLISHED'] as const
export type ThreadsContainerStatus = (typeof CONTAINER_STATUSES)[number]

export interface ThreadsProfile {
  userId: string
  username: string
  /** A signed CDN link: never log it. */
  pictureUrl: string | null
}

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null
const optionalString = (value: unknown) => (typeof value === 'string' && value !== '' ? value : null)

function readString(source: Json, key: string): string {
  const value = source[key]
  if (typeof value !== 'string' || value === '') throw new InstagramApiError(`Respons Threads tanpa ${key}`, null, 200)
  return value
}

function graphUrl(path: string, params: Record<string, string>, version = VERSION): URL {
  const url = new URL(`${version}${path}`, GRAPH_URL)
  url.search = new URLSearchParams(params).toString()
  return url
}

const get = (path: string, params: Record<string, string>, version?: string) =>
  request(graphUrl(path, params, version), undefined, SERVICE)

/** POSTs keep the token in the body, out of URLs. */
const post = (path: string, params: Record<string, string>, version = VERSION) =>
  request(new URL(`${version}${path}`, GRAPH_URL), { method: 'POST', body: new URLSearchParams(params) }, SERVICE)

function toLongLivedToken(body: Json): LongLivedToken {
  const expiresIn = body.expires_in
  if (typeof expiresIn !== 'number' || expiresIn <= 0) throw new InstagramApiError('Respons Threads tanpa expires_in', null, 200)
  return { accessToken: readString(body, 'access_token'), expiresAt: new Date(Date.now() + expiresIn * 1000) }
}

export function buildThreadsAuthorizeUrl(state: string): string {
  const url = new URL(AUTHORIZE_URL)
  url.search = new URLSearchParams({
    client_id: env('THREADS_APP_ID'),
    redirect_uri: env('THREADS_REDIRECT_URI'),
    scope: THREADS_SCOPES.join(','),
    response_type: 'code',
    state,
  }).toString()
  return url.toString()
}

/** The code for a short-lived token (about an hour). The user id is read from the profile, as for Instagram. */
export async function exchangeThreadsCode(code: string): Promise<string> {
  const body = await post(
    '/oauth/access_token',
    {
      client_id: env('THREADS_APP_ID'),
      client_secret: env('THREADS_APP_SECRET'),
      grant_type: 'authorization_code',
      redirect_uri: env('THREADS_REDIRECT_URI'),
      // The redirect may end with `#_`, which is not part of the code.
      code: code.replace(/#_$/, ''),
    },
    '',
  )
  return readString(body, 'access_token')
}

/** A long-lived token: 60 days. */
export async function exchangeThreadsLongLivedToken(shortLivedToken: string): Promise<LongLivedToken> {
  const body = await get(
    '/access_token',
    { grant_type: 'th_exchange_token', client_secret: env('THREADS_APP_SECRET'), access_token: shortLivedToken },
    '',
  )
  return toLongLivedToken(body)
}

/** Another 60 days. Meta refreshes only tokens at least 24 hours old and not yet expired. */
export async function refreshThreadsToken(longLivedToken: string): Promise<LongLivedToken> {
  return toLongLivedToken(await get('/refresh_access_token', { grant_type: 'th_refresh_token', access_token: longLivedToken }, ''))
}

export async function fetchThreadsProfile(accessToken: string): Promise<ThreadsProfile> {
  const body = await get('/me', { fields: 'id,username,threads_profile_picture_url', access_token: accessToken })
  return {
    userId: readString(body, 'id'),
    username: readString(body, 'username'),
    pictureUrl: optionalString(body.threads_profile_picture_url),
  }
}

/** A media container: text, image_url, is_carousel_item, children, reply_to_id… Returns its id. */
export async function createThreadsContainer(
  accessToken: string,
  userId: string,
  params: Record<string, string>,
): Promise<string> {
  return readString(await post(`/${userId}/threads`, { ...params, access_token: accessToken }), 'id')
}

export interface ThreadsContainer {
  status: ThreadsContainerStatus
  /** Meta's reason for ERROR, e.g. FAILED_DOWNLOADING_VIDEO. */
  errorMessage: string | null
}

export async function getThreadsContainer(accessToken: string, containerId: string): Promise<ThreadsContainer> {
  const body = await get(`/${containerId}`, { fields: 'status,error_message', access_token: accessToken })
  const status = CONTAINER_STATUSES.find((value) => value === body.status)
  if (!status) throw new InstagramApiError(`Status container Threads tidak dikenal: ${String(body.status)}`, null, 200)
  return { status, errorMessage: optionalString(body.error_message) }
}

/** Not idempotent: a timeout here may still have published. Callers check the container before trying again. */
export async function publishThreadsContainer(accessToken: string, userId: string, containerId: string): Promise<string> {
  return readString(await post(`/${userId}/threads_publish`, { creation_id: containerId, access_token: accessToken }), 'id')
}

export async function getThreadsPermalink(accessToken: string, mediaId: string): Promise<string> {
  return readString(await get(`/${mediaId}`, { fields: 'permalink', access_token: accessToken }), 'permalink')
}

export interface ThreadsQuota {
  /** Posts left in the rolling 24 hours (250 at the time of writing). */
  posts: number
  /** Replies left, which every item after the first of a chain uses (1000). */
  replies: number
}

const quotaLeft = (usage: unknown, config: unknown) =>
  typeof usage === 'number' && isObject(config) && typeof config.quota_total === 'number'
    ? Math.max(config.quota_total - usage, 0)
    : Number.POSITIVE_INFINITY

export async function getThreadsQuota(accessToken: string, userId: string): Promise<ThreadsQuota> {
  const body = await get(`/${userId}/threads_publishing_limit`, {
    fields: 'quota_usage,config,reply_quota_usage,reply_config',
    access_token: accessToken,
  })
  const usage = Array.isArray(body.data) && isObject(body.data[0]) ? body.data[0] : {}
  return { posts: quotaLeft(usage.quota_usage, usage.config), replies: quotaLeft(usage.reply_quota_usage, usage.reply_config) }
}

const sameText = (a: unknown, b: string) => typeof a === 'string' && a.trim() === b.trim()

/**
 * The id of a post the account published with exactly this text, among its newest ones: a container that turned out
 * PUBLISHED after a lost answer. Null when it isn't there.
 */
export async function findOwnThread(accessToken: string, text: string): Promise<string | null> {
  const body = await get('/me/threads', { fields: 'id,text', limit: '10', access_token: accessToken })
  const match = (Array.isArray(body.data) ? body.data : []).find((item) => isObject(item) && sameText(item.text, text))
  return isObject(match) ? optionalString(match.id) : null
}

/** The same for an item of a chain: the account's own reply under `parentId` with this text. */
export async function findOwnReply(accessToken: string, parentId: string, text: string): Promise<string | null> {
  const body = await get(`/${parentId}/replies`, { fields: 'id,text,is_reply_owned_by_me', access_token: accessToken })
  const match = (Array.isArray(body.data) ? body.data : []).find(
    (item) => isObject(item) && item.is_reply_owned_by_me === true && sameText(item.text, text),
  )
  return isObject(match) ? optionalString(match.id) : null
}

/** One of the account's own Threads posts. `thumbnailUrl` is a signed CDN link: never log it. */
export interface ThreadsPost {
  id: string
  text: string
  permalink: string | null
  thumbnailUrl: string | null
  postedAt: Date
}

const NUMERIC_ID = /^\d+$/

function dateOf(value: unknown): Date | null {
  const date = new Date(typeof value === 'string' ? value : '')
  return Number.isNaN(date.getTime()) ? null : date
}

function toThreadsPost(item: unknown): ThreadsPost | null {
  if (!isObject(item) || typeof item.id !== 'string' || !NUMERIC_ID.test(item.id)) return null
  // A repost shows someone else's post: there are no replies of ours to answer.
  if (item.media_type === 'REPOST_FACADE') return null
  const postedAt = dateOf(item.timestamp)
  if (!postedAt) return null
  return {
    id: item.id,
    text: optionalString(item.text) ?? '',
    permalink: optionalString(item.permalink),
    thumbnailUrl: optionalString(item.thumbnail_url) ?? (item.media_type === 'IMAGE' ? optionalString(item.media_url) : null),
    postedAt,
  }
}

/** The next page's cursor, like instagram.ts: Graph sends `next` only while there is one. */
function nextCursor(body: Json): string | null {
  const paging = body.paging
  if (!isObject(paging) || typeof paging.next !== 'string' || !isObject(paging.cursors)) return null
  return optionalString(paging.cursors.after)
}

/** The account's posts since `since`, newest first, at most `max`. Incomplete when there were more. */
export async function listThreadsPostsSince(
  accessToken: string,
  since: Date,
  max: number,
): Promise<{ posts: ThreadsPost[]; isComplete: boolean }> {
  let posts: ThreadsPost[] = []
  let after: string | null = null
  do {
    const body = await get('/me/threads', {
      fields: 'id,text,timestamp,permalink,media_type,media_url,thumbnail_url',
      since: String(Math.floor(since.getTime() / 1000)),
      limit: String(PAGE_SIZE),
      access_token: accessToken,
      ...(after ? { after } : {}),
    })
    const page = (Array.isArray(body.data) ? body.data : []).flatMap((item) => toThreadsPost(item) ?? [])
    posts = [...posts, ...page.filter((post) => post.postedAt >= since)]
    after = nextCursor(body)
    if (after && posts.length >= max) return { posts: posts.slice(0, max), isComplete: false }
  } while (after)
  return { posts: posts.slice(0, max), isComplete: posts.length <= max }
}

/** A reply anywhere under one of the account's posts. */
export interface ThreadsReplyItem {
  id: string
  text: string
  username: string | null
  createdAt: Date
  isHidden: boolean
  /** The account's own reply. */
  isOwn: boolean
  /** The post or reply it answers. */
  repliedToId: string
}

function toReply(item: unknown, mediaId: string): ThreadsReplyItem | null {
  if (!isObject(item) || typeof item.id !== 'string' || !NUMERIC_ID.test(item.id)) return null
  const createdAt = dateOf(item.timestamp)
  if (!createdAt) return null
  const repliedTo = isObject(item.replied_to) ? optionalString(item.replied_to.id) : null
  return {
    id: item.id,
    text: optionalString(item.text) ?? '',
    username: optionalString(item.username),
    createdAt,
    isHidden: item.hide_status === 'HIDDEN',
    isOwn: item.is_reply_owned_by_me === true,
    repliedToId: repliedTo ?? mediaId,
  }
}

/** Every reply under a post at any depth, oldest first, at most `max`. Incomplete when there were more. */
export async function listThreadsConversation(
  accessToken: string,
  mediaId: string,
  max: number,
): Promise<{ replies: ThreadsReplyItem[]; isComplete: boolean }> {
  let replies: ThreadsReplyItem[] = []
  let after: string | null = null
  do {
    const body = await get(`/${mediaId}/conversation`, {
      fields: 'id,text,username,timestamp,hide_status,replied_to,is_reply_owned_by_me',
      reverse: 'false',
      limit: String(PAGE_SIZE),
      access_token: accessToken,
      ...(after ? { after } : {}),
    })
    replies = [...replies, ...(Array.isArray(body.data) ? body.data : []).flatMap((item) => toReply(item, mediaId) ?? [])]
    after = nextCursor(body)
    if (after && replies.length >= max) return { replies: replies.slice(0, max), isComplete: false }
  } while (after)
  return { replies, isComplete: true }
}

/** Hides a reply from everyone but its author, or shows it again; a top-level reply takes its branch with it. */
export async function setThreadsReplyHidden(accessToken: string, replyId: string, hidden: boolean): Promise<void> {
  const body = await post(`/${replyId}/manage_reply`, { hide: String(hidden), access_token: accessToken })
  if (body.success !== true) throw new InstagramApiError('Threads tidak mengonfirmasi perubahan balasan', null, 200)
}
