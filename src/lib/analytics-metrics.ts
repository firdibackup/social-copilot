/**
 * The insights Analitik reads per post. All of them exist for both FEED and REELS media under Instagram Login
 * (Graph API v25, checked 2026-10-18); `impressions` is gone for media after July 2024 and `views` replaces it.
 */
export const METRICS = ['views', 'reach', 'likes', 'comments', 'shares', 'saved', 'total_interactions'] as const
export type Metric = (typeof METRICS)[number]
/** Null: Instagram gave no value, which is not the same as 0. */
export type Metrics = Record<Metric, number | null>

export const RANGES = [7, 30, 90] as const
export type RangeDays = (typeof RANGES)[number]
const DEFAULT_RANGE: RangeDays = 30
/** Sync reads every post this far back, so each range can be filtered from the stored rows. */
export const SYNC_DAYS = 90

const STALE_AFTER_MS = 6 * 60 * 60 * 1000

type Json = Record<string, unknown>
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const isMetric = (name: unknown): name is Metric => METRICS.some((metric) => metric === name)

export const emptyMetrics = (): Metrics =>
  Object.fromEntries(METRICS.map((metric) => [metric, null])) as Metrics

/** A lifetime metric carries its number in `values[0].value`; newer responses use `total_value.value`. */
function valueOf(entry: Json): number | null {
  const first = Array.isArray(entry.values) ? entry.values[0] : undefined
  if (isObject(first) && isCount(first.value)) return first.value
  if (isObject(entry.total_value) && isCount(entry.total_value.value)) return entry.total_value.value
  return null
}

/** `GET /{media-id}/insights`. Unknown or malformed entries are skipped, never fatal. */
export function parseInsights(body: unknown): Metrics {
  const data = isObject(body) && Array.isArray(body.data) ? body.data : []
  const entries = data.flatMap((entry): [Metric, number][] => {
    if (!isObject(entry) || !isMetric(entry.name)) return []
    const value = valueOf(entry)
    return value === null ? [] : [[entry.name, value]]
  })
  return { ...emptyMetrics(), ...Object.fromEntries(entries) }
}

/** Interactions per view, or null when there are no views to divide by. */
export function engagementRate(interactions: number | null, views: number | null): number | null {
  if (interactions === null || views === null || views <= 0) return null
  return interactions / views
}

export interface PostNumbers {
  views: number | null
  totalInteractions: number | null
}

export interface Summary {
  postCount: number
  views: number | null
  interactions: number | null
  engagementRate: number | null
}

const sumOf = (values: (number | null)[]) => {
  const known = values.filter(isCount)
  return known.length > 0 ? known.reduce((total, value) => total + value, 0) : null
}

/** The cards: totals over the posts that have each metric; the rate only over posts that have both. */
export function summarize(posts: readonly PostNumbers[]): Summary {
  const complete = posts.filter((post) => post.views !== null && post.totalInteractions !== null)
  return {
    postCount: posts.length,
    views: sumOf(posts.map((post) => post.views)),
    interactions: sumOf(posts.map((post) => post.totalInteractions)),
    engagementRate: engagementRate(
      sumOf(complete.map((post) => post.totalInteractions)),
      sumOf(complete.map((post) => post.views)),
    ),
  }
}

/** `?rentang=` from the URL. */
export function parseRange(value: string | undefined): RangeDays {
  return RANGES.find((days) => String(days) === value) ?? DEFAULT_RANGE
}

/** Opening the page syncs by itself when the last sync started over 6 hours ago, or never ran. */
export function isSyncStale(lastStartedAt: Date | null, now: Date): boolean {
  return lastStartedAt === null || now.getTime() - lastStartedAt.getTime() > STALE_AFTER_MS
}

const countFormat = new Intl.NumberFormat('id-ID')
const rateFormat = new Intl.NumberFormat('id-ID', { style: 'percent', maximumFractionDigits: 1 })

export const formatCount = (value: number | null) => (value === null ? '—' : countFormat.format(value))
export const formatRate = (value: number | null) => (value === null ? '—' : rateFormat.format(value))
