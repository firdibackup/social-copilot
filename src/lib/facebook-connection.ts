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

async function loadRow(userId: string): Promise<ConnectionRow | null> {
  const result = await db()
    .from('facebook_connections')
    .select('page_name, username, instagram_user_id, access_token_enc, status')
    .eq('user_id', userId)
    .maybeSingle()
  return unwrap(result) as ConnectionRow | null
}

export async function getFacebookConnection(userId: string): Promise<FacebookConnection | null> {
  const row = await loadRow(userId)
  return row ? { pageName: row.page_name, username: row.username, status: row.status } : null
}

export async function saveFacebookConnection(userId: string, page: InstagramPage): Promise<void> {
  const now = new Date().toISOString()
  unwrap(
    await db().from('facebook_connections').upsert({
      user_id: userId,
      page_id: page.pageId,
      page_name: page.pageName,
      instagram_user_id: page.instagramUserId,
      username: page.username,
      access_token_enc: encryptToken(page.pageToken),
      status: 'active',
      connected_at: now,
      updated_at: now,
    }),
  )
}

export async function deleteFacebookConnection(userId: string): Promise<void> {
  unwrap(await db().from('facebook_connections').delete().eq('user_id', userId))
}

export async function markFacebookNeedsReconnect(userId: string): Promise<void> {
  unwrap(
    await db()
      .from('facebook_connections')
      .update({ status: 'needs_reconnect', updated_at: new Date().toISOString() })
      .eq('user_id', userId),
  )
}

export async function getDiscoveryAccount(userId: string): Promise<DiscoveryAccount> {
  const row = await loadRow(userId)
  if (!row) throw new FacebookReconnectError('Facebook belum terhubung')
  if (row.status !== 'active') throw new FacebookReconnectError('Token Facebook dicabut')
  return { accessToken: decryptToken(row.access_token_enc), instagramUserId: row.instagram_user_id }
}
