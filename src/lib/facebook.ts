import 'server-only'
import { env } from './env'
import { InstagramApiError, readString, request, toPosts, type InstagramPost } from './instagram'

const GRAPH_VERSION = 'v25.0'
const DIALOG_URL = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`
const GRAPH_URL = `https://graph.facebook.com/${GRAPH_VERSION}/`
const DISCOVERY_MEDIA_LIMIT = 24

/**
 * Business Discovery needs the first four; business_management lists Pages owned through Business Manager.
 * instagram_manage_insights is required by the business_discovery endpoint itself, even though no insights are read.
 */
export const FACEBOOK_SCOPES = [
  'instagram_basic',
  'instagram_manage_insights',
  'pages_show_list',
  'pages_read_engagement',
  'business_management',
] as const

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null
const optionalString = (value: unknown) => (typeof value === 'string' && value !== '' ? value : null)

function graphUrl(path: string, params: Record<string, string>): URL {
  const url = new URL(path, GRAPH_URL)
  url.search = new URLSearchParams(params).toString()
  return url
}

/**
 * Facebook Login for Business takes the permissions from a configuration (`config_id`); classic Facebook Login
 * takes `scope`. Which one an app has depends on its type in the Meta dashboard.
 */
export function buildFacebookAuthorizeUrl(state: string): string {
  const configId = process.env.FACEBOOK_LOGIN_CONFIG_ID?.trim()
  const url = new URL(DIALOG_URL)
  url.search = new URLSearchParams({
    client_id: env('FACEBOOK_APP_ID'),
    redirect_uri: env('FACEBOOK_REDIRECT_URI'),
    response_type: 'code',
    state,
    ...(configId ? { config_id: configId, override_default_response_type: 'true' } : { scope: FACEBOOK_SCOPES.join(',') }),
  }).toString()
  return url.toString()
}

/** Code → short-lived user token. */
export async function exchangeFacebookCode(code: string): Promise<string> {
  const body = await request(
    graphUrl('oauth/access_token', {
      client_id: env('FACEBOOK_APP_ID'),
      client_secret: env('FACEBOOK_APP_SECRET'),
      redirect_uri: env('FACEBOOK_REDIRECT_URI'),
      code,
    }),
  )
  return readString(body, 'access_token')
}

/** Page tokens read with a long-lived user token never expire, which is why this step exists. */
export async function exchangeForLongLivedUserToken(token: string): Promise<string> {
  const body = await request(
    graphUrl('oauth/access_token', {
      grant_type: 'fb_exchange_token',
      client_id: env('FACEBOOK_APP_ID'),
      client_secret: env('FACEBOOK_APP_SECRET'),
      fb_exchange_token: token,
    }),
  )
  return readString(body, 'access_token')
}

export interface InstagramPage {
  pageId: string
  pageName: string
  /** Never log it. */
  pageToken: string
  instagramUserId: string
  username: string
}

/** The owner's Pages that have an Instagram professional account linked. */
export async function fetchInstagramPages(userToken: string): Promise<InstagramPage[]> {
  const body = await request(
    graphUrl('me/accounts', {
      fields: 'id,name,access_token,instagram_business_account{id,username}',
      limit: '100',
      access_token: userToken,
    }),
  )
  const pages = Array.isArray(body.data) ? body.data : []
  return pages.flatMap((page): InstagramPage[] => {
    if (!isObject(page) || !isObject(page.instagram_business_account)) return []
    const account = page.instagram_business_account
    const [pageId, pageToken, instagramUserId] = [page.id, page.access_token, account.id].map(optionalString)
    if (!pageId || !pageToken || !instagramUserId) return []
    return [
      {
        pageId,
        pageName: optionalString(page.name) ?? pageId,
        pageToken,
        instagramUserId,
        username: optionalString(account.username) ?? '',
      },
    ]
  })
}

/**
 * The Page behind the Instagram account the app uses. Only while none is connected, the first Page with an
 * Instagram account: the connection is kept per Instagram account, so another account's Page would be invisible.
 */
export function choosePage(pages: InstagramPage[], connectedInstagramId: string | null): InstagramPage | null {
  if (connectedInstagramId) return pages.find((page) => page.instagramUserId === connectedInstagramId) ?? null
  return pages[0] ?? null
}

const USERNAME = /^[a-z0-9._]{1,30}$/
/** First path segments of instagram.com links that are not profiles. */
const NOT_PROFILES = new Set(['p', 'reel', 'reels', 'tv', 'explore', 'stories', 'accounts', 'direct'])

/** `@name`, `name` or a profile link → `name`. Null for anything else, including post links. */
export function parseInstagramUsername(input: string): string | null {
  let text = input.trim()
  const link = /^(?:https?:\/\/)?(?:www\.|m\.)?instagram\.com\/([^/?#]+)/i.exec(text)
  if (link) {
    if (NOT_PROFILES.has(link[1].toLowerCase())) return null
    text = link[1]
  }
  const username = text.replace(/^@/, '').toLowerCase()
  return USERNAME.test(username) ? username : null
}

export interface DiscoveredAccount {
  username: string
  name: string
  biography: string
  followersCount: number | null
  posts: InstagramPost[]
}

/**
 * Public profile and newest posts of another Business or Creator account. Graph answers code 110 (or 100) for
 * usernames that don't exist or belong to personal or age-gated accounts.
 */
export async function discoverAccount(pageToken: string, instagramUserId: string, username: string): Promise<DiscoveredAccount> {
  if (!USERNAME.test(username)) throw new InstagramApiError('Username tidak valid', null, 400)
  // No thumbnail_url: Business Discovery's media edge doesn't offer it, so video slides are skipped there.
  const media = `media.limit(${DISCOVERY_MEDIA_LIMIT}){id,caption,media_type,media_url,permalink,children{media_type,media_url}}`
  const body = await request(
    graphUrl(instagramUserId, {
      // The username sits inside Graph's field syntax, so USERNAME above keeps it to letters, digits, `.` and `_`.
      fields: `business_discovery.username(${username}){username,name,biography,followers_count,${media}}`,
      access_token: pageToken,
    }),
  )
  const account = isObject(body.business_discovery) ? body.business_discovery : null
  if (!account) throw new InstagramApiError('Respons tanpa business_discovery', null, 200)
  const posts = isObject(account.media) ? toPosts(account.media.data) : []
  return {
    username: optionalString(account.username) ?? username,
    name: optionalString(account.name) ?? '',
    biography: optionalString(account.biography) ?? '',
    followersCount: typeof account.followers_count === 'number' ? account.followers_count : null,
    posts,
  }
}
