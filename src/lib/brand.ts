import 'server-only'
import { cache } from 'react'
import { randomUUID } from 'node:crypto'
import {
  coverOf,
  EMPTY_BRAND,
  isHex,
  labelsForCount,
  MAX_GROUP_IMAGES,
  MAX_REFERENCES,
  PROFILE_FIELDS,
  type BrandColor,
  type BrandContext,
  type ProfileText,
  type BrandFields,
  type BrandKit,
  type BrandReference,
  type PoolImage,
  type ReferenceLabel,
  type ReferenceSource,
  type SyncStatus,
} from './brand-options'
import { getConnectedAccountId } from './connection'
import { readStoredStrategy, type ContentStrategy } from './strategy-options'
import { describeError } from './errors'
import type { ImageType } from './image'
import { toReferenceDataUrl } from './slide-image'
import { db, unwrap } from './supabase'

const BUCKET = 'brand'
const VIEW_URL_TTL_SECONDS = 60 * 60
/** Images sent in one visual analysis: the newest groups' that fit VISUAL_BODY_BUDGET. */
export const VISUAL_REFERENCE_LIMIT = 8
/**
 * Data URL characters per analysis. 9Router sits behind nginx with the default 1 MB client_max_body_size
 * (413 above it, seen 2026-10-16), and its providers take image URLs only over HTTPS, which Storage isn't yet.
 * ponytail: fixed budget under that limit; raise client_max_body_size first, then this.
 */
export const VISUAL_BODY_BUDGET = 900_000
/** How many of the newest references are looked at to fill the budget. */
const VISUAL_CANDIDATES = 16

const UNIQUE_VIOLATION = '23505'

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
  account_kind: string
  design_style: string
  logo_path: string | null
  sync_status: SyncStatus
  strategy: unknown
  updated_at: string
}

interface ImageRow {
  position: number
  label: ReferenceLabel
  storage_path: string
  content_type: ImageType
}

interface ReferenceRow {
  id: string
  source: ReferenceSource
  source_label: string
  permalink: string | null
  palette: unknown
  description: string
  note: string
  brand_reference_images: (Omit<ImageRow, 'content_type'> & { id: string })[]
}

const KIT_COLUMNS =
  'name, category, description, website_url, audience, voice, words_use, words_avoid, facts, colors, heading_font, body_font, visual_style, account_kind, design_style, logo_path, sync_status, strategy, updated_at'
const REFERENCE_COLUMNS = 'id, source, source_label, permalink, palette, description, note'

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
    accountKind: row.account_kind,
    designStyle: row.design_style,
    colors: colorsFrom(row.colors),
  }
}

/** One brand kit per user and Instagram account. */
const loadKit = cache(async (userId: string, accountId: string): Promise<KitRow | null> => {
  return unwrap(
    await db().from('brand_kit').select(KIT_COLUMNS).eq('user_id', userId).eq('account_id', accountId).maybeSingle(),
  ) as KitRow | null
})

/**
 * The connected account's kit, for AI prompts, which take only the user: one more query, against requests that
 * take seconds. Null without a connected account.
 */
async function loadConnectedKit(userId: string): Promise<KitRow | null> {
  const accountId = await getConnectedAccountId(userId)
  return accountId ? loadKit(userId, accountId) : null
}

export async function getBrandKit(userId: string, accountId: string): Promise<BrandKit> {
  const row = await loadKit(userId, accountId)
  if (!row) return { ...EMPTY_BRAND, logoUrl: null, syncStatus: null, strategy: null }
  const [logoUrl] = row.logo_path ? await signUrls([row.logo_path]) : [null]
  return { ...toFields(row), logoUrl: logoUrl || null, syncStatus: syncStatusOf(row), strategy: readStoredStrategy(row.strategy) }
}

/** Each fill step bumps updated_at; one that stopped moving was cut off (a restart, a deploy) and won't finish. */
const STALE_SYNC_MS = 5 * 60 * 1000

function syncStatusOf(row: KitRow): SyncStatus {
  const stale = Date.now() - new Date(row.updated_at).getTime() > STALE_SYNC_MS
  return row.sync_status === 'running' && stale ? 'failed' : (row.sync_status ?? null)
}

/** A kit row means the account was set up before: connecting it again fills nothing. */
export async function hasBrandKit(userId: string, accountId: string): Promise<boolean> {
  const { count, error } = await db()
    .from('brand_kit')
    .select('user_id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('account_id', accountId)
  if (error || count === null) throw new Error(`Supabase: ${error?.message || 'brand kit tidak terbaca'}`)
  return count > 0
}

/**
 * Claims the new-account fill with a running kit row, seeded with `seed` (the onboarding answers as columns).
 * False when another request claimed it first.
 */
export async function startBrandSync(userId: string, accountId: string, seed: Record<string, unknown> = {}): Promise<boolean> {
  const result = await db()
    .from('brand_kit')
    .insert({ ...seed, user_id: userId, account_id: accountId, sync_status: 'running' })
  if (result.error?.code === UNIQUE_VIOLATION) return false
  unwrap(result)
  return true
}

const COLUMN_OF: Record<keyof BrandFields, string> = {
  name: 'name',
  category: 'category',
  description: 'description',
  websiteUrl: 'website_url',
  audience: 'audience',
  voice: 'voice',
  wordsUse: 'words_use',
  wordsAvoid: 'words_avoid',
  facts: 'facts',
  colors: 'colors',
  headingFont: 'heading_font',
  bodyFont: 'body_font',
  visualStyle: 'visual_style',
  accountKind: 'account_kind',
  designStyle: 'design_style',
}

/** The kit's fields, or null without a kit: the new-account fill keeps what the onboarding put there. */
export async function getBrandFields(userId: string, accountId: string): Promise<BrandFields | null> {
  const row = await loadKit(userId, accountId)
  return row ? toFields(row) : null
}

/** Changes only the given fields, unlike saveBrandKit: the new-account fill saves step by step. */
export async function updateBrandKit(
  userId: string,
  accountId: string,
  patch: Partial<BrandFields> & { syncStatus?: SyncStatus },
): Promise<void> {
  const { syncStatus, ...fields } = patch
  const values: Record<string, unknown> = Object.fromEntries(
    Object.entries(fields).map(([field, value]) => [COLUMN_OF[field as keyof BrandFields], value]),
  )
  if (syncStatus !== undefined) values.sync_status = syncStatus
  unwrap(
    await db()
      .from('brand_kit')
      .update({ ...values, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('account_id', accountId),
  )
}

function contextFromKit(row: KitRow | null): BrandContext | null {
  if (!row) return null
  const fields = toFields(row)
  const context: BrandContext = Object.fromEntries(PROFILE_FIELDS.map((field) => [field, fields[field]])) as ProfileText
  const strategy = readStoredStrategy(row.strategy)
  if (strategy) context.strategy = strategy
  return strategy || PROFILE_FIELDS.some((field) => context[field]) ? context : null
}

/** The text the caption prompts use, with the strategy, or null when none of it is filled in. */
export async function getBrandContext(userId: string): Promise<BrandContext | null> {
  return contextFromKit(await loadConnectedKit(userId))
}

/** Brand context for an account already captured by a long-running request. */
export async function getAccountBrandContext(userId: string, accountId: string): Promise<BrandContext | null> {
  return contextFromKit(await loadKit(userId, accountId))
}

/** The connected account's strategy, for AI prompts; null without one. */
export async function getStrategy(userId: string): Promise<ContentStrategy | null> {
  const row = await loadConnectedKit(userId)
  return row ? readStoredStrategy(row.strategy) : null
}

/** The account's strategy, or null; for the new-account fill, which knows the account. */
export async function getAccountStrategy(userId: string, accountId: string): Promise<ContentStrategy | null> {
  const row = await loadKit(userId, accountId)
  return row ? readStoredStrategy(row.strategy) : null
}

/** Saves the strategy card on its own: the brand form's fields stay as they are. */
export async function saveStrategy(userId: string, accountId: string, strategy: ContentStrategy): Promise<void> {
  unwrap(
    await db()
      .from('brand_kit')
      .upsert(
        { user_id: userId, account_id: accountId, strategy, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,account_id' },
      ),
  )
}

/** Upserts every field but the logo, which has its own actions. */
export async function saveBrandKit(userId: string, accountId: string, fields: BrandFields): Promise<void> {
  unwrap(
    await db().from('brand_kit').upsert(
      {
        user_id: userId,
        account_id: accountId,
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
        account_kind: fields.accountKind,
        design_style: fields.designStyle,
        // The owner's own save settles a fill that failed; its notice has done its job.
        sync_status: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,account_id' },
    ),
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
export async function setLogo(userId: string, accountId: string, bytes: Uint8Array, type: ImageType): Promise<void> {
  const previous = (await loadKit(userId, accountId))?.logo_path ?? null
  const path = await upload(userId, 'logo-', bytes, type)
  const saved = await db()
    .from('brand_kit')
    .upsert(
      { user_id: userId, account_id: accountId, logo_path: path, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,account_id' },
    )
  if (saved.error) {
    await removeFile(path)
    throw new Error(`Supabase: ${saved.error.message}`)
  }
  if (previous) await removeFile(previous)
}

export async function removeLogo(userId: string, accountId: string): Promise<void> {
  const previous = (await loadKit(userId, accountId))?.logo_path ?? null
  if (!previous) return
  unwrap(
    await db()
      .from('brand_kit')
      .update({ logo_path: null, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('account_id', accountId),
  )
  await removeFile(previous)
}

export async function listReferences(userId: string, accountId: string): Promise<BrandReference[]> {
  const rows: ReferenceRow[] = unwrap(
    await db()
      .from('brand_references')
      .select(`${REFERENCE_COLUMNS}, brand_reference_images(id, position, storage_path, label)`)
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .order('created_at', { ascending: false }),
  )
  const groups = rows.map((row) => ({ row, images: [...row.brand_reference_images].sort((a, b) => a.position - b.position) }))
  const urls = await signUrls(groups.flatMap(({ images }) => images.map((image) => image.storage_path)))
  let urlIndex = 0
  return groups.map(({ row, images }) => ({
    id: row.id,
    source: row.source,
    sourceLabel: row.source_label,
    permalink: row.permalink,
    palette: paletteFrom(row.palette),
    description: row.description,
    note: row.note,
    images: images.map((image) => ({ id: image.id, url: urls[urlIndex++], position: image.position, label: image.label })),
  }))
}

export interface NewReference {
  /** One for a photo, every slide for a carousel (at most MAX_GROUP_IMAGES). */
  images: { bytes: Uint8Array; type: ImageType }[]
  /** Defaults to labelsForCount. */
  labels?: ReferenceLabel[]
  source: ReferenceSource
  sourceLabel: string
  permalink: string | null
  palette: string[]
}

async function removeFiles(paths: string[]): Promise<void> {
  if (paths.length === 0) return
  const removal = await bucket().remove(paths)
  if (removal.error) console.error('[brand] file tertinggal di Storage:', describeError(removal.error))
}

/** Stores one group: the row, its files, then its image rows. Anything half-saved is removed again. */
export async function addReference(userId: string, accountId: string, reference: NewReference): Promise<string> {
  const images = reference.images.slice(0, MAX_GROUP_IMAGES)
  if (images.length === 0) throw new Error('Referensi tanpa gambar')
  // ponytail: two imports racing can pass this check together; the gallery may end a few over the cap.
  const { count, error } = await db()
    .from('brand_references')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('account_id', accountId)
  if (error || count === null) throw new Error(`Supabase: ${error?.message || 'jumlah referensi tidak terbaca'}`)
  if (count >= MAX_REFERENCES) throw new ReferenceLimitError(`Referensi sudah ${MAX_REFERENCES}. Hapus yang lama dulu.`)

  const group = unwrap(
    await db()
      .from('brand_references')
      .insert({
        user_id: userId,
        account_id: accountId,
        source: reference.source,
        source_label: reference.sourceLabel,
        permalink: reference.permalink,
        palette: reference.palette,
      })
      .select('id')
      .single(),
  ) as { id: string }

  const labels = reference.labels?.length === images.length ? reference.labels : labelsForCount(images.length)
  const paths: string[] = []
  try {
    for (const image of images) paths.push(await upload(userId, 'ref-', image.bytes, image.type))
    unwrap(
      await db()
        .from('brand_reference_images')
        .insert(
          images.map((image, position) => ({
            user_id: userId,
            reference_id: group.id,
            position,
            storage_path: paths[position],
            content_type: image.type,
            label: labels[position],
          })),
        ),
    )
  } catch (failure) {
    await db().from('brand_references').delete().eq('id', group.id).eq('user_id', userId)
    await removeFiles(paths)
    throw failure
  }
  return group.id
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

/** The owner's label for one slide of a group. False when the image no longer exists. */
export async function setReferenceImageLabel(userId: string, imageId: string, label: ReferenceLabel): Promise<boolean> {
  const rows: unknown[] = unwrap(
    await db().from('brand_reference_images').update({ label }).eq('id', imageId).eq('user_id', userId).select('id'),
  )
  return rows.length === 1
}

/** Deletes the whole group; its image rows go with it, and their files after. */
export async function deleteReference(userId: string, id: string): Promise<void> {
  const images: { storage_path: string }[] = unwrap(
    await db().from('brand_reference_images').select('storage_path').eq('reference_id', id).eq('user_id', userId),
  )
  const rows: unknown[] = unwrap(
    await db().from('brand_references').delete().eq('id', id).eq('user_id', userId).select('id'),
  )
  if (rows.length === 1) await removeFiles(images.map((image) => image.storage_path))
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
  /** A DESIGN_STYLES id, or empty. */
  designStyle: string
}

/** Null when none of it is filled in. */
export async function getBrandVisual(userId: string): Promise<BrandVisual | null> {
  const row = await loadConnectedKit(userId)
  if (!row) return null
  const { name, category, visualStyle, colors, headingFont, bodyFont, designStyle } = toFields(row)
  const visual = { name, category, visualStyle, colors, headingFont, bodyFont, designStyle }
  const filled = colors.length > 0 || [name, category, visualStyle, headingFont, bodyFont, designStyle].some(Boolean)
  return filled ? visual : null
}

export interface ReferenceImage {
  dataUrl: string
  note: string
  /** Which slide of its group this is, so the prompt can say what it shows. */
  label: ReferenceLabel
}

/**
 * The reference images a new post can follow (see planReferenceImages): every image of the account's groups, or
 * of the one group the owner picked. Empty when that group is gone.
 */
export async function listReferencePool(userId: string, accountId: string, referenceId: string | null): Promise<PoolImage[]> {
  let query = db()
    .from('brand_reference_images')
    .select('id, position, label, brand_references!inner(account_id)')
    .eq('user_id', userId)
    .eq('brand_references.account_id', accountId)
  if (referenceId) query = query.eq('reference_id', referenceId)
  const rows: PoolImage[] = unwrap(await query)
  return rows.map(({ id, position, label }) => ({ id, position, label }))
}

/** One reference image a slide follows, with its bytes and its group's note. Null when it no longer exists. */
export async function loadReferenceImage(userId: string, imageId: string): Promise<ReferenceImage | null> {
  const image = unwrap(
    await db()
      .from('brand_reference_images')
      .select('label, storage_path, brand_references(note)')
      .eq('id', imageId)
      .eq('user_id', userId)
      .maybeSingle(),
  ) as { label: ReferenceLabel; storage_path: string; brand_references: { note: string } | null } | null
  if (!image) return null
  // Small, like the sibling slide beside it: a full-size Instagram photo can take most of the 1 MB request alone.
  const { data, error } = await bucket().download(image.storage_path)
  if (error) throw new Error(`Supabase Storage: ${error.message}`)
  const dataUrl = await toReferenceDataUrl(new Uint8Array(await data.arrayBuffer()))
  return { dataUrl, note: image.brand_references?.note ?? '', label: image.label }
}

const TYPE_BY_EXTENSION = Object.fromEntries(Object.entries(EXTENSIONS).map(([type, ext]) => [ext, type])) as Record<
  string,
  ImageType
>

export async function loadLogoBytes(userId: string): Promise<Uint8Array | null> {
  const path = (await loadConnectedKit(userId))?.logo_path
  if (!path) return null
  const { data, error } = await bucket().download(path)
  if (error) throw new Error(`Supabase Storage: ${error.message}`)
  return new Uint8Array(await data.arrayBuffer())
}

/** The logo as a data URL, or null when there is none. Its type comes from the extension `setLogo` gave it. */
export async function loadLogoImage(userId: string): Promise<string | null> {
  const path = (await loadConnectedKit(userId))?.logo_path
  const type = path ? TYPE_BY_EXTENSION[path.split('.').pop() ?? ''] : undefined
  return path && type ? dataUrlOf(path, type) : null
}

/** What the vision model sees of a group: its cover, one inner slide and its CTA. */
function visualImagesOf(images: ImageRow[]): ImageRow[] {
  const sorted = [...images].sort((x, y) => x.position - y.position)
  const cover = coverOf(sorted)
  const inner = sorted.find((image) => image.label === 'isi')
  const cta = sorted.find((image) => image.label === 'cta')
  return [cover, inner, cta].filter((image, index, all): image is ImageRow => !!image && all.indexOf(image) === index)
}

/**
 * The newest groups' images (cover, one inner slide, CTA) whose bytes fit in one request together.
 * VISUAL_REFERENCE_LIMIT counts images; several images of one group share its id.
 */
export async function loadVisualReferences(userId: string, accountId: string): Promise<VisualSelection> {
  const rows: { id: string; note: string; brand_reference_images: ImageRow[] }[] = unwrap(
    await db()
      .from('brand_references')
      .select('id, note, brand_reference_images(position, label, storage_path, content_type)')
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(VISUAL_CANDIDATES),
  )
  // Newest groups get the budget first; each group keeps slide order, so its cover leads (and is described first).
  const groups: VisualReference[][] = []
  let count = 0
  let used = 0
  let skipped = 0
  for (const row of rows) {
    const group: VisualReference[] = []
    for (const image of visualImagesOf(row.brand_reference_images)) {
      if (count === VISUAL_REFERENCE_LIMIT) break
      const dataUrl = await dataUrlOf(image.storage_path, image.content_type)
      if (used + dataUrl.length > VISUAL_BODY_BUDGET) {
        skipped += 1
        continue
      }
      used += dataUrl.length
      count += 1
      group.push({ id: row.id, note: row.note, dataUrl })
    }
    if (group.length > 0) groups.push(group)
  }
  return { references: groups.reverse().flat(), skipped }
}
