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
import { db, unwrap } from './supabase'

const STATE_BYTES = 32
const STATE_TTL_MS = 10 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000
const REFRESH_MIN_AGE_MS = 24 * HOUR_MS
const REFRESH_WINDOW_MS = 7 * 24 * HOUR_MS
const UNIQUE_VIOLATION = '23505'

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
  instagram_user_id: string
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

/** The Instagram account is already connected to another user of the app. */
export class AccountTakenError extends Error {
  override name = 'AccountTakenError'
}

const stateCutoff = () => new Date(Date.now() - STATE_TTL_MS).toISOString()

/** A one-time state that only `userId` can redeem, so a login started by one user can't finish in another's session. */
export async function createOAuthState(userId: string): Promise<string> {
  const state = randomBytes(STATE_BYTES).toString('base64url')
  unwrap(await db().from('oauth_states').delete().lt('created_at', stateCutoff()))
  unwrap(await db().from('oauth_states').insert({ state, user_id: userId }))
  return state
}

/** Deletes the state in the same query that checks it, so each state works exactly once. */
export async function consumeOAuthState(state: string, userId: string): Promise<boolean> {
  const rows: unknown = unwrap(
    await db()
      .from('oauth_states')
      .delete()
      .eq('state', state)
      .eq('user_id', userId)
      .gt('created_at', stateCutoff())
      .select('state'),
  )
  return Array.isArray(rows) && rows.length === 1
}

async function loadRow(userId: string): Promise<ConnectionRow | null> {
  const result = await db()
    .from('instagram_connections')
    .select('instagram_user_id, username, account_type, access_token_enc, token_expires_at, token_refreshed_at, status')
    .eq('user_id', userId)
    .maybeSingle()
  return unwrap(result) as ConnectionRow | null
}

export async function getConnection(userId: string): Promise<Connection | null> {
  const row = await loadRow(userId)
  if (!row) return null
  return {
    username: row.username,
    accountType: row.account_type,
    tokenExpiresAt: new Date(row.token_expires_at),
    status: row.status,
  }
}

/** The user's Instagram account id, which webhooks carry as `entry.id`. Null when nothing is connected. */
export async function getConnectedAccountId(userId: string): Promise<string | null> {
  return (await loadRow(userId))?.instagram_user_id ?? null
}

/** Who connected the Instagram account a webhook is about. Null when no user has it. */
export async function findUserByInstagramId(instagramUserId: string): Promise<string | null> {
  const row = unwrap(
    await db().from('instagram_connections').select('user_id').eq('instagram_user_id', instagramUserId).maybeSingle(),
  ) as { user_id: string } | null
  return row?.user_id ?? null
}

export async function saveConnection(
  userId: string,
  profile: InstagramProfile,
  token: LongLivedToken,
  scopes: string[],
): Promise<void> {
  const now = new Date().toISOString()
  const result = await db().from('instagram_connections').upsert({
    user_id: userId,
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
  })
  if (result.error?.code === UNIQUE_VIOLATION) throw new AccountTakenError('Akun Instagram dipakai pengguna lain')
  unwrap(result)
}

/** Putuskan: the account's scheduled posts become drafts and the connection goes. Returns how many were drafted. */
export async function disconnectInstagram(userId: string): Promise<number> {
  return unwrap(await db().rpc('disconnect_instagram', { p_user_id: userId })) as number
}

/** Scheduled posts of an account that is no longer the connected one go back to draft. */
export async function draftScheduledPosts(userId: string, accountId: string): Promise<number> {
  return unwrap(await db().rpc('draft_scheduled_posts', { p_user_id: userId, p_account_id: accountId })) as number
}

/** Rows from before accounts existed (no account) go to the account being connected. */
export async function claimOrphanRows(userId: string, accountId: string): Promise<void> {
  unwrap(await db().rpc('claim_orphan_rows', { p_user_id: userId, p_account_id: accountId }))
}

export async function markNeedsReconnect(userId: string): Promise<void> {
  unwrap(
    await db()
      .from('instagram_connections')
      .update({ status: 'needs_reconnect', updated_at: new Date().toISOString() })
      .eq('user_id', userId),
  )
}

/** Meta refuses refreshes for tokens younger than 24 hours; past that, refresh during the last week. */
export function shouldRefreshToken(refreshedAt: Date, expiresAt: Date, now: Date): boolean {
  const age = now.getTime() - refreshedAt.getTime()
  const remaining = expiresAt.getTime() - now.getTime()
  return age >= REFRESH_MIN_AGE_MS && remaining <= REFRESH_WINDOW_MS
}

async function refreshStoredToken(userId: string, currentToken: string): Promise<string> {
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
        .eq('user_id', userId),
    )
    return refreshed.accessToken
  } catch (error) {
    if (error instanceof InstagramApiError && error.isInvalidToken) {
      await markNeedsReconnect(userId)
      throw new NeedsReconnectError('Token Instagram ditolak saat refresh')
    }
    // The current token has not expired yet; the next use retries the refresh.
    console.error('[instagram] refresh token gagal:', describeError(error))
    return currentToken
  }
}

export interface PublishingAccount {
  accessToken: string
  instagramUserId: string
}

/** A usable access token and its account id, refreshing the token first when it is close to expiry. */
export async function getPublishingAccount(userId: string): Promise<PublishingAccount> {
  const row = await loadRow(userId)
  if (!row) throw new NeedsReconnectError('Instagram belum terhubung')

  const now = new Date()
  const expiresAt = new Date(row.token_expires_at)
  if (row.status === 'needs_reconnect' || expiresAt <= now) {
    if (row.status === 'active') await markNeedsReconnect(userId)
    throw new NeedsReconnectError('Token Instagram kedaluwarsa atau dicabut')
  }

  const token = decryptToken(row.access_token_enc)
  const accessToken = shouldRefreshToken(new Date(row.token_refreshed_at), expiresAt, now)
    ? await refreshStoredToken(userId, token)
    : token
  return { accessToken, instagramUserId: row.instagram_user_id }
}

/** Returns a usable access token, refreshing it first when it is close to expiry. */
export async function getValidAccessToken(userId: string): Promise<string> {
  return (await getPublishingAccount(userId)).accessToken
}

/** Checks the stored token against Instagram. Used by the settings page. */
export async function checkConnectionHealth(userId: string): Promise<ConnectionHealth> {
  try {
    await fetchProfile(await getValidAccessToken(userId))
    return 'healthy'
  } catch (error) {
    if (error instanceof NeedsReconnectError) return 'needs_reconnect'
    if (error instanceof InstagramApiError && error.isInvalidToken) {
      await markNeedsReconnect(userId)
      return 'needs_reconnect'
    }
    console.error('[instagram] cek koneksi gagal:', describeError(error))
    return 'unreachable'
  }
}
