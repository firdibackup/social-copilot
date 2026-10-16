import 'server-only'
import { randomUUID } from 'node:crypto'
import {
  EMPTY_BRAND,
  isHex,
  MAX_REFERENCES,
  PROFILE_FIELDS,
  type BrandColor,
  type BrandContext,
  type BrandFields,
  type BrandKit,
  type BrandReference,
  type ReferenceSource,
} from './brand-options'
import { describeError } from './errors'
import type { ImageType } from './image'
import { db, unwrap } from './supabase'

const BUCKET = 'brand'
const VIEW_URL_TTL_SECONDS = 60 * 60
/** References sent in one visual analysis: the newest ones that fit VISUAL_BODY_BUDGET. */
export const VISUAL_REFERENCE_LIMIT = 8
/**
 * Data URL characters per analysis. 9Router sits behind nginx with the default 1 MB client_max_body_size
 * (413 above it, seen 2026-10-16), and its providers take image URLs only over HTTPS, which Storage isn't yet.
 * ponytail: fixed budget under that limit; raise client_max_body_size first, then this.
 */
export const VISUAL_BODY_BUDGET = 900_000
/** How many of the newest references are looked at to fill the budget. */
const VISUAL_CANDIDATES = 16

const EXTENSIONS: Record<ImageType, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

/** The gallery is full. The message is safe to show to the owner. */
export class ReferenceLimitError extends Error {
  override name = 'ReferenceLimitError'
}

interface KitRow {
  name: string
  category: string
  description: string
  website_url: string
  audience: string
  voice: string
  words_use: string
  words_avoid: string
  facts: string
  colors: unknown
  heading_font: string
  body_font: string
  visual_style: string
  logo_path: string | null
}

interface ReferenceRow {
  id: string
  storage_path: string
  content_type: ImageType
  source: ReferenceSource
  source_label: string
  permalink: string | null
  palette: unknown
  description: string
  note: string
}

const KIT_COLUMNS =
  'name, category, description, website_url, audience, voice, words_use, words_avoid, facts, colors, heading_font, body_font, visual_style, logo_path'
const REFERENCE_COLUMNS = 'id, storage_path, content_type, source, source_label, permalink, palette, description, note'

const bucket = () => db().storage.from(BUCKET)

/** Signed URLs carry a token: never log them. */
async function signUrls(paths: string[]): Promise<string[]> {
  if (paths.length === 0) return []
  const { data, error } = await bucket().createSignedUrls(paths, VIEW_URL_TTL_SECONDS)
  if (error) throw new Error(`Supabase Storage: ${error.message}`)
  const byPath = new Map(data.map((item) => [item.path, item.signedUrl]))
  return paths.map((path) => byPath.get(path) ?? '')
}

const colorsFrom = (value: unknown): BrandColor[] =>
  Array.isArray(value) ? value.filter((item): item is BrandColor => isHex(item?.hex) && typeof item?.role === 'string') : []
const paletteFrom = (value: unknown): string[] => (Array.isArray(value) ? value.filter(isHex) : [])

function toFields(row: KitRow): BrandFields {
  return {
    name: row.name,
    category: row.category,
    description: row.description,
    websiteUrl: row.website_url,
    audience: row.audience,
    voice: row.voice,
    wordsUse: row.words_use,
    wordsAvoid: row.words_avoid,
    facts: row.facts,
    headingFont: row.heading_font,
    bodyFont: row.body_font,
    visualStyle: row.visual_style,
    colors: colorsFrom(row.colors),
  }
}

async function loadKit(userId: string): Promise<KitRow | null> {
  return unwrap(await db().from('brand_kit').select(KIT_COLUMNS).eq('user_id', userId).maybeSingle()) as KitRow | null
}

export async function getBrandKit(userId: string): Promise<BrandKit> {
  const row = await loadKit(userId)
  if (!row) return { ...EMPTY_BRAND, logoUrl: null }
  const [logoUrl] = row.logo_path ? await signUrls([row.logo_path]) : [null]
  return { ...toFields(row), logoUrl: logoUrl || null }
}

/** The text the caption prompts use, or null when none of it is filled in. */
export async function getBrandContext(userId: string): Promise<BrandContext | null> {
  const row = await loadKit(userId)
  if (!row) return null
  const fields = toFields(row)
  const context = Object.fromEntries(PROFILE_FIELDS.map((field) => [field, fields[field]])) as BrandContext
  return PROFILE_FIELDS.some((field) => context[field]) ? context : null
}

/** Upserts every field but the logo, which has its own actions. */
export async function saveBrandKit(userId: string, fields: BrandFields): Promise<void> {
  unwrap(
    await db().from('brand_kit').upsert({
      user_id: userId,
      name: fields.name,
      category: fields.category,
      description: fields.description,
      website_url: fields.websiteUrl,
      audience: fields.audience,
      voice: fields.voice,
      words_use: fields.wordsUse,
      words_avoid: fields.wordsAvoid,
      facts: fields.facts,
      colors: fields.colors,
      heading_font: fields.headingFont,
      body_font: fields.bodyFont,
      visual_style: fields.visualStyle,
      updated_at: new Date().toISOString(),
    }),
  )
}

async function upload(userId: string, prefix: string, bytes: Uint8Array, type: ImageType): Promise<string> {
  const path = `${userId}/${prefix}${randomUUID()}.${EXTENSIONS[type]}`
  const result = await bucket().upload(path, bytes, { contentType: type })
  if (result.error) throw new Error(`Supabase Storage: ${result.error.message}`)
  return path
}

async function removeFile(path: string): Promise<void> {
  const removal = await bucket().remove([path])
  if (removal.error) console.error('[brand] file tertinggal di Storage:', describeError(removal.error))
}

/** Replaces the logo. The old file goes only after the row points at the new one. */
export async function setLogo(userId: string, bytes: Uint8Array, type: ImageType): Promise<void> {
  const previous = (await loadKit(userId))?.logo_path ?? null
  const path = await upload(userId, 'logo-', bytes, type)
  const saved = await db()
    .from('brand_kit')
    .upsert({ user_id: userId, logo_path: path, updated_at: new Date().toISOString() })
  if (saved.error) {
    await removeFile(path)
    throw new Error(`Supabase: ${saved.error.message}`)
  }
  if (previous) await removeFile(previous)
}

export async function removeLogo(userId: string): Promise<void> {
  const previous = (await loadKit(userId))?.logo_path ?? null
  if (!previous) return
  unwrap(
    await db()
      .from('brand_kit')
      .update({ logo_path: null, updated_at: new Date().toISOString() })
      .eq('user_id', userId),
  )
  await removeFile(previous)
}

export async function listReferences(userId: string): Promise<BrandReference[]> {
  const rows: ReferenceRow[] = unwrap(
    await db()
      .from('brand_references')
      .select(REFERENCE_COLUMNS)
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
  )
  const urls = await signUrls(rows.map((row) => row.storage_path))
  return rows.map((row, index) => ({
    id: row.id,
    url: urls[index],
    source: row.source,
    sourceLabel: row.source_label,
    permalink: row.permalink,
    palette: paletteFrom(row.palette),
    description: row.description,
    note: row.note,
  }))
}

export interface NewReference {
  bytes: Uint8Array
  type: ImageType
  source: ReferenceSource
  sourceLabel: string
  permalink: string | null
  palette: string[]
}

export async function addReference(userId: string, reference: NewReference): Promise<void> {
  // ponytail: two imports racing can pass this check together; the gallery may end a few over the cap.
  const { count, error } = await db()
    .from('brand_references')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
  if (error || count === null) throw new Error(`Supabase: ${error?.message || 'jumlah referensi tidak terbaca'}`)
  if (count >= MAX_REFERENCES) throw new ReferenceLimitError(`Referensi sudah ${MAX_REFERENCES}. Hapus yang lama dulu.`)

  const path = await upload(userId, 'ref-', reference.bytes, reference.type)
  const insert = await db().from('brand_references').insert({
    user_id: userId,
    storage_path: path,
    content_type: reference.type,
    source: reference.source,
    source_label: reference.sourceLabel,
    permalink: reference.permalink,
    palette: reference.palette,
  })
  if (insert.error) {
    await removeFile(path)
    throw new Error(`Supabase: ${insert.error.message}`)
  }
}

export interface ReferencePatch {
  note?: string
  description?: string
  palette?: string[]
}

/** False when the reference no longer exists. */
export async function updateReference(userId: string, id: string, patch: ReferencePatch): Promise<boolean> {
  const rows: unknown[] = unwrap(
    await db().from('brand_references').update(patch).eq('id', id).eq('user_id', userId).select('id'),
  )
  return rows.length === 1
}

export async function deleteReference(userId: string, id: string): Promise<void> {
  const rows: Pick<ReferenceRow, 'storage_path'>[] = unwrap(
    await db().from('brand_references').delete().eq('id', id).eq('user_id', userId).select('storage_path'),
  )
  if (rows.length === 1) await removeFile(rows[0].storage_path)
}

export interface VisualReference {
  id: string
  note: string
  /** The image itself as a data URL, for the vision model. */
  dataUrl: string
}

export interface VisualSelection {
  /** Oldest first, so the prompt numbers them in the order they were added. */
  references: VisualReference[]
  /** References among the newest VISUAL_CANDIDATES left out because they did not fit the request size. */
  skipped: number
}

async function dataUrlOf(path: string, type: ImageType): Promise<string> {
  const { data, error } = await bucket().download(path)
  if (error) throw new Error(`Supabase Storage: ${error.message}`)
  return `data:${type};base64,${Buffer.from(await data.arrayBuffer()).toString('base64')}`
}

/** What image prompts take from the kit. */
export interface BrandVisual {
  name: string
  category: string
  visualStyle: string
  colors: BrandColor[]
  headingFont: string
  bodyFont: string
}

/** Null when none of it is filled in. */
export async function getBrandVisual(userId: string): Promise<BrandVisual | null> {
  const row = await loadKit(userId)
  if (!row) return null
  const { name, category, visualStyle, colors, headingFont, bodyFont } = toFields(row)
  const visual = { name, category, visualStyle, colors, headingFont, bodyFont }
  const filled = colors.length > 0 || [name, category, visualStyle, headingFont, bodyFont].some(Boolean)
  return filled ? visual : null
}

export interface ReferenceImage {
  dataUrl: string
  note: string
}

/** One reference with its bytes, or null when it no longer exists. */
export async function loadReferenceImage(userId: string, id: string): Promise<ReferenceImage | null> {
  const row = unwrap(
    await db()
      .from('brand_references')
      .select('storage_path, content_type, note')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle(),
  ) as Pick<ReferenceRow, 'storage_path' | 'content_type' | 'note'> | null
  return row ? { dataUrl: await dataUrlOf(row.storage_path, row.content_type), note: row.note } : null
}

const TYPE_BY_EXTENSION = Object.fromEntries(Object.entries(EXTENSIONS).map(([type, ext]) => [ext, type])) as Record<
  string,
  ImageType
>

/** The logo as a data URL, or null when there is none. Its type comes from the extension `setLogo` gave it. */
export async function loadLogoImage(userId: string): Promise<string | null> {
  const path = (await loadKit(userId))?.logo_path
  const type = path ? TYPE_BY_EXTENSION[path.split('.').pop() ?? ''] : undefined
  return path && type ? dataUrlOf(path, type) : null
}

/** The newest references whose bytes fit in one request together. */
export async function loadVisualReferences(userId: string): Promise<VisualSelection> {
  const rows: Pick<ReferenceRow, 'id' | 'storage_path' | 'content_type' | 'note'>[] = unwrap(
    await db()
      .from('brand_references')
      .select('id, storage_path, content_type, note')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(VISUAL_CANDIDATES),
  )
  const references: VisualReference[] = []
  let used = 0
  let skipped = 0
  for (const row of rows) {
    if (references.length === VISUAL_REFERENCE_LIMIT) break
    const dataUrl = await dataUrlOf(row.storage_path, row.content_type)
    if (used + dataUrl.length > VISUAL_BODY_BUDGET) {
      skipped += 1
      continue
    }
    used += dataUrl.length
    references.push({ id: row.id, note: row.note, dataUrl })
  }
  return { references: references.reverse(), skipped }
}
