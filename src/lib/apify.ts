import 'server-only'
import { createHash } from 'node:crypto'
import { env } from './env'
import { describeError } from './errors'
import { db, unwrap } from './supabase'

/**
 * Apify, for Intel Kompetitor in Sigap only: public Instagram profiles found by username or keyword, through the
 * `apify/instagram-scraper` actor (paid per result). The rest of the app reads Instagram only through Meta's APIs.
 * Profile pictures are signed CDN links: show them, never log them.
 */
const ACTOR = 'apify~instagram-scraper'
/** Leaves enough of Sigap's 300 s route budget for the model call before and after this actor. */
const RUN_TIMEOUT_MS = 90_000
export const MAX_COMPETITORS = 5
const MAX_RECENT_POSTS = 6
const CAPTION_LENGTH = 300
const BIO_LENGTH = 300
const INSTAGRAM_USERNAME = /^[a-z0-9._]{1,30}$/

export class ApifyError extends Error {
  override name = 'ApifyError'

  constructor(
    message: string,
    /** HTTP status, or 0 when Apify could not be reached or did not answer in time. */
    readonly status: number,
  ) {
    super(message)
  }
}

export interface CompetitorPost {
  caption: string
  likes: number | null
  comments: number | null
  /** ISO time. */
  postedAt: string | null
  /** `Image`, `Video` or `Sidecar` (carousel). */
  type: string
  url: string | null
  hashtags: string[]
}

export interface Competitor {
  username: string
  name: string
  bio: string
  followers: number | null
  postsCount: number | null
  verified: boolean
  /** Signed CDN link; it expires after a few days. */
  avatar: string | null
  recentPosts: CompetitorPost[]
}

export type CompetitorSearch = { kind: 'username'; usernames: string[] } | { kind: 'keyword'; keyword: string }

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null
const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''
const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null)

function toPost(value: unknown): CompetitorPost | null {
  if (!isObject(value)) return null
  return {
    caption: text(value.caption, CAPTION_LENGTH),
    likes: count(value.likesCount),
    comments: count(value.commentsCount),
    postedAt: typeof value.timestamp === 'string' ? value.timestamp : null,
    type: typeof value.type === 'string' ? value.type : '',
    url: typeof value.url === 'string' ? value.url : null,
    hashtags: Array.isArray(value.hashtags)
      ? value.hashtags.filter((tag): tag is string => typeof tag === 'string').slice(0, 10)
      : [],
  }
}

/** Reads the actor's `details` items into profiles, skipping errors and private or empty ones. Pure, for tests. */
export function readCompetitors(items: unknown, max = MAX_COMPETITORS): Competitor[] {
  if (!Array.isArray(items)) return []
  const seen = new Set<string>()
  const competitors: Competitor[] = []
  for (const item of items) {
    if (!isObject(item) || typeof item.username !== 'string' || 'error' in item) continue
    const username = item.username.trim().toLowerCase()
    if (!INSTAGRAM_USERNAME.test(username) || seen.has(username)) continue
    seen.add(username)
    const posts = Array.isArray(item.latestPosts) ? item.latestPosts : []
    competitors.push({
      username,
      name: text(item.fullName, 100),
      bio: text(item.biography, BIO_LENGTH),
      followers: count(item.followersCount),
      postsCount: count(item.postsCount),
      verified: item.verified === true,
      avatar: typeof item.profilePicUrl === 'string' && item.profilePicUrl.startsWith('https://') ? item.profilePicUrl : null,
      recentPosts: posts
        .map(toPost)
        .filter((post): post is CompetitorPost => post !== null)
        .slice(0, MAX_RECENT_POSTS),
    })
    if (competitors.length >= max) break
  }
  return competitors
}

/** The actor's input for a search. Pure, for tests. */
export function competitorInput(search: CompetitorSearch, max: number): Json {
  const limit = Math.min(Math.max(1, Math.floor(max)), MAX_COMPETITORS)
  if (search.kind === 'username') {
    return {
      directUrls: search.usernames.slice(0, limit).map((name) => `https://www.instagram.com/${name}/`),
      resultsType: 'details',
      resultsLimit: MAX_RECENT_POSTS,
    }
  }
  return {
    search: search.keyword,
    searchType: 'user',
    searchLimit: limit,
    resultsType: 'details',
    resultsLimit: MAX_RECENT_POSTS,
  }
}

/** Runs the actor and waits for its items. The token travels only in the header; errors never carry the URL. */
export async function findCompetitors(search: CompetitorSearch, max: number, outerSignal?: AbortSignal): Promise<Competitor[]> {
  const response = await fetch(`https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env('APIFY_TOKEN')}`, 'content-type': 'application/json' },
    body: JSON.stringify(competitorInput(search, max)),
    signal: outerSignal ? AbortSignal.any([AbortSignal.timeout(RUN_TIMEOUT_MS), outerSignal]) : AbortSignal.timeout(RUN_TIMEOUT_MS),
  }).catch((error: unknown) => {
    const reason = isObject(error) && typeof error.name === 'string' ? error.name : 'unknown'
    throw new ApifyError(`Apify tidak bisa dihubungi (${reason})`, 0)
  })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message = isObject(body) && isObject(body.error) && typeof body.error.message === 'string' ? body.error.message : ''
    throw new ApifyError(message || `HTTP ${response.status}`, response.status)
  }
  return readCompetitors(body, max)
}

/**
 * competitor_cache: a short-lived copy of findCompetitors' sanitized results, shared by every user (public profiles
 * only), so a repeated search skips Apify and the daily research slot. An optimisation, never the source of truth.
 */
export const USERNAME_CACHE_TTL_MS = 24 * 60 * 60 * 1000
export const KEYWORD_CACHE_TTL_MS = 12 * 60 * 60 * 1000
const CACHE_KEY_VERSION = 1

export interface NormalizedSearch {
  search: CompetitorSearch
  max: number
}

/**
 * The canonical form of a search, so the same request always hits the same row. Usernames are cut to `max` in the
 * given order (the first ones are what was asked for), then sorted; their `max` becomes their count. Pure, for tests.
 */
export function normalizeCompetitorSearch(search: CompetitorSearch, max: number): NormalizedSearch {
  const limit = Number.isFinite(max) ? Math.min(Math.max(1, Math.floor(max)), MAX_COMPETITORS) : MAX_COMPETITORS
  if (search.kind === 'keyword') {
    return { search: { kind: 'keyword', keyword: search.keyword.replace(/\s+/g, ' ').trim().toLowerCase() }, max: limit }
  }
  const usernames = [...new Set(search.usernames.map((name) => name.trim().replace(/^@/, '').toLowerCase()))]
    .filter((name) => INSTAGRAM_USERNAME.test(name))
    .slice(0, limit)
    .sort()
  return { search: { kind: 'username', usernames }, max: Math.max(1, usernames.length) }
}

const cacheQuery = (search: CompetitorSearch) => (search.kind === 'username' ? search.usernames.join(',') : search.keyword)

/** SHA-256 of the versioned canonical search: fixed length, and a keyword never lands in a log line. Pure, for tests. */
export function competitorCacheKey(search: CompetitorSearch, max: number): string {
  const normalized = normalizeCompetitorSearch(search, max)
  const canonical = JSON.stringify({
    version: CACHE_KEY_VERSION,
    kind: normalized.search.kind,
    query: cacheQuery(normalized.search),
    max: normalized.max,
  })
  return `v${CACHE_KEY_VERSION}:${createHash('sha256').update(canonical).digest('hex')}`
}

const cacheTtlMs = (search: CompetitorSearch) => (search.kind === 'username' ? USERNAME_CACHE_TTL_MS : KEYWORD_CACHE_TTL_MS)

const nullableCount = (value: unknown) => value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0)
const nullableString = (value: unknown) => value === null || typeof value === 'string'

function isCachedPost(value: unknown): value is CompetitorPost {
  return (
    isObject(value) &&
    typeof value.caption === 'string' && value.caption.length <= CAPTION_LENGTH &&
    nullableCount(value.likes) && nullableCount(value.comments) &&
    nullableString(value.postedAt) && typeof value.type === 'string' && nullableString(value.url) &&
    Array.isArray(value.hashtags) && value.hashtags.length <= 10 && value.hashtags.every((tag) => typeof tag === 'string')
  )
}

function isCachedCompetitor(value: unknown): value is Competitor {
  return (
    isObject(value) &&
    typeof value.username === 'string' && INSTAGRAM_USERNAME.test(value.username) &&
    typeof value.name === 'string' && value.name.length <= 100 && typeof value.bio === 'string' && value.bio.length <= BIO_LENGTH &&
    nullableCount(value.followers) && nullableCount(value.postsCount) && typeof value.verified === 'boolean' &&
    (value.avatar === null || (typeof value.avatar === 'string' && value.avatar.startsWith('https://'))) &&
    Array.isArray(value.recentPosts) && value.recentPosts.length <= MAX_RECENT_POSTS && value.recentPosts.every(isCachedPost)
  )
}

/**
 * A stored result, or null when any part of it isn't a Competitor the parser would have produced, or (for usernames)
 * holds an account that wasn't asked for. Pure, for tests.
 */
export function readCachedCompetitors(value: unknown, normalized: NormalizedSearch): Competitor[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > normalized.max || !value.every(isCachedCompetitor)) return null
  const { search } = normalized
  if (search.kind === 'username' && !value.every((account) => search.usernames.includes(account.username))) return null
  return value
}

/** The cached result of a search, or null on a miss. A broken row or an unreachable table is a miss, never an error. */
export async function getCachedCompetitors(search: CompetitorSearch, max: number): Promise<Competitor[] | null> {
  const normalized = normalizeCompetitorSearch(search, max)
  const key = competitorCacheKey(normalized.search, normalized.max)
  try {
    const row = unwrap(
      await db()
        .from('competitor_cache')
        .select('result')
        .eq('cache_key', key)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle(),
    ) as { result: unknown } | null
    if (!row) return null
    const cached = readCachedCompetitors(row.result, normalized)
    if (!cached) console.error('[apify] cache rusak, diabaikan:', key.slice(0, 15))
    return cached
  } catch (error) {
    console.error('[apify] cache gagal dibaca:', key.slice(0, 15), describeError(error))
    return null
  }
}

/** Best effort: a failed write only costs the next request an Apify run. An empty result is never kept. */
export async function saveCachedCompetitors(search: CompetitorSearch, max: number, result: Competitor[]): Promise<void> {
  if (result.length === 0) return
  const normalized = normalizeCompetitorSearch(search, max)
  const key = competitorCacheKey(normalized.search, normalized.max)
  const now = Date.now()
  try {
    unwrap(
      await db()
        .from('competitor_cache')
        .upsert(
          {
            cache_key: key,
            search_kind: normalized.search.kind,
            normalized_query: cacheQuery(normalized.search),
            max_results: normalized.max,
            result,
            created_at: new Date(now).toISOString(),
            expires_at: new Date(now + cacheTtlMs(normalized.search)).toISOString(),
          },
          { onConflict: 'cache_key' },
        ),
    )
  } catch (error) {
    console.error('[apify] cache gagal disimpan:', key.slice(0, 15), describeError(error))
  }
}
