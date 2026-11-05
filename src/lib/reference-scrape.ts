import 'server-only'
import { fetchProfilePosts } from './apify'
import { MAX_GROUP_IMAGES } from './brand-options'
import { describeError } from './errors'
import { wibDateKey } from './format'
import type { InstagramPost } from './instagram'
import { db, unwrap } from './supabase'

/**
 * Brand › Referensi "Dari akun lain": distinct Instagram profiles one user may scrape through Apify per calendar
 * week (WIB, Monday to Sunday). Product decision: this number is never shown to the owner, only in logs.
 */
export const REFERENCE_SCRAPE_WEEKLY = 3
/** A profile scraped this long ago is served from the stored copy instead of a new Apify run. */
export const REFERENCE_SCRAPE_FRESH_MS = 12 * 60 * 60 * 1000

export class ReferenceScrapeError extends Error {
  override name = 'ReferenceScrapeError'

  constructor(
    /** `full`: no slot left this week; `empty`: private, unknown or without photo posts. */
    readonly kind: 'full' | 'empty',
  ) {
    super(kind === 'full' ? `kuota ${REFERENCE_SCRAPE_WEEKLY} profil/minggu habis` : 'profil tanpa post bergambar')
  }
}

type Reservation = 'existing' | 'reserved' | 'full'

/** The Monday of the WIB week of a moment, as the table's `week` (Postgres `date_trunc('week', …)`). */
export function scrapeWeek(now: Date): string {
  const day = new Date(`${wibDateKey(now)}T00:00:00Z`)
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7))
  return day.toISOString().slice(0, 10)
}

const isString = (value: unknown): value is string => typeof value === 'string'

function isStoredPost(value: unknown): value is InstagramPost {
  if (typeof value !== 'object' || value === null) return false
  const post = value as Record<string, unknown>
  return (
    isString(post.id) && isString(post.caption) && isString(post.imageUrl) && typeof post.isCarousel === 'boolean' &&
    (post.permalink === null || isString(post.permalink)) &&
    Array.isArray(post.images) && post.images.length > 0 && post.images.length <= MAX_GROUP_IMAGES &&
    post.images.every((url) => isString(url) && url.startsWith('https://'))
  )
}

/** Stored posts, or null when the row holds none or any of them isn't what readProfilePosts makes. */
function readStoredPosts(value: unknown): InstagramPost[] | null {
  return Array.isArray(value) && value.length > 0 && value.every(isStoredPost) ? value : null
}

const rowFilter = (userId: string, week: string, username: string) =>
  db().from('reference_profile_scrapes').select('posts, fetched_at').eq('user_id', userId).eq('week', week).eq('username', username)

async function scrape(userId: string, week: string, username: string): Promise<InstagramPost[]> {
  const posts = await fetchProfilePosts(username)
  if (posts.length === 0) throw new ReferenceScrapeError('empty')
  unwrap(
    await db()
      .from('reference_profile_scrapes')
      .update({ posts, fetched_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('week', week)
      .eq('username', username),
  )
  return posts
}

/**
 * One profile's recent photo and carousel posts for the reference picker. A username new this week takes one of
 * the user's slots (ReferenceScrapeError `full` when none is left) and gives it back when the scrape fails or finds
 * nothing; one already scraped this week takes none and is served from the stored copy while it is fresh.
 */
export async function loadProfilePosts(userId: string, username: string, now = new Date()): Promise<InstagramPost[]> {
  const week = scrapeWeek(now)
  const reservation = unwrap(
    await db().rpc('reserve_reference_scrape', { p_user_id: userId, p_username: username, p_limit: REFERENCE_SCRAPE_WEEKLY }),
  ) as Reservation | null

  if (reservation === 'full') {
    console.error(`[referensi] kuota ${REFERENCE_SCRAPE_WEEKLY} profil/minggu habis untuk user ${userId}`)
    throw new ReferenceScrapeError('full')
  }

  if (reservation === 'existing') {
    const row = unwrap(await rowFilter(userId, week, username).maybeSingle()) as { posts: unknown; fetched_at: string | null } | null
    const stored = row ? readStoredPosts(row.posts) : null
    const fetchedAt = row?.fetched_at ? Date.parse(row.fetched_at) : NaN
    if (stored && now.getTime() - fetchedAt < REFERENCE_SCRAPE_FRESH_MS) return stored
    return scrape(userId, week, username)
  }

  if (reservation !== 'reserved') throw new Error(`reserve_reference_scrape menjawab ${String(reservation)}`)
  try {
    return await scrape(userId, week, username)
  } catch (error) {
    try {
      unwrap(await db().rpc('release_reference_scrape', { p_user_id: userId, p_username: username }))
    } catch (releaseError) {
      console.error('[referensi] slot gagal dikembalikan:', describeError(releaseError))
    }
    throw error
  }
}
