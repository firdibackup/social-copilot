import 'server-only'
import { decryptToken, encryptToken } from './crypto'
import type { InstagramPage } from './facebook'
import { db, unwrap } from './supabase'

export type FacebookStatus = 'active' | 'needs_reconnect'

/** What the UI may see. The Page token never leaves this module except through getDiscoveryAccount. */
export interface FacebookConnection {
  pageName: string
  username: string
  status: FacebookStatus
}

export interface DiscoveryAccount {
  accessToken: string
  instagramUserId: string
}

/** Business Discovery can't run until the owner connects (or reconnects) Facebook. */
export class FacebookReconnectError extends Error {
  override name = 'FacebookReconnectError'
}

interface ConnectionRow {
  page_name: string
  username: string
  instagram_user_id: string
  access_token_enc: string
  status: FacebookStatus
}

/** One Page per user and Instagram account: the connected account's Page is the one in use. */
async function loadRow(userId: string, accountId: string): Promise<ConnectionRow | null> {
  const result = await db()
    .from('facebook_connections')
    .select('page_name, username, instagram_user_id, access_token_enc, status')
    .eq('user_id', userId)
    .eq('instagram_user_id', accountId)
    .maybeSingle()
  return unwrap(result) as ConnectionRow | null
}

export async function getFacebookConnection(userId: string, accountId: string): Promise<FacebookConnection | null> {
  const row = await loadRow(userId, accountId)
  return row ? { pageName: row.page_name, username: row.username, status: row.status } : null
}

export async function saveFacebookConnection(userId: string, page: InstagramPage): Promise<void> {
  const now = new Date().toISOString()
  unwrap(
    await db().from('facebook_connections').upsert(
      {
        user_id: userId,
        page_id: page.pageId,
        page_name: page.pageName,
        instagram_user_id: page.instagramUserId,
        username: page.username,
        access_token_enc: encryptToken(page.pageToken),
        status: 'active',
        connected_at: now,
        updated_at: now,
      },
      { onConflict: 'user_id,instagram_user_id' },
    ),
  )
}

/** Every Page token of the user, so none is left behind whichever Instagram account it belonged to. */
export async function deleteFacebookConnection(userId: string): Promise<void> {
  unwrap(await db().from('facebook_connections').delete().eq('user_id', userId))
}

/** Whether any Page token of the user is stored, whichever Instagram account it belongs to. */
export async function hasFacebookConnection(userId: string): Promise<boolean> {
  const { count, error } = await db()
    .from('facebook_connections')
    .select('user_id', { count: 'exact', head: true })
    .eq('user_id', userId)
  if (error || count === null) throw new Error(`Supabase: ${error?.message || 'koneksi Facebook tidak terbaca'}`)
  return count > 0
}

/** After an Instagram account is connected, the Page tokens of the accounts it replaced go. */
export async function deleteOtherFacebookConnections(userId: string, accountId: string): Promise<void> {
  unwrap(await db().from('facebook_connections').delete().eq('user_id', userId).neq('instagram_user_id', accountId))
}

export async function markFacebookNeedsReconnect(userId: string, accountId: string): Promise<void> {
  unwrap(
    await db()
      .from('facebook_connections')
      .update({ status: 'needs_reconnect', updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('instagram_user_id', accountId),
  )
}

export async function getDiscoveryAccount(userId: string, accountId: string): Promise<DiscoveryAccount> {
  const row = await loadRow(userId, accountId)
  if (!row) throw new FacebookReconnectError('Facebook belum terhubung')
  if (row.status !== 'active') throw new FacebookReconnectError('Token Facebook dicabut')
  return { accessToken: decryptToken(row.access_token_enc), instagramUserId: row.instagram_user_id }
}
