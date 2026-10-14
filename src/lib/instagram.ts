import 'server-only'
import { env } from './env'

export const INSTAGRAM_SCOPES = [
  'instagram_business_basic',
  'instagram_business_content_publish',
  'instagram_business_manage_messages',
] as const

const AUTHORIZE_URL = 'https://www.instagram.com/oauth/authorize'
const TOKEN_URL = 'https://api.instagram.com/oauth/access_token'
const GRAPH_URL = 'https://graph.instagram.com'
const REQUEST_TIMEOUT_MS = 15_000
const INVALID_TOKEN_CODE = 190

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
  ) {
    super(message)
  }

  /** Expired, revoked or otherwise unusable token: the owner must reconnect. */
  get isInvalidToken(): boolean {
    return this.code === INVALID_TOKEN_CODE
  }
}

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null

function readString(source: Json, key: string): string {
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
  return new InstagramApiError(typeof message === 'string' ? message : `HTTP ${status}`, code, status)
}

async function request(url: string | URL, init?: RequestInit): Promise<Json> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }).catch(
    (error: unknown) => {
      // Network errors can echo the URL, which carries the token; keep only the error type.
      const reason = error instanceof Error ? error.name : 'unknown'
      throw new InstagramApiError(`Instagram tidak bisa dihubungi (${reason})`, null, 0)
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
