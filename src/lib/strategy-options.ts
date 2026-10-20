/** The content strategy on Brand: who the account is, its content pillars and their shares, and its rhythm. */
import { isObject, lengthOf } from './brand-options'

export const STRATEGY_LIMITS = {
  identity: 60,
  pillarName: 80,
  pillarDetail: 200,
  tone: 60,
} as const

export const MIN_PILLARS = 2
export const MAX_PILLARS = 6
export const MIN_SHARE = 5
export const MIN_POSTS_PER_WEEK = 1
export const MAX_POSTS_PER_WEEK = 14
export const DEFAULT_POSTS_PER_WEEK = 3
const PILLAR_ID = /^[a-z0-9-]{1,40}$/

export const FOCUS_LABELS = {
  awareness: 'Meningkatkan awareness',
  engagement: 'Meningkatkan interaksi',
  trust: 'Membangun kepercayaan',
  sales: 'Mendorong penjualan',
} as const

export type StrategyFocus = keyof typeof FOCUS_LABELS

export const isFocus = (value: unknown): value is StrategyFocus =>
  typeof value === 'string' && Object.hasOwn(FOCUS_LABELS, value)

export interface ContentPillar {
  /** Stable while the pillar is renamed, so posts and ideas keep pointing at it. */
  id: string
  name: string
  /** What goes in it, e.g. "cara kerja sistem, tips MEP". */
  detail: string
  /** Whole percent; the pillars add up to 100. */
  share: number
}

export interface ContentStrategy {
  identity: string
  pillars: ContentPillar[]
  tone: string
  focus: StrategyFocus
  postsPerWeek: number
}

export const newPillarId = () => `p-${Math.random().toString(36).slice(2, 10)}`

export const totalShare = (pillars: Pick<ContentPillar, 'share'>[]) => pillars.reduce((sum, pillar) => sum + pillar.share, 0)

/** Shares that add up to 100, the first ones taking the remainder: 3 pillars are 34, 33, 33. */
export function evenShares(count: number): number[] {
  if (count <= 0) return []
  const base = Math.floor(100 / count)
  return Array.from({ length: count }, (_, index) => base + (index < 100 - base * count ? 1 : 0))
}

/** Whole numbers in proportion to `weights` that add up to `total` (largest remainder). */
function apportion(weights: number[], total: number): number[] {
  const sum = weights.reduce((acc, weight) => acc + weight, 0)
  const exact = weights.map((weight) => (weight / sum) * total)
  const shares = exact.map((value) => Math.floor(value))
  let left = total - shares.reduce((acc, share) => acc + share, 0)
  const order = exact
    .map((value, index) => ({ index, rest: value - Math.floor(value) }))
    .sort((a, b) => b.rest - a.rest || a.index - b.index)
  for (const { index } of order) {
    if (left <= 0) break
    shares[index] += 1
    left -= 1
  }
  return shares
}

/**
 * Whole-number shares of 100 in proportion to `weights`. A share below MIN_SHARE is raised to it, taken from the
 * largest. Weights that are all zero or invalid give even shares.
 */
export function normalizeShares(weights: number[]): number[] {
  const clean = weights.map((weight) => (Number.isFinite(weight) && weight > 0 ? weight : 0))
  if (clean.every((weight) => weight === 0)) return evenShares(weights.length)
  const shares = apportion(clean, 100)
  if (weights.length * MIN_SHARE > 100) return shares
  for (let index = 0; index < shares.length; index += 1) {
    while (shares[index] < MIN_SHARE) {
      const largest = shares.indexOf(Math.max(...shares))
      shares[largest] -= 1
      shares[index] += 1
    }
  }
  return shares
}

/**
 * How many of `count` ideas each pillar gets, in the pillars' order (largest remainder), so ten ideas follow
 * 30/25/20/15/10 as 3/3/2/1/1.
 */
export function pillarQuota(pillars: Pick<ContentPillar, 'share'>[], count: number): number[] {
  const total = totalShare(pillars)
  if (pillars.length === 0 || total <= 0 || count <= 0) return pillars.map(() => 0)
  return apportion(
    pillars.map((pillar) => pillar.share),
    count,
  )
}

const textOf = (value: unknown) => (typeof value === 'string' ? value.replace(/\r\n/g, '\n').trim() : null)

/** Validates what the strategy card sent; the server action's parameter type is only a hint. */
export function parseStrategy(input: unknown): { strategy: ContentStrategy } | { error: string } {
  if (!isObject(input)) return { error: 'Strategi tidak valid.' }
  const identity = textOf(input.identity)
  const tone = textOf(input.tone)
  if (identity === null || tone === null) return { error: 'Strategi tidak valid.' }
  if (!identity) return { error: 'Isi identitas brand.' }
  if (lengthOf(identity) > STRATEGY_LIMITS.identity) return { error: `Identitas maksimal ${STRATEGY_LIMITS.identity} karakter.` }
  if (lengthOf(tone) > STRATEGY_LIMITS.tone) return { error: `Gaya bahasa maksimal ${STRATEGY_LIMITS.tone} karakter.` }
  if (!isFocus(input.focus)) return { error: 'Pilih fokus saat ini.' }
  const postsPerWeek = input.postsPerWeek
  if (
    typeof postsPerWeek !== 'number' ||
    !Number.isInteger(postsPerWeek) ||
    postsPerWeek < MIN_POSTS_PER_WEEK ||
    postsPerWeek > MAX_POSTS_PER_WEEK
  ) {
    return { error: `Frekuensi antara ${MIN_POSTS_PER_WEEK} dan ${MAX_POSTS_PER_WEEK} post per minggu.` }
  }
  if (!Array.isArray(input.pillars)) return { error: 'Strategi tidak valid.' }
  if (input.pillars.length < MIN_PILLARS || input.pillars.length > MAX_PILLARS) {
    return { error: `Pilar konten ${MIN_PILLARS} sampai ${MAX_PILLARS}.` }
  }
  const pillars: ContentPillar[] = []
  const ids = new Set<string>()
  for (const item of input.pillars) {
    if (!isObject(item)) return { error: 'Strategi tidak valid.' }
    const id = item.id
    const name = textOf(item.name)
    const detail = textOf(item.detail)
    const share = item.share
    if (typeof id !== 'string' || !PILLAR_ID.test(id) || ids.has(id) || name === null || detail === null) {
      return { error: 'Strategi tidak valid.' }
    }
    if (!name) return { error: 'Setiap pilar perlu nama.' }
    if (lengthOf(name) > STRATEGY_LIMITS.pillarName) return { error: `Nama pilar maksimal ${STRATEGY_LIMITS.pillarName} karakter.` }
    if (lengthOf(detail) > STRATEGY_LIMITS.pillarDetail) {
      return { error: `Detail pilar maksimal ${STRATEGY_LIMITS.pillarDetail} karakter.` }
    }
    if (typeof share !== 'number' || !Number.isInteger(share) || share < MIN_SHARE || share > 100) {
      return { error: `Takaran setiap pilar minimal ${MIN_SHARE}%.` }
    }
    ids.add(id)
    pillars.push({ id, name, detail, share })
  }
  const total = totalShare(pillars)
  if (total !== 100) return { error: `Total takaran harus 100% (sekarang ${total}%).` }
  return { strategy: { identity, pillars, tone, focus: input.focus, postsPerWeek } }
}

/** A stored strategy, or null when it no longer passes the checks: the card then starts over. */
export function readStoredStrategy(value: unknown): ContentStrategy | null {
  if (value === null || value === undefined) return null
  const parsed = parseStrategy(value)
  return 'strategy' in parsed ? parsed.strategy : null
}

export const pillarOf = (strategy: ContentStrategy | null, id: string | null | undefined) =>
  (id && strategy?.pillars.find((pillar) => pillar.id === id)) || null

/** The strategy as prompt text, after the brand profile. */
export function describeStrategy(strategy: ContentStrategy): string {
  const pillars = strategy.pillars.map(
    (pillar) => `- ${pillar.share}% ${pillar.name}${pillar.detail ? ` (${pillar.detail})` : ''}`,
  )
  return [
    'Strategi konten brand:',
    `Identitas: ${strategy.identity}`,
    `Pilar konten:\n${pillars.join('\n')}`,
    strategy.tone ? `Gaya bahasa: ${strategy.tone}` : '',
    `Fokus saat ini: ${FOCUS_LABELS[strategy.focus]}`,
  ]
    .filter(Boolean)
    .join('\n')
}
