import 'server-only'
import { randomBytes } from 'node:crypto'
import { decryptToken, encryptToken } from './crypto'
import { describeError } from './errors'
import {
  InstagramApiError,
  fetchProfile,
  refreshLongLivedToken,
  type InstagramProfile,
  type LongLivedToken,
} from './instagram'
import { db } from './supabase'

const CONNECTION_ID = 1
const STATE_BYTES = 32
const STATE_TTL_MS = 10 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000
const REFRESH_MIN_AGE_MS = 24 * HOUR_MS
const REFRESH_WINDOW_MS = 7 * 24 * HOUR_MS

export type ConnectionStatus = 'active' | 'needs_reconnect'
export type ConnectionHealth = 'healthy' | 'needs_reconnect' | 'unreachable'

/** What the UI may see about the connection. The token never leaves this module. */
export interface Connection {
  username: string
  accountType: string
  tokenExpiresAt: Date
  status: ConnectionStatus
}

interface ConnectionRow {
  username: string
  account_type: string
  access_token_enc: string
  token_expires_at: string
  token_refreshed_at: string
  status: ConnectionStatus
}

export class NeedsReconnectError extends Error {
  override name = 'NeedsReconnectError'
}

function unwrap<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(`Supabase: ${result.error.message}`)
  return result.data
}

const stateCutoff = () => new Date(Date.now() - STATE_TTL_MS).toISOString()

export async function createOAuthState(): Promise<string> {
  const state = randomBytes(STATE_BYTES).toString('base64url')
  unwrap(await db().from('oauth_states').delete().lt('created_at', stateCutoff()))
  unwrap(await db().from('oauth_states').insert({ state }))
  return state
}

/** Deletes the state in the same query that checks it, so each state works exactly once. */
export async function consumeOAuthState(state: string): Promise<boolean> {
  const rows: unknown = unwrap(
    await db().from('oauth_states').delete().eq('state', state).gt('created_at', stateCutoff()).select('state'),
  )
  return Array.isArray(rows) && rows.length === 1
}

async function loadRow(): Promise<ConnectionRow | null> {
  const result = await db()
    .from('instagram_connections')
    .select('username, account_type, access_token_enc, token_expires_at, token_refreshed_at, status')
    .eq('id', CONNECTION_ID)
    .maybeSingle()
  return unwrap(result) as ConnectionRow | null
}

export async function getConnection(): Promise<Connection | null> {
  const row = await loadRow()
  if (!row) return null
  return {
    username: row.username,
    accountType: row.account_type,
    tokenExpiresAt: new Date(row.token_expires_at),
    status: row.status,
  }
}

export async function saveConnection(
  profile: InstagramProfile,
  token: LongLivedToken,
  scopes: string[],
): Promise<void> {
  const now = new Date().toISOString()
  unwrap(
    await db().from('instagram_connections').upsert({
      id: CONNECTION_ID,
      instagram_user_id: profile.userId,
      username: profile.username,
      account_type: profile.accountType,
      access_token_enc: encryptToken(token.accessToken),
      scopes,
      token_expires_at: token.expiresAt.toISOString(),
      token_refreshed_at: now,
      status: 'active',
      connected_at: now,
      updated_at: now,
    }),
  )
}

export async function deleteConnection(): Promise<void> {
  unwrap(await db().from('instagram_connections').delete().eq('id', CONNECTION_ID))
}

async function markNeedsReconnect(): Promise<void> {
  unwrap(
    await db()
      .from('instagram_connections')
      .update({ status: 'needs_reconnect', updated_at: new Date().toISOString() })
      .eq('id', CONNECTION_ID),
  )
}

/** Meta refuses refreshes for tokens younger than 24 hours; past that, refresh during the last week. */
export function shouldRefreshToken(refreshedAt: Date, expiresAt: Date, now: Date): boolean {
  const age = now.getTime() - refreshedAt.getTime()
  const remaining = expiresAt.getTime() - now.getTime()
  return age >= REFRESH_MIN_AGE_MS && remaining <= REFRESH_WINDOW_MS
}

async function refreshStoredToken(currentToken: string): Promise<string> {
  try {
    const refreshed = await refreshLongLivedToken(currentToken)
    const now = new Date().toISOString()
    unwrap(
      await db()
        .from('instagram_connections')
        .update({
          access_token_enc: encryptToken(refreshed.accessToken),
          token_expires_at: refreshed.expiresAt.toISOString(),
          token_refreshed_at: now,
          updated_at: now,
        })
        .eq('id', CONNECTION_ID),
    )
    return refreshed.accessToken
  } catch (error) {
    if (error instanceof InstagramApiError && error.isInvalidToken) {
      await markNeedsReconnect()
      throw new NeedsReconnectError('Token Instagram ditolak saat refresh')
    }
    // The current token has not expired yet; the next use retries the refresh.
    console.error('[instagram] refresh token gagal:', describeError(error))
    return currentToken
  }
}

/** Returns a usable access token, refreshing it first when it is close to expiry. */
export async function getValidAccessToken(): Promise<string> {
  const row = await loadRow()
  if (!row) throw new NeedsReconnectError('Instagram belum terhubung')

  const now = new Date()
  const expiresAt = new Date(row.token_expires_at)
  if (row.status === 'needs_reconnect' || expiresAt <= now) {
    if (row.status === 'active') await markNeedsReconnect()
    throw new NeedsReconnectError('Token Instagram kedaluwarsa atau dicabut')
  }

  const token = decryptToken(row.access_token_enc)
  return shouldRefreshToken(new Date(row.token_refreshed_at), expiresAt, now) ? refreshStoredToken(token) : token
}

/** Checks the stored token against Instagram. Used by the settings page. */
export async function checkConnectionHealth(): Promise<ConnectionHealth> {
  try {
    await fetchProfile(await getValidAccessToken())
    return 'healthy'
  } catch (error) {
    if (error instanceof NeedsReconnectError) return 'needs_reconnect'
    if (error instanceof InstagramApiError && error.isInvalidToken) {
      await markNeedsReconnect()
      return 'needs_reconnect'
    }
    console.error('[instagram] cek koneksi gagal:', describeError(error))
    return 'unreachable'
  }
}
