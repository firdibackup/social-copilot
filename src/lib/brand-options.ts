/** Fields, limits and validation of the brand kit, shared by the /brand page and the server. */

export const BRAND_TEXT_LIMITS = {
  name: 100,
  category: 100,
  description: 1000,
  websiteUrl: 500,
  audience: 300,
  voice: 1000,
  wordsUse: 500,
  wordsAvoid: 500,
  facts: 2000,
  headingFont: 100,
  bodyFont: 100,
  visualStyle: 2000,
} as const

export type BrandTextField = keyof typeof BRAND_TEXT_LIMITS

export const FIELD_LABELS: Record<BrandTextField, string> = {
  name: 'Nama brand',
  category: 'Kategori',
  description: 'Deskripsi singkat',
  websiteUrl: 'Website',
  audience: 'Target audiens',
  voice: 'Gaya bahasa',
  wordsUse: 'Kata yang dipakai',
  wordsAvoid: 'Kata yang dihindari',
  facts: 'Fakta brand',
  headingFont: 'Font judul',
  bodyFont: 'Font isi',
  visualStyle: 'Gaya visual',
}

export const COLOR_ROLES = {
  utama: 'Utama',
  sekunder: 'Sekunder',
  aksen: 'Aksen',
  latar: 'Latar',
  teks: 'Teks',
} as const

export type ColorRole = keyof typeof COLOR_ROLES

export const MAX_COLORS = 6
export const MAX_REFERENCES = 30
export const PALETTE_SIZE = 5
export const NOTE_MAX_LENGTH = 500
export const DESCRIPTION_MAX_LENGTH = 1000
/** Logos are uploaded as they are, so they stay small. */
export const MAX_LOGO_BYTES = 2 * 1024 * 1024

export interface BrandColor {
  hex: string
  role: ColorRole
}

export type BrandFields = Record<BrandTextField, string> & { colors: BrandColor[] }

/** The new-account fill: running while it works, failed when a step failed, null otherwise. */
export type SyncStatus = 'running' | 'failed' | null

export interface BrandKit extends BrandFields {
  logoUrl: string | null
  syncStatus: SyncStatus
}

/** What the AI reads from websites and captions, and what the caption prompts use. */
export const PROFILE_FIELDS = [
  'name',
  'category',
  'description',
  'audience',
  'voice',
  'wordsUse',
  'wordsAvoid',
  'facts',
] as const satisfies readonly BrandTextField[]

export type ProfileField = (typeof PROFILE_FIELDS)[number]
export type BrandContext = Pick<BrandFields, ProfileField>

export type ReferenceSource = 'upload' | 'website' | 'instagram' | 'discovery'

/** What an image is inside its reference group: a carousel's cover, inner slides and closing slide, or a photo. */
export type ReferenceLabel = 'cover' | 'isi' | 'cta' | 'single'

export const REFERENCE_LABELS: Record<ReferenceLabel, string> = { cover: 'Cover', isi: 'Isi', cta: 'CTA', single: 'Tunggal' }

/** Instagram gives at most 20 slides per carousel. */
export const MAX_GROUP_IMAGES = 20

/** Labels by position: one image stands alone, two are cover and inner slide, more end with a CTA. */
export function labelsForCount(count: number): ReferenceLabel[] {
  if (count <= 1) return count === 1 ? ['single'] : []
  return Array.from({ length: count }, (_, index): ReferenceLabel => {
    if (index === 0) return 'cover'
    return count > 2 && index === count - 1 ? 'cta' : 'isi'
  })
}

export interface LabeledImage {
  position: number
  label: ReferenceLabel
}

/**
 * The group image a slide follows: slide 1 (or a one-image post) the cover, the last slide of three or more the CTA, the middle
 * slides the inner ones in turn. A missing label falls back to the cover, a missing cover to the first image.
 */
export function pickReferenceImage<T extends LabeledImage>(
  images: T[],
  slide: { index: number; count: number } | null,
): T | null {
  const sorted = [...images].sort((a, b) => a.position - b.position)
  const cover = sorted.find((image) => image.label === 'cover') ?? sorted.find((image) => image.label === 'single') ?? sorted[0]
  if (!cover || !slide || slide.count <= 1 || slide.index <= 1) return cover ?? null
  // Like labelsForCount: only a carousel of three or more ends with a CTA; two slides are cover and inner slide.
  if (slide.count > 2 && slide.index >= slide.count) return sorted.find((image) => image.label === 'cta') ?? cover
  const inner = sorted.filter((image) => image.label === 'isi')
  return inner.length > 0 ? inner[(slide.index - 2) % inner.length] : cover
}

const ROLE_ORDER = Object.keys(COLOR_ROLES) as ColorRole[]

/** Brand colours from the covers' palettes: their leading colours first, one per role, without repeats. */
export function colorsFromPalettes(palettes: string[][]): BrandColor[] {
  const picked: string[] = []
  const longest = Math.max(0, ...palettes.map((palette) => palette.length))
  for (let rank = 0; rank < longest && picked.length < ROLE_ORDER.length; rank += 1) {
    for (const palette of palettes) {
      const hex = palette[rank]?.toLowerCase()
      if (hex && isHex(hex) && !picked.includes(hex) && picked.length < ROLE_ORDER.length) picked.push(hex)
    }
  }
  return picked.map((hex, index) => ({ hex, role: ROLE_ORDER[index] }))
}

/** A design reference: one photo, or every slide of a carousel with its label. */
export interface BrandReference {
  id: string
  source: ReferenceSource
  /** @account or domain. */
  sourceLabel: string
  permalink: string | null
  /** The cover's palette. */
  palette: string[]
  description: string
  note: string
  /** In carousel order; never empty. */
  images: { id: string; url: string; position: number; label: ReferenceLabel }[]
}

export const EMPTY_BRAND: BrandFields = {
  name: '',
  category: '',
  description: '',
  websiteUrl: '',
  audience: '',
  voice: '',
  wordsUse: '',
  wordsAvoid: '',
  facts: '',
  headingFont: '',
  bodyFont: '',
  visualStyle: '',
  colors: [],
}

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null
/** Code points, as the counters and Postgres count them. */
export const lengthOf = (text: string) => Array.from(text).length
export const truncate = (text: string, max: number) => Array.from(text).slice(0, max).join('')

const HEX = /^#[0-9a-f]{6}$/

export const isHex = (value: unknown): value is string => typeof value === 'string' && HEX.test(value)

/** `#ABC` or `abc123` become `#aabbcc` / `#abc123`; anything else is null. */
export function normalizeHex(value: string): string | null {
  const digits = value.trim().replace(/^#/, '').toLowerCase()
  if (/^[0-9a-f]{3}$/.test(digits)) return `#${[...digits].map((digit) => digit + digit).join('')}`
  return /^[0-9a-f]{6}$/.test(digits) ? `#${digits}` : null
}

/** A palette as stored: at most PALETTE_SIZE hex colours. */
export function parsePalette(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > PALETTE_SIZE || !value.every(isHex)) return null
  return value
}

/** Adds `https://` when the owner typed a bare domain. Null when it is not an http(s) URL. */
export function normalizeWebsiteUrl(input: string): string | null {
  const text = input.trim()
  if (!text) return null
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`)
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || !url.hostname.includes('.')) return null
    return url.toString()
  } catch {
    return null
  }
}

/** Trims, turns textarea CRLF into LF and checks the limit. */
function readText(input: Json, field: BrandTextField): string | { error: string } {
  const value = input[field]
  if (value === undefined) return ''
  if (typeof value !== 'string') return { error: 'Data brand tidak valid.' }
  const text = value.replace(/\r\n/g, '\n').trim()
  const limit = BRAND_TEXT_LIMITS[field]
  return lengthOf(text) > limit ? { error: `${FIELD_LABELS[field]} maksimal ${limit} karakter.` } : text
}

function readColors(value: unknown): BrandColor[] | null {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > MAX_COLORS) return null
  const colors: BrandColor[] = []
  for (const item of value) {
    const hex = isObject(item) && typeof item.hex === 'string' ? normalizeHex(item.hex) : null
    const role = isObject(item) ? item.role : undefined
    if (!hex || typeof role !== 'string' || !Object.hasOwn(COLOR_ROLES, role)) return null
    colors.push({ hex, role: role as ColorRole })
  }
  return colors
}

/** Validates what the brand form sent. The server action's parameter type is only a hint. */
export function parseBrandFields(input: unknown): { fields: BrandFields } | { error: string } {
  if (!isObject(input)) return { error: 'Data brand tidak valid.' }
  const fields: BrandFields = { ...EMPTY_BRAND }
  for (const field of Object.keys(BRAND_TEXT_LIMITS) as BrandTextField[]) {
    const text = readText(input, field)
    if (typeof text !== 'string') return text
    fields[field] = text
  }
  if (fields.websiteUrl) {
    const url = normalizeWebsiteUrl(fields.websiteUrl)
    if (!url) return { error: 'Alamat website tidak valid.' }
    if (lengthOf(url) > BRAND_TEXT_LIMITS.websiteUrl) return { error: 'Website maksimal 500 karakter.' }
    fields.websiteUrl = url
  }
  const colors = readColors(input.colors)
  if (!colors) return { error: `Palet maksimal ${MAX_COLORS} warna, masing-masing dengan kode hex dan peran.` }
  fields.colors = colors
  return { fields }
}
