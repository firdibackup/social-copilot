import 'server-only'
import { METRICS, parseInsights, type Metrics } from './analytics-metrics'
import { MAX_GROUP_IMAGES } from './brand-options'
import type { OutgoingDm } from './auto-dm-rules'
import type { MessageEvent } from './dm-webhook'
import { env } from './env'

/** Analitik needs it; accounts connected before it existed must reconnect once. */
export const INSIGHTS_SCOPE = 'instagram_business_manage_insights'
/** The Komentar tab needs it, the same way. */
export const COMMENTS_SCOPE = 'instagram_business_manage_comments'

export const INSTAGRAM_SCOPES = [
  'instagram_business_basic',
  'instagram_business_content_publish',
  'instagram_business_manage_messages',
  INSIGHTS_SCOPE,
  COMMENTS_SCOPE,
] as const

const AUTHORIZE_URL = 'https://www.instagram.com/oauth/authorize'
const TOKEN_URL = 'https://api.instagram.com/oauth/access_token'
const GRAPH_URL = 'https://graph.instagram.com'
const REQUEST_TIMEOUT_MS = 15_000
const INVALID_TOKEN_CODE = 190
/** Graph codes for unknown errors, service hiccups and rate limits: worth retrying later. */
const TRANSIENT_CODES = new Set([1, 2, 4, 17, 32, 341, 368, 613])

const CONTAINER_STATUSES = ['EXPIRED', 'ERROR', 'FINISHED', 'IN_PROGRESS', 'PUBLISHED'] as const
export type ContainerStatus = (typeof CONTAINER_STATUSES)[number]

export interface ShortLivedToken {
  accessToken: string
  permissions: string[]
}

export interface LongLivedToken {
  accessToken: string
  expiresAt: Date
}

export interface InstagramProfile {
  userId: string
  username: string
  accountType: string
}

export class InstagramApiError extends Error {
  override name = 'InstagramApiError'

  constructor(
    message: string,
    readonly code: number | null,
    readonly status: number,
    /** Graph's own `is_transient` flag. */
    readonly transient = false,
  ) {
    super(message)
  }

  /** Expired, revoked or otherwise unusable token: the owner must reconnect. */
  get isInvalidToken(): boolean {
    return this.code === INVALID_TOKEN_CODE
  }

  /** Network failures (status 0), server errors and throttling. Anything else is a rejection. */
  get isTransient(): boolean {
    return (
      this.transient ||
      this.status === 0 ||
      this.status >= 500 ||
      (this.code !== null && TRANSIENT_CODES.has(this.code))
    )
  }
}

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null
const optionalString = (value: unknown) => (typeof value === 'string' && value !== '' ? value : null)

export function readString(source: Json, key: string): string {
  const value = source[key]
  if (typeof value !== 'string' || value === '') {
    throw new InstagramApiError(`Respons Instagram tanpa ${key}`, null, 200)
  }
  return value
}

function toApiError(body: unknown, status: number): InstagramApiError {
  // Graph API nests errors under `error`; the OAuth endpoint returns them flat.
  const source = isObject(body) ? (isObject(body.error) ? body.error : body) : {}
  const message = [source.message, source.error_message].find((value) => typeof value === 'string')
  const code = typeof source.code === 'number' ? source.code : null
  return new InstagramApiError(
    typeof message === 'string' ? message : `HTTP ${status}`,
    code,
    status,
    source.is_transient === true,
  )
}

/**
 * One Graph call. graph.facebook.com and graph.threads.com answer in the same shape, so `facebook.ts` and
 * `threads.ts` use it too; `service` names the one that couldn't be reached.
 */
export async function request(url: string | URL, init?: RequestInit, service = 'Instagram'): Promise<Json> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }).catch(
    (error: unknown) => {
      // Network errors can echo the URL, which carries the token; keep only the error type.
      const reason = error instanceof Error ? error.name : 'unknown'
      throw new InstagramApiError(`${service} tidak bisa dihubungi (${reason})`, null, 0)
    },
  )
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok || !isObject(body) || 'error' in body || 'error_type' in body) {
    throw toApiError(body, response.status)
  }
  return body
}

function graphUrl(path: string, params: Record<string, string>): URL {
  const url = new URL(path, GRAPH_URL)
  url.search = new URLSearchParams(params).toString()
  return url
}

/** POSTs keep the token in the body, out of URLs. */
function graphPost(path: string, params: Record<string, string>): Promise<Json> {
  return request(new URL(path, GRAPH_URL), { method: 'POST', body: new URLSearchParams(params) })
}

function parsePermissions(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string')
  if (typeof value !== 'string') return []
  return value
    .split(',')
    .map((permission) => permission.trim())
    .filter(Boolean)
}

function toLongLivedToken(body: Json): LongLivedToken {
  const expiresInSeconds = body.expires_in
  if (typeof expiresInSeconds !== 'number' || expiresInSeconds <= 0) {
    throw new InstagramApiError('Respons Instagram tanpa expires_in', null, 200)
  }
  return {
    accessToken: readString(body, 'access_token'),
    expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
  }
}

export function buildAuthorizeUrl(state: string): string {
  const url = new URL(AUTHORIZE_URL)
  url.search = new URLSearchParams({
    client_id: env('INSTAGRAM_APP_ID'),
    redirect_uri: env('INSTAGRAM_REDIRECT_URI'),
    response_type: 'code',
    scope: INSTAGRAM_SCOPES.join(','),
    state,
    force_reauth: 'true',
  }).toString()
  return url.toString()
}

export async function exchangeCodeForToken(code: string): Promise<ShortLivedToken> {
  const body = await request(TOKEN_URL, {
    method: 'POST',
    body: new URLSearchParams({
      client_id: env('INSTAGRAM_APP_ID'),
      client_secret: env('INSTAGRAM_APP_SECRET'),
      grant_type: 'authorization_code',
      redirect_uri: env('INSTAGRAM_REDIRECT_URI'),
      code,
    }),
  })
  // The token comes wrapped in `data[]` (older responses are flat). Its `user_id` is a JSON
  // number above 2^53 and loses precision, so the id is read from the profile instead.
  const item = Array.isArray(body.data) ? body.data[0] : body
  if (!isObject(item)) throw new InstagramApiError('Respons token Instagram kosong', null, 200)
  return { accessToken: readString(item, 'access_token'), permissions: parsePermissions(item.permissions) }
}

export async function exchangeForLongLivedToken(shortLivedToken: string): Promise<LongLivedToken> {
  const body = await request(
    graphUrl('/access_token', {
      grant_type: 'ig_exchange_token',
      client_secret: env('INSTAGRAM_APP_SECRET'),
      access_token: shortLivedToken,
    }),
  )
  return toLongLivedToken(body)
}

/** Meta only refreshes long-lived tokens that are at least 24 hours old and not yet expired. */
export async function refreshLongLivedToken(longLivedToken: string): Promise<LongLivedToken> {
  const body = await request(
    graphUrl('/refresh_access_token', { grant_type: 'ig_refresh_token', access_token: longLivedToken }),
  )
  return toLongLivedToken(body)
}

export async function fetchProfile(accessToken: string): Promise<InstagramProfile> {
  const body = await request(graphUrl('/me', { fields: 'user_id,username,account_type', access_token: accessToken }))
  return {
    userId: readString(body, 'user_id'),
    username: readString(body, 'username'),
    accountType: readString(body, 'account_type'),
  }
}

export interface OwnProfile {
  username: string
  name: string
  biography: string
  /** A signed CDN link, the new account's first logo: never log it. */
  profilePictureUrl: string | null
}

/** The connected account's own name, bio and picture, for the brand kit. */
export async function fetchOwnProfile(accessToken: string): Promise<OwnProfile> {
  const body = await request(
    graphUrl('/me', { fields: 'username,name,biography,profile_picture_url', access_token: accessToken }),
  )
  return {
    username: readString(body, 'username'),
    name: optionalString(body.name) ?? '',
    biography: optionalString(body.biography) ?? '',
    profilePictureUrl: optionalString(body.profile_picture_url),
  }
}

/** A post offered as a design reference. Its URLs are signed CDN links: never log them. */
export interface InstagramPost {
  id: string
  caption: string
  /** The cover: `images[0]`. */
  imageUrl: string
  /** Every slide of a carousel in order (at most MAX_GROUP_IMAGES), or the one photo. */
  images: string[]
  isCarousel: boolean
  permalink: string | null
}

/** The media fields a reference picker needs, carousel slides included. */
export const MEDIA_FIELDS = 'id,caption,media_type,media_url,thumbnail_url,permalink,children{media_type,media_url,thumbnail_url}'

/** A slide's still image: a video slide has one only as `thumbnail_url`. */
const stillOf = (item: Json) => optionalString(item.media_type === 'VIDEO' ? item.thumbnail_url : item.media_url)

function slidesOf(item: Json): string[] {
  const children = isObject(item.children) && Array.isArray(item.children.data) ? item.children.data : []
  return children.flatMap((child) => {
    const url = isObject(child) ? stillOf(child) : null
    return url ? [url] : []
  })
}

/** Photos and carousels. Videos are left out; a carousel without its slides keeps only the cover. */
export function toPosts(data: unknown): InstagramPost[] {
  if (!Array.isArray(data)) return []
  return data.flatMap((item): InstagramPost[] => {
    if (!isObject(item) || typeof item.id !== 'string' || item.media_type === 'VIDEO') return []
    const cover = optionalString(item.media_url)
    const slides = item.media_type === 'CAROUSEL_ALBUM' ? slidesOf(item).slice(0, MAX_GROUP_IMAGES) : []
    const images = slides.length > 0 ? slides : cover ? [cover] : []
    if (images.length === 0) return []
    return [
      {
        id: item.id,
        caption: optionalString(item.caption) ?? '',
        imageUrl: images[0],
        images,
        isCarousel: slides.length > 0,
        permalink: optionalString(item.permalink),
      },
    ]
  })
}

/** The connected account's newest posts. */
export async function fetchRecentMedia(accessToken: string, limit: number): Promise<InstagramPost[]> {
  const body = await request(
    graphUrl('/me/media', {
      fields: MEDIA_FIELDS,
      limit: String(limit),
      access_token: accessToken,
    }),
  )
  return toPosts(body.data)
}

/** One of the account's own posts, for Analitik. `thumbnailUrl` is a signed CDN link: never log it. */
export interface OwnMedia {
  id: string
  mediaType: string
  productType: string | null
  caption: string
  permalink: string | null
  thumbnailUrl: string | null
  postedAt: Date
  /** From the media itself, so a post whose insights fail still shows them. */
  likes: number | null
  comments: number | null
}

const OWN_MEDIA_FIELDS =
  'id,caption,media_type,media_product_type,permalink,media_url,thumbnail_url,timestamp,like_count,comments_count'
const MEDIA_PAGE_SIZE = 50
/** Media and comment ids are numeric; the syncs pass them into PostgREST `in` filters. */
const NUMERIC_ID = /^\d+$/

const optionalCount = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null)

function toOwnMedia(item: unknown): OwnMedia | null {
  if (!isObject(item) || typeof item.id !== 'string' || !NUMERIC_ID.test(item.id)) return null
  // Graph writes `+0000`, which Date parses.
  const postedAt = new Date(typeof item.timestamp === 'string' ? item.timestamp : '')
  const mediaType = optionalString(item.media_type)
  if (Number.isNaN(postedAt.getTime()) || !mediaType) return null
  return {
    id: item.id,
    mediaType,
    productType: optionalString(item.media_product_type),
    caption: optionalString(item.caption) ?? '',
    permalink: optionalString(item.permalink),
    // A video's media_url is the video file; its still is thumbnail_url.
    thumbnailUrl: optionalString(item.thumbnail_url) ?? (mediaType === 'VIDEO' ? null : optionalString(item.media_url)),
    postedAt,
    likes: optionalCount(item.like_count),
    comments: optionalCount(item.comments_count),
  }
}

/** The cursor of the next page, only when Graph says there is one. */
function nextCursor(body: Json): string | null {
  const paging = body.paging
  if (!isObject(paging) || typeof paging.next !== 'string' || !isObject(paging.cursors)) return null
  return optionalString(paging.cursors.after)
}

/** The account's newest posts, one page, for picking the post an Auto DM rule listens to. */
export async function fetchOwnMedia(accessToken: string, limit: number): Promise<OwnMedia[]> {
  const body = await request(
    graphUrl('/me/media', { fields: OWN_MEDIA_FIELDS, limit: String(limit), access_token: accessToken }),
  )
  return (Array.isArray(body.data) ? body.data : []).flatMap((item) => toOwnMedia(item) ?? [])
}

export interface MediaSince {
  /** Newest first. */
  media: OwnMedia[]
  /** False when `max` cut the list before it reached `since`. */
  isComplete: boolean
}

/**
 * The account's posts from `since` on, at most `max`. Stories aren't in /me/media. Pinned posts come first whatever
 * their age, so an older post doesn't end the walk; a page whose last post is older does.
 */
export async function listMediaSince(accessToken: string, since: Date, max: number): Promise<MediaSince> {
  let media: OwnMedia[] = []
  let after: string | null = null
  do {
    const body = await request(
      graphUrl('/me/media', {
        fields: OWN_MEDIA_FIELDS,
        limit: String(MEDIA_PAGE_SIZE),
        access_token: accessToken,
        ...(after ? { after } : {}),
      }),
    )
    const page = (Array.isArray(body.data) ? body.data : []).flatMap((item) => toOwnMedia(item) ?? [])
    media = [...media, ...page.filter((item) => item.postedAt >= since)]
    if (media.length > max) return { media: media.slice(0, max), isComplete: false }
    const last = page.at(-1)
    if (!last || last.postedAt < since) break
    after = nextCursor(body)
  } while (after)
  return { media, isComplete: true }
}

/** Lifetime insights of one post. Throws on any Graph error, so the caller can count that post alone as failed. */
export async function getMediaInsights(accessToken: string, mediaId: string): Promise<Metrics> {
  const body = await request(graphUrl(`/${mediaId}/insights`, { metric: METRICS.join(','), access_token: accessToken }))
  return parseInsights(body)
}

/** A comment on one of the account's posts, or a reply to one. */
export interface PostComment {
  id: string
  mediaId: string
  /** The top-level comment a reply belongs to; null for a top-level comment. */
  parentId: string | null
  fromId: string | null
  username: string | null
  text: string
  createdAt: Date
  isHidden: boolean
}

export interface MediaComments {
  /** Top-level comments newest first, each followed by its replies; every id once. */
  comments: PostComment[]
  /** False when `max` or a long reply thread cut the list short. */
  isComplete: boolean
}

const COMMENT_FIELDS = 'id,text,timestamp,username,from,hidden,parent_id'
/** Graph's most per page of /comments. */
const COMMENT_PAGE_SIZE = 50

function toComment(item: unknown, mediaId: string, parentId: string | null): PostComment | null {
  if (!isObject(item) || typeof item.id !== 'string' || !NUMERIC_ID.test(item.id)) return null
  const createdAt = new Date(typeof item.timestamp === 'string' ? item.timestamp : '')
  if (Number.isNaN(createdAt.getTime())) return null
  const from = isObject(item.from) ? item.from : {}
  return {
    id: item.id,
    mediaId,
    parentId: optionalString(item.parent_id) ?? parentId,
    fromId: optionalString(from.id),
    username: optionalString(item.username) ?? optionalString(from.username),
    text: typeof item.text === 'string' ? item.text : '',
    createdAt,
    isHidden: item.hidden === true,
  }
}

/** A top-level comment and the replies Graph sent with it. */
function threadOf(item: unknown, mediaId: string): { comments: PostComment[]; isComplete: boolean } {
  const comment = toComment(item, mediaId, null)
  if (!comment || !isObject(item)) return { comments: [], isComplete: true }
  const replies = isObject(item.replies) ? item.replies : {}
  const data = Array.isArray(replies.data) ? replies.data : []
  return {
    comments: [comment, ...data.flatMap((reply) => toComment(reply, mediaId, comment.id) ?? [])],
    // ponytail: only the first page of a thread's replies; page through /{comment}/replies when threads run long.
    isComplete: nextCursor(replies) === null,
  }
}

/** A post's comments with their replies, at most `max` top-level ones. */
export async function listMediaComments(accessToken: string, mediaId: string, max: number): Promise<MediaComments> {
  let comments: PostComment[] = []
  let topLevel = 0
  let isComplete = true
  let after: string | null = null
  do {
    const body = await request(
      graphUrl(`/${mediaId}/comments`, {
        fields: `${COMMENT_FIELDS},replies{${COMMENT_FIELDS}}`,
        limit: String(COMMENT_PAGE_SIZE),
        access_token: accessToken,
        ...(after ? { after } : {}),
      }),
    )
    const threads = (Array.isArray(body.data) ? body.data : []).map((item) => threadOf(item, mediaId))
    // Graph lists a reply at the top level too, beside its parent's `replies`; one upsert can't take an id twice.
    const known = new Set(comments.map((comment) => comment.id))
    const fresh = threads.flatMap((thread) => thread.comments).filter((comment) => !known.has(comment.id) && known.add(comment.id))
    comments = [...comments, ...fresh]
    isComplete = isComplete && threads.every((thread) => thread.isComplete)
    topLevel += threads.length
    after = nextCursor(body)
    if (after && topLevel >= max) return { comments, isComplete: false }
  } while (after)
  return { comments, isComplete }
}

/** A public reply under a comment. Returns the new comment's id. */
export async function replyToComment(accessToken: string, commentId: string, message: string): Promise<string> {
  const body = await graphPost(`/${commentId}/replies`, { message, access_token: accessToken })
  return readString(body, 'id')
}

function expectSuccess(body: Json, action: string): void {
  if (body.success !== true) throw new InstagramApiError(`Instagram tidak mengonfirmasi ${action}`, null, 200)
}

/** Hides a comment from everyone but its author, or shows it again. The owner's own comments can't be hidden. */
export async function setCommentHidden(accessToken: string, commentId: string, hidden: boolean): Promise<void> {
  expectSuccess(await graphPost(`/${commentId}`, { hide: String(hidden), access_token: accessToken }), 'perubahan komentar')
}

export async function deleteComment(accessToken: string, commentId: string): Promise<void> {
  const body = await request(new URL(`/${commentId}`, GRAPH_URL), {
    method: 'DELETE',
    headers: { authorization: `Bearer ${accessToken}` },
  })
  expectSuccess(body, 'penghapusan komentar')
}

/** Creates a media container. `params` are the /media fields: image_url, caption, is_carousel_item, children… */
export async function createContainer(
  accessToken: string,
  userId: string,
  params: Record<string, string>,
): Promise<string> {
  const body = await graphPost(`/${userId}/media`, { ...params, access_token: accessToken })
  return readString(body, 'id')
}

export async function getContainerStatus(accessToken: string, containerId: string): Promise<ContainerStatus> {
  const body = await request(graphUrl(`/${containerId}`, { fields: 'status_code', access_token: accessToken }))
  const status = readString(body, 'status_code')
  const known = CONTAINER_STATUSES.find((value) => value === status)
  if (!known) throw new InstagramApiError(`Status container tidak dikenal: ${status}`, null, 200)
  return known
}

/** Not idempotent: a timeout here may still have published. Callers check the container status before retrying. */
export async function publishContainer(accessToken: string, userId: string, containerId: string): Promise<string> {
  const body = await graphPost(`/${userId}/media_publish`, { creation_id: containerId, access_token: accessToken })
  return readString(body, 'id')
}

export async function getPermalink(accessToken: string, mediaId: string): Promise<string> {
  const body = await request(graphUrl(`/${mediaId}`, { fields: 'permalink', access_token: accessToken }))
  return readString(body, 'permalink')
}

export interface CustomerProfile {
  username: string | null
  name: string | null
  /** A signed CDN link that expires within days: never log it. */
  profilePicUrl: string | null
}

/** Profile of someone who has messaged the account. `igsid` is the sender id from the webhook. */
export async function fetchCustomerProfile(accessToken: string, igsid: string): Promise<CustomerProfile> {
  const body = await request(graphUrl(`/${igsid}`, { fields: 'username,name,profile_pic', access_token: accessToken }))
  return {
    username: optionalString(body.username),
    name: optionalString(body.name),
    profilePicUrl: optionalString(body.profile_pic),
  }
}

function sendMessage(accessToken: string, userId: string, recipient: Record<string, string>, message: Json): Promise<Json> {
  return request(new URL(`/${userId}/messages`, GRAPH_URL), {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ recipient, message }),
  })
}

/** Text alone, or Meta's button template (1–3 buttons, text up to 640 characters). */
const toMessage = ({ text, buttons }: OutgoingDm): Json =>
  buttons.length === 0
    ? { text }
    : { attachment: { type: 'template', payload: { template_type: 'button', text, buttons } } }

/**
 * Sends a text DM and returns its message id, which the webhook echo carries as `mid`. Meta only accepts it
 * within 24 hours of the customer's last message.
 */
export async function sendDirectMessage(
  accessToken: string,
  userId: string,
  recipientId: string,
  text: string,
): Promise<string> {
  return readString(await sendMessage(accessToken, userId, { id: recipientId }, { text }), 'message_id')
}

export interface PrivateReply {
  messageId: string
  /** The commenter's Instagram-scoped id: the DM conversation the reply starts. */
  recipientId: string | null
}

/**
 * A DM to the author of a comment on the account's posts. Meta takes one per comment, within 7 days of it; the
 * conversation continues only once the commenter answers.
 */
export async function sendPrivateReply(
  accessToken: string,
  userId: string,
  commentId: string,
  text: string,
): Promise<PrivateReply> {
  const body = await sendMessage(accessToken, userId, { comment_id: commentId }, { text })
  return { messageId: readString(body, 'message_id'), recipientId: optionalString(body.recipient_id) }
}

/**
 * An Auto DM: as a private reply to a comment (`{ comment_id }`, once per comment within 7 days) or to a customer
 * whose 24-hour window is open (`{ id }`). Buttons go out as a button template.
 */
export async function sendAutoDm(
  accessToken: string,
  userId: string,
  recipient: { comment_id: string } | { id: string },
  dm: OutgoingDm,
): Promise<PrivateReply> {
  const body = await sendMessage(accessToken, userId, recipient, toMessage(dm))
  return { messageId: readString(body, 'message_id'), recipientId: optionalString(body.recipient_id) }
}

/** Whether the customer follows the account. Instagram answers only once they have messaged or tapped a button. */
export async function fetchFollowsBusiness(accessToken: string, igsid: string): Promise<boolean> {
  const body = await request(graphUrl(`/${igsid}`, { fields: 'is_user_follow_business', access_token: accessToken }))
  if (typeof body.is_user_follow_business !== 'boolean') {
    throw new InstagramApiError('Instagram tidak memberi status follow', null, 200)
  }
  return body.is_user_follow_business
}

export interface InstagramConversation {
  /** The customer's Instagram-scoped id, the same id the webhook sends. */
  igsid: string
  updatedAt: Date
  /** Newest first. Message ids are the webhook's `mid`. */
  messages: MessageEvent[]
}

/** Instagram gives the details of only a conversation's 20 newest messages. */
const CONVERSATION_FIELDS = 'updated_time,participants,messages.limit(20){id,created_time,from,message}'
const CONVERSATION_PAGE_SIZE = 25

function dateOf(value: unknown): Date | null {
  const date = new Date(typeof value === 'string' ? value : '')
  return Number.isNaN(date.getTime()) ? null : date
}

function toConversationMessage(item: unknown, accountId: string, igsid: string): MessageEvent | null {
  if (!isObject(item) || typeof item.id !== 'string' || item.id === '') return null
  const sentAt = dateOf(item.created_time)
  const from = isObject(item.from) ? optionalString(item.from.id) : null
  if (!sentAt || (from !== igsid && from !== accountId)) return null
  return { mid: item.id, igsid, fromCustomer: from === igsid, text: optionalString(item.message), sentAt }
}

function toConversation(item: unknown, accountId: string): InstagramConversation | null {
  if (!isObject(item)) return null
  const participants = isObject(item.participants) && Array.isArray(item.participants.data) ? item.participants.data : []
  const customers = participants.flatMap((participant) => {
    const id = isObject(participant) ? optionalString(participant.id) : null
    return id && id !== accountId && NUMERIC_ID.test(id) ? [id] : []
  })
  const updatedAt = dateOf(item.updated_time)
  // A thread with more than one other person isn't a DM the inbox can answer.
  if (customers.length !== 1 || !updatedAt) return null
  const igsid = customers[0]
  const messages = isObject(item.messages) && Array.isArray(item.messages.data) ? item.messages.data : []
  return { igsid, updatedAt, messages: messages.flatMap((message) => toConversationMessage(message, accountId, igsid) ?? []) }
}

/** The account's DM conversations, newest first, at most `max`, each with its newest messages. */
export async function listInstagramConversations(
  accessToken: string,
  accountId: string,
  max: number,
): Promise<InstagramConversation[]> {
  let conversations: InstagramConversation[] = []
  let read = 0
  let after: string | null = null
  do {
    const body = await request(
      graphUrl('/me/conversations', {
        platform: 'instagram',
        fields: CONVERSATION_FIELDS,
        limit: String(CONVERSATION_PAGE_SIZE),
        access_token: accessToken,
        ...(after ? { after } : {}),
      }),
    )
    const page = Array.isArray(body.data) ? body.data : []
    conversations = [...conversations, ...page.flatMap((item) => toConversation(item, accountId) ?? [])]
    read += page.length
    after = nextCursor(body)
  } while (after && read < max)
  return conversations.slice(0, max)
}

/** Asks Meta to send this account's DMs, Auto DM button taps and comments to the app's webhook. Safe to repeat. */
export async function subscribeToWebhooks(accessToken: string, scopes: readonly string[]): Promise<void> {
  // Meta refuses the whole call for a field whose permission wasn't granted; comments wait for a reconnect.
  const fields = scopes.includes(COMMENTS_SCOPE) ? 'messages,messaging_postbacks,comments' : 'messages,messaging_postbacks'
  const body = await graphPost('/me/subscribed_apps', { subscribed_fields: fields, access_token: accessToken })
  expectSuccess(body, 'langganan DM dan komentar')
}
