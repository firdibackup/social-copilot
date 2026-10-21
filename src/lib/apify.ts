import 'server-only'
import { env } from './env'

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
