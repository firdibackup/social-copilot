import 'server-only'
import { decryptToken, encryptToken } from './crypto'
import type { InstagramPage } from './facebook'
import { db, unwrap } from './supabase'

const CONNECTION_ID = 1

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

async function loadRow(): Promise<ConnectionRow | null> {
  const result = await db()
    .from('facebook_connections')
    .select('page_name, username, instagram_user_id, access_token_enc, status')
    .eq('id', CONNECTION_ID)
    .maybeSingle()
  return unwrap(result) as ConnectionRow | null
}

export async function getFacebookConnection(): Promise<FacebookConnection | null> {
  const row = await loadRow()
  return row ? { pageName: row.page_name, username: row.username, status: row.status } : null
}

export async function saveFacebookConnection(page: InstagramPage): Promise<void> {
  const now = new Date().toISOString()
  unwrap(
    await db().from('facebook_connections').upsert({
      id: CONNECTION_ID,
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

export async function deleteFacebookConnection(): Promise<void> {
  unwrap(await db().from('facebook_connections').delete().eq('id', CONNECTION_ID))
}

export async function markFacebookNeedsReconnect(): Promise<void> {
  unwrap(
    await db()
      .from('facebook_connections')
      .update({ status: 'needs_reconnect', updated_at: new Date().toISOString() })
      .eq('id', CONNECTION_ID),
  )
}

export async function getDiscoveryAccount(): Promise<DiscoveryAccount> {
  const row = await loadRow()
  if (!row) throw new FacebookReconnectError('Facebook belum terhubung')
  if (row.status !== 'active') throw new FacebookReconnectError('Token Facebook dicabut')
  return { accessToken: decryptToken(row.access_token_enc), instagramUserId: row.instagram_user_id }
}
