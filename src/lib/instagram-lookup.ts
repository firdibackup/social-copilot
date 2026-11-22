import 'server-only'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { fetchLookupProfile, type LookupProfile } from './apify'
import { MAX_LOGO_BYTES } from './brand-options'
import { describeError } from './errors'
import { countFunnel, logFunnel } from './funnel'
import { parseInstagramUsername } from './instagram'
import { db, unwrap } from './supabase'
import { fetchImage } from './web-fetch'

/** Paid Apify runs one user may start in a day; a username read less than LOOKUP_FRESH_MS ago costs none. */
export const LOOKUPS_PER_DAY = 3
export const LOOKUP_FRESH_MS = 24 * 60 * 60 * 1000
const AVATAR_EDGE = 320
const AVATAR_URL_TTL_SECONDS = 60 * 60
const BUCKET = 'brand'

/** What the lookup keeps of a profile: text and counts, never a signed image link. */
export type StoredProfile = Omit<LookupProfile, 'avatar'>

export type LookupResult =
  | { status: 'ok' | 'private'; profile: StoredProfile; avatarUrl: string | null }
  /** `invalid`: not a username. `limited`: the user's lookups for today are used up. `failed`: Apify didn't answer. */
  | { status: 'not_found' | 'invalid' | 'limited' | 'failed' }

interface LookupRow {
  username: string
  status: 'ok' | 'private' | 'not_found'
  profile: StoredProfile | null
  avatar_path: string | null
  fetched_at: string
}

const bucket = () => db().storage.from(BUCKET)

async function loadRow(username: string): Promise<LookupRow | null> {
  return unwrap(
    await db().from('instagram_lookups').select('username, status, profile, avatar_path, fetched_at').eq('username', username).maybeSingle(),
  ) as LookupRow | null
}

/** The stored lookup of a username, whatever its age: what the onboarding saves once the user confirms it. */
export async function getStoredLookup(username: string): Promise<{ profile: StoredProfile; avatarPath: string | null } | null> {
  const row = await loadRow(username)
  return row?.profile && row.status !== 'not_found' ? { profile: row.profile, avatarPath: row.avatar_path } : null
}

/** A short-lived link to a stored profile picture or onboarding logo. */
export async function avatarUrl(path: string | null): Promise<string | null> {
  if (!path) return null
  const { data } = await bucket().createSignedUrl(path, AVATAR_URL_TTL_SECONDS)
  return data?.signedUrl ?? null
}

/** The stored picture's bytes, to become the brand logo. */
export async function readAvatar(path: string): Promise<Uint8Array> {
  const { data, error } = await bucket().download(path)
  if (error || !data) throw new Error(`Supabase Storage: ${error?.message || 'foto profil tidak terbaca'}`)
  return new Uint8Array(await data.arrayBuffer())
}

/** Copies the signed picture into our storage as a small JPEG. A picture that fails leaves the profile without one. */
async function copyAvatar(username: string, url: string): Promise<string | null> {
  try {
    const { bytes } = await fetchImage(url, MAX_LOGO_BYTES)
    const jpeg = await sharp(bytes).rotate().resize(AVATAR_EDGE, AVATAR_EDGE, { fit: 'cover' }).jpeg({ quality: 86 }).toBuffer()
    const path = `lookups/${username}-${randomUUID()}.jpg`
    const result = await bucket().upload(path, jpeg, { contentType: 'image/jpeg' })
    if (result.error) throw new Error(result.error.message)
    return path
  } catch (error) {
    console.error('[lookup] foto profil gagal disalin:', describeError(error))
    return null
  }
}

async function answer(row: LookupRow): Promise<LookupResult> {
  if (row.status === 'not_found' || !row.profile) return { status: 'not_found' }
  return { status: row.status, profile: row.profile, avatarUrl: await avatarUrl(row.avatar_path) }
}

/**
 * The public profile of what the user typed (a username, @username or a profile link). Reads our copy when it is
 * fresh; otherwise one Apify run, counted against the user's daily lookups.
 */
export async function lookupInstagram(userId: string, input: string, now = new Date()): Promise<LookupResult> {
  const username = parseInstagramUsername(input)
  if (!username) return { status: 'invalid' }
  const stored = await loadRow(username)
  if (stored && now.getTime() - new Date(stored.fetched_at).getTime() < LOOKUP_FRESH_MS) return answer(stored)
  if ((await countFunnel(userId, 'ig_lookup', new Date(now.getTime() - LOOKUP_FRESH_MS))) >= LOOKUPS_PER_DAY) return { status: 'limited' }
  // Counted before the run: a run that times out was still paid for.
  await logFunnel(userId, 'ig_lookup', username)

  let found: LookupProfile | null
  try {
    found = await fetchLookupProfile(username)
  } catch (error) {
    console.error('[lookup] Apify gagal:', describeError(error))
    return stored ? answer(stored) : { status: 'failed' }
  }
  let profile: StoredProfile | null = null
  if (found) {
    // Everything but the signed picture link.
    const kept: Partial<LookupProfile> = { ...found }
    delete kept.avatar
    profile = kept as StoredProfile
  }
  const row: LookupRow = {
    username,
    status: !found ? 'not_found' : found.private ? 'private' : 'ok',
    profile,
    avatar_path: found?.avatar ? await copyAvatar(username, found.avatar) : null,
    fetched_at: now.toISOString(),
  }
  unwrap(await db().from('instagram_lookups').upsert(row, { onConflict: 'username' }))
  if (stored?.avatar_path && stored.avatar_path !== row.avatar_path) {
    // Onboarding rows keep the path they confirmed: only a picture nobody points at goes.
    const { count } = await db().from('onboarding').select('user_id', { count: 'exact', head: true }).eq('avatar_path', stored.avatar_path)
    if (count === 0) await bucket().remove([stored.avatar_path])
  }
  return answer(row)
}
