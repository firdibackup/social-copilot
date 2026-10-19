export const ASSET_CATEGORIES = {
  product: 'Produk',
  people: 'Orang/Tim',
  place: 'Tempat',
  logo: 'Logo/Grafis',
  other: 'Lainnya',
} as const

export type AssetCategory = keyof typeof ASSET_CATEGORIES
export type AssetOrigin = 'upload' | 'website' | 'ai'

export const isAssetCategory = (value: unknown): value is AssetCategory =>
  typeof value === 'string' && Object.hasOwn(ASSET_CATEGORIES, value)

export const isAssetOrigin = (value: unknown): value is AssetOrigin =>
  value === 'upload' || value === 'website' || value === 'ai'

/** Tags per photo; the column's check agrees. */
export const MAX_ASSET_TAGS = 20
export const TAG_MAX_LENGTH = 40

const normalizeTag = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase()

/** AI tags: distinct, lowercase and short, at most MAX_ASSET_TAGS. Anything else is dropped. */
export function cleanTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const tags = value
    .filter((item): item is string => typeof item === 'string')
    .map(normalizeTag)
    .filter((tag) => tag.length > 0 && tag.length <= TAG_MAX_LENGTH)
  return [...new Set(tags)].slice(0, MAX_ASSET_TAGS)
}

/** The owner's comma-separated tags, or why they can't be saved. */
export function parseTagInput(text: string): { tags: string[] } | { error: string } {
  const tags = [...new Set(text.split(',').map(normalizeTag).filter(Boolean))]
  if (tags.some((tag) => tag.length > TAG_MAX_LENGTH)) return { error: `Satu tag maksimal ${TAG_MAX_LENGTH} karakter.` }
  if (tags.length > MAX_ASSET_TAGS) return { error: `Maksimal ${MAX_ASSET_TAGS} tag per foto.` }
  return { tags }
}
