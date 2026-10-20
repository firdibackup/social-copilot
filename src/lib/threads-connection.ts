import 'server-only'
import { shouldRefreshToken } from './connection'
import { decryptToken, encryptToken } from './crypto'
import { describeError } from './errors'
import { InstagramApiError, type LongLivedToken } from './instagram'
import { refreshThreadsToken, type ThreadsProfile } from './threads'
import { db, unwrap } from './supabase'

const UNIQUE_VIOLATION = '23505'
const HOUR_MS = 60 * 60 * 1000
const REFRESH_MIN_AGE_MS = 24 * HOUR_MS
const REFRESH_WINDOW_MS = 7 * 24 * HOUR_MS

export type ThreadsStatus = 'active' | 'needs_reconnect'

/** What the UI may see about the Threads connection. The token never leaves this module. */
export interface ThreadsConnection {
  username: string
  connectedAt: Date
  tokenExpiresAt: Date
  status: ThreadsStatus
  scopes: string[]
}

interface ConnectionRow {
  account_id: string
  threads_user_id: string
  username: string
  access_token_enc: string
  scopes: string[]
  token_expires_at: string
  token_refreshed_at: string
  status: ThreadsStatus
  connected_at: string
}

/** No usable Threads token: never connected, connected for another Instagram account, expired or revoked. */
export class ThreadsReconnectError extends Error {
  override name = 'ThreadsReconnectError'
}

/** The Threads account is already connected to another user of the app. */
export class ThreadsTakenError extends Error {
  override name = 'ThreadsTakenError'
}

const COLUMNS =
  'account_id, threads_user_id, username, access_token_enc, scopes, token_expires_at, token_refreshed_at, status, connected_at'

async function loadRow(userId: string): Promise<ConnectionRow | null> {
  return unwrap(await db().from('threads_connections').select(COLUMNS).eq('user_id', userId).maybeSingle()) as ConnectionRow | null
}

/** The user's Threads connection for this Instagram account (brand); one made for another account counts as none. */
export async function getThreadsConnection(userId: string, accountId: string): Promise<ThreadsConnection | null> {
  const row = await loadRow(userId)
  if (!row || row.account_id !== accountId) return null
  return {
    username: row.username,
    connectedAt: new Date(row.connected_at),
    tokenExpiresAt: new Date(row.token_expires_at),
    status: row.status,
    scopes: row.scopes,
  }
}

export async function saveThreadsConnection(
  userId: string,
  accountId: string,
  profile: ThreadsProfile,
  token: LongLivedToken,
  scopes: readonly string[],
): Promise<void> {
  const now = new Date().toISOString()
  const result = await db().from('threads_connections').upsert({
    user_id: userId,
    account_id: accountId,
    threads_user_id: profile.userId,
    username: profile.username,
    access_token_enc: encryptToken(token.accessToken),
    scopes: [...scopes],
    token_expires_at: token.expiresAt.toISOString(),
    token_refreshed_at: now,
    status: 'active',
    connected_at: now,
    updated_at: now,
    replies_synced_at: null,
  })
  if (result.error?.code === UNIQUE_VIOLATION) throw new ThreadsTakenError('Akun Threads dipakai pengguna lain')
  unwrap(result)
}

export async function deleteThreadsConnection(userId: string): Promise<void> {
  unwrap(await db().from('threads_connections').delete().eq('user_id', userId))
}

/** After switching Instagram accounts: a Threads connection made for another account goes, like its Page token. */
export async function deleteOtherThreadsConnection(userId: string, accountId: string): Promise<void> {
  unwrap(await db().from('threads_connections').delete().eq('user_id', userId).neq('account_id', accountId))
}

export async function markThreadsNeedsReconnect(userId: string): Promise<void> {
  unwrap(
    await db()
      .from('threads_connections')
      .update({ status: 'needs_reconnect', updated_at: new Date().toISOString() })
      .eq('user_id', userId),
  )
}

async function refreshStoredToken(userId: string, currentToken: string): Promise<string> {
  try {
    const refreshed = await refreshThreadsToken(currentToken)
    const now = new Date().toISOString()
    unwrap(
      await db()
        .from('threads_connections')
        .update({
          access_token_enc: encryptToken(refreshed.accessToken),
          token_expires_at: refreshed.expiresAt.toISOString(),
          token_refreshed_at: now,
          updated_at: now,
        })
        .eq('user_id', userId),
    )
    return refreshed.accessToken
  } catch (error) {
    if (error instanceof InstagramApiError && error.isInvalidToken) {
      await markThreadsNeedsReconnect(userId)
      throw new ThreadsReconnectError('Token Threads ditolak saat refresh')
    }
    // The current token has not expired yet; the next use retries the refresh.
    console.error('[threads] refresh token gagal:', describeError(error))
    return currentToken
  }
}

export interface ThreadsAccount {
  accessToken: string
  threadsUserId: string
  username: string
}

/**
 * A usable token for the Threads account connected for `accountId`, refreshed first when it is close to expiry.
 * Throws ThreadsReconnectError when there is none.
 */
export async function getThreadsAccount(userId: string, accountId: string): Promise<ThreadsAccount> {
  const row = await loadRow(userId)
  if (!row) throw new ThreadsReconnectError('Threads belum terhubung')
  if (row.account_id !== accountId) throw new ThreadsReconnectError('Threads terhubung untuk akun Instagram lain')

  const now = new Date()
  const expiresAt = new Date(row.token_expires_at)
  if (row.status === 'needs_reconnect' || expiresAt <= now) {
    if (row.status === 'active') await markThreadsNeedsReconnect(userId)
    throw new ThreadsReconnectError('Token Threads kedaluwarsa atau dicabut')
  }

  const token = decryptToken(row.access_token_enc)
  const accessToken = shouldRefreshToken(new Date(row.token_refreshed_at), expiresAt, now)
    ? await refreshStoredToken(userId, token)
    : token
  return { accessToken, threadsUserId: row.threads_user_id, username: row.username }
}

/**
 * The worker's daily round: tokens within a week of expiry are refreshed even when nobody used them, since a Threads
 * token not refreshed for 60 days can't be refreshed any more. Returns how many were refreshed.
 */
export async function refreshExpiringThreadsTokens(now = new Date()): Promise<number> {
  const rows = unwrap(
    await db()
      .from('threads_connections')
      .select('user_id, access_token_enc')
      .eq('status', 'active')
      .gt('token_expires_at', now.toISOString())
      .lt('token_expires_at', new Date(now.getTime() + REFRESH_WINDOW_MS).toISOString())
      .lt('token_refreshed_at', new Date(now.getTime() - REFRESH_MIN_AGE_MS).toISOString()),
  ) as { user_id: string; access_token_enc: string }[]
  let refreshed = 0
  for (const row of rows) {
    try {
      const token = decryptToken(row.access_token_enc)
      if ((await refreshStoredToken(row.user_id, token)) !== token) refreshed += 1
    } catch (error) {
      console.error('[threads] refresh harian gagal:', describeError(error))
    }
  }
  return refreshed
}

/** Starts a pull of replies unless one started less than `cooldownMs` ago; a conditional update, so two tabs don't both pull. */
export async function claimThreadsReplySync(userId: string, cooldownMs: number): Promise<boolean> {
  const now = new Date()
  const cutoff = new Date(now.getTime() - cooldownMs).toISOString()
  const rows: unknown = unwrap(
    await db()
      .from('threads_connections')
      .update({ replies_synced_at: now.toISOString() })
      .eq('user_id', userId)
      .eq('status', 'active')
      .or(`replies_synced_at.is.null,replies_synced_at.lt.${cutoff}`)
      .select('user_id'),
  )
  return Array.isArray(rows) && rows.length === 1
}

/** A failed pull frees its claim, so the next visit tries again. */
export async function releaseThreadsReplySync(userId: string): Promise<void> {
  unwrap(await db().from('threads_connections').update({ replies_synced_at: null }).eq('user_id', userId))
}
