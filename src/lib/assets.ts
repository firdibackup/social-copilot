import { createTranslator } from 'next-intl'
import type { Locale } from '@/i18n/locale-config'
import idMessages from '../../messages/id/assets.json'
import en from '../../messages/en/assets.json'
import 'server-only'
import { randomUUID } from 'node:crypto'
import { isAssetCategory, isAssetOrigin, type AssetCategory, type AssetOrigin } from './asset-options'
import { getConnectedAccountId } from './connection'
import { describeError } from './errors'
import { isJpeg } from './image'
import { toReferenceDataUrl } from './slide-image'
import { assertStorageAvailable, FileTooLargeError } from './storage-quota'
import { MAX_STORED_BYTES } from './storage-quota-options'
import { db, unwrap } from './supabase'

const MEDIA_BUCKET = 'media'
const VIEW_URL_TTL_SECONDS = 60 * 60
// ponytail: newest 100 only; add pagination once the library outgrows it.
const LIBRARY_LIMIT = 100
const FOREIGN_KEY_VIOLATION = '23503'

export type { AssetCategory, AssetOrigin } from './asset-options'

export interface Asset {
  id: string
  url: string
  width: number
  height: number
  origin: AssetOrigin
  groupId: string | null
  groupPosition: number | null
  isActive: boolean
  /** Keyword tags from AI or the owner; nothing reads them for content yet. */
  tags: string[]
}

export interface AssetGroup {
  id: string
  category: AssetCategory
  title: string
  description: string
  origin: AssetOrigin
  sourceUrl: string | null
  /** Of the photos loaded with the library. */
  photoCount: number
}

export interface AssetLibrary {
  /** Oldest first, so a new product lands next to the add button. */
  groups: AssetGroup[]
  /** The owner's photos (uploads and website), newest first. */
  mine: Asset[]
  /** Images AI made for slides, newest first. */
  ai: Asset[]
}

export interface TaggablePhoto {
  id: string
  bytes: Uint8Array
  product: string | null
}

export interface ProductGroup {
  id: string
  title: string
  description: string
  imageCount: number
}

export interface ProductImage {
  dataUrl: string
  title: string
}

export interface WebsiteAssetMatch {
  id: string
  groupId: string | null
}

interface AssetRow {
  id: string
  storage_path: string
  width: number
  height: number
  origin: AssetOrigin
  group_id: string | null
  group_position: number | null
  is_active: boolean
  tags: string[]
}

interface AssetGroupRow {
  id: string
  category: AssetCategory
  title: string
  description: string
  origin: AssetOrigin
  source_url: string | null
}

export interface CreateAssetOptions {
  locale?: Locale
  accountId?: string
  origin?: AssetOrigin
  groupId?: string
  groupPosition?: number
  sourceUrl?: string
  contentHash?: string
  /** A slide job already paid for may finish even if storage filled after it started. */
  enforceQuota?: boolean
}

export interface AssetGroupInput {
  category: AssetCategory
  title: string
  description: string
  origin: AssetOrigin
  sourceUrl?: string
  assetIds: string[]
}

/** The upload is not a usable photo. The message is safe to show to the owner. */
export class InvalidImageError extends Error {
  override name = 'InvalidImageError'
}

/** The photo is still part of a post (`post_media` restricts the delete). */
export class AssetInUseError extends Error {
  override name = 'AssetInUseError'
}

const bucket = () => db().storage.from(MEDIA_BUCKET)

const toAsset = (row: AssetRow, url: string): Asset => ({
  id: row.id,
  url,
  width: row.width,
  height: row.height,
  origin: row.origin,
  groupId: row.group_id,
  groupPosition: row.group_position,
  isActive: row.is_active,
  tags: row.tags,
})

const ASSET_COLUMNS = 'id, storage_path, width, height, origin, group_id, group_position, is_active, tags'

/**
 * Signed URLs for objects in the private bucket, in the same order as `paths`. They carry a token:
 * never log them. Built from NEXT_PUBLIC_SUPABASE_URL, which must be the public HTTPS domain for Meta.
 */
export async function signMediaUrls(paths: string[], ttlSeconds = VIEW_URL_TTL_SECONDS): Promise<string[]> {
  if (paths.length === 0) return []
  const { data, error } = await bucket().createSignedUrls(paths, ttlSeconds)
  if (error) throw new Error(`Supabase Storage: ${error.message}`)
  const byPath = new Map(data.map((item) => [item.path, item.signedUrl]))
  return paths.map((path) => byPath.get(path) ?? '')
}

/**
 * The account's photo library, newest first: everything, or only the owner's photos (`mine`) or AI results (`ai`).
 * Paused photos remain available for manually assembled posts.
 */
export async function listAssets(userId: string, accountId: string, set?: 'mine' | 'ai'): Promise<Asset[]> {
  const query = db().from('assets').select(ASSET_COLUMNS).eq('user_id', userId).eq('account_id', accountId)
  const rows: AssetRow[] = unwrap(
    await (set === 'ai' ? query.eq('origin', 'ai') : set === 'mine' ? query.neq('origin', 'ai') : query)
      .order('created_at', { ascending: false })
      .limit(LIBRARY_LIMIT),
  )
  const urls = await signMediaUrls(rows.map((row) => row.storage_path))
  return rows.map((row, index) => toAsset(row, urls[index]))
}

/** The user's assets among `ids`, in the order of `ids`, with view URLs. Missing ones drop out. */
export async function loadAssetsByIds(userId: string, ids: string[]): Promise<Asset[]> {
  if (ids.length === 0) return []
  const rows: AssetRow[] = unwrap(await db().from('assets').select(ASSET_COLUMNS).in('id', ids).eq('user_id', userId))
  const byId = new Map(rows.map((row) => [row.id, row]))
  const ordered = ids.flatMap((id) => byId.get(id) ?? [])
  const urls = await signMediaUrls(ordered.map((row) => row.storage_path))
  return ordered.map((row, index) => toAsset(row, urls[index]))
}

/** What Aset shows. Own photos and AI results are read apart, so a pile of slides can't push the owner's photos out. */
export async function listAssetLibrary(userId: string, accountId: string): Promise<AssetLibrary> {
  const [mine, ai, groups] = await Promise.all([
    listAssets(userId, accountId, 'mine'),
    listAssets(userId, accountId, 'ai'),
    db()
      .from('asset_groups')
      .select('id, category, title, description, origin, source_url')
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .order('created_at', { ascending: true }),
  ])
  const groupRows: AssetGroupRow[] = unwrap(groups)
  const countOf = (groupId: string) => mine.filter((asset) => asset.groupId === groupId).length
  return {
    groups: groupRows.map((group) => ({
      id: group.id,
      category: group.category,
      title: group.title,
      description: group.description,
      origin: group.origin,
      sourceUrl: group.source_url,
      photoCount: countOf(group.id),
    })),
    mine,
    ai,
  }
}

/** Stores a JPEG prepared by the browser or by the server-side website/image pipeline. */
export async function createAsset(
  userId: string,
  file: Blob,
  width: number,
  height: number,
  options: CreateAssetOptions = {},
): Promise<Asset> {
  const locale = options.locale ?? 'id'
  const t = createTranslator({ locale, messages: locale === 'en' ? en : idMessages })
  if (file.size === 0) throw new InvalidImageError(t('library.text1'))
  if (file.size > MAX_STORED_BYTES) throw new FileTooLargeError(locale)
  if (![width, height].every((side) => Number.isInteger(side) && side > 0)) {
    throw new InvalidImageError(t('library.text2'))
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!isJpeg(bytes)) throw new InvalidImageError(t('library.text3'))
  if (options.enforceQuota !== false) await assertStorageAvailable(userId, bytes.length, locale)

  const path = `${userId}/${randomUUID()}.jpg`
  const upload = await bucket().upload(path, bytes, { contentType: 'image/jpeg' })
  if (upload.error) throw new Error(`Supabase Storage: ${upload.error.message}`)

  const insert = await db()
    .from('assets')
    .insert({
      user_id: userId,
      account_id: options.accountId,
      storage_path: path,
      width,
      height,
      size_bytes: bytes.length,
      origin: options.origin ?? 'upload',
      group_id: options.groupId,
      group_position: options.groupPosition,
      source_url: options.sourceUrl,
      content_hash: options.contentHash,
    })
    .select('id')
    .single<{ id: string }>()
  if (insert.error) {
    // No row points at the object, so remove it rather than leave an orphan.
    await bucket().remove([path])
    throw new Error(`Supabase: ${insert.error.message}`)
  }
  const [url] = await signMediaUrls([path])
  return {
    id: insert.data.id,
    url,
    width,
    height,
    origin: options.origin ?? 'upload',
    groupId: options.groupId ?? null,
    groupPosition: options.groupPosition ?? null,
    isActive: true,
    tags: [],
  }
}

/** Creates one group and assigns the selected account assets to it in one database transaction. */
export async function createAssetGroup(
  userId: string,
  accountId: string,
  input: AssetGroupInput,
  locale: Locale = 'id',
): Promise<string> {
  const t = createTranslator({ locale, messages: locale === 'en' ? en : idMessages })
  if (!isAssetCategory(input.category)) throw new Error(t('library.text4'))
  if (!isAssetOrigin(input.origin)) throw new Error(t('library.text5'))
  const title = input.title.trim()
  const description = input.description.trim()
  if (!title || title.length > 120) throw new Error(t('library.text6'))
  if (description.length > 500) throw new Error(t('library.text7'))
  const { data, error } = await db().rpc('create_asset_group', {
    p_user_id: userId,
    p_account_id: accountId,
    p_category: input.category,
    p_title: title,
    p_description: description,
    p_origin: input.origin,
    p_source_url: input.sourceUrl ?? null,
    p_asset_ids: input.assetIds,
  })
  if (error) throw new Error(`Supabase: ${error.message}`)
  return data as string
}

/** Updates owner-editable group details while preserving provenance. */
export async function updateAssetGroup(
  userId: string,
  id: string,
  input: Pick<AssetGroupInput, 'category' | 'title' | 'description'>,
  locale: Locale = 'id',
): Promise<boolean> {
  const t = createTranslator({ locale, messages: locale === 'en' ? en : idMessages })
  if (!isAssetCategory(input.category)) throw new Error(t('library.text4'))
  const title = input.title.trim()
  const description = input.description.trim()
  if (!title || title.length > 120) throw new Error(t('library.text6'))
  if (description.length > 500) throw new Error(t('library.text7'))
  const rows = unwrap(
    await db()
      .from('asset_groups')
      .update({ category: input.category, title, description, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)
      .select('id'),
  ) as { id: string }[]
  return rows.length > 0
}

/** Controls whether AI may use the photos. It does not remove them from the manual post picker. Returns how many changed. */
export async function setAssetsActive(userId: string, ids: string[], active: boolean): Promise<number> {
  const rows = unwrap(
    await db().from('assets').update({ is_active: active }).in('id', ids).eq('user_id', userId).select('id'),
  ) as { id: string }[]
  return rows.length
}

/** Replaces a photo's tags; `tags` must already be clean (cleanTags, parseTagInput). */
export async function setAssetTags(userId: string, id: string, tags: string[]): Promise<boolean> {
  const rows = unwrap(
    await db().from('assets').update({ tags }).eq('id', id).eq('user_id', userId).select('id'),
  ) as { id: string }[]
  return rows.length > 0
}

/** The account's own photos among `ids` (never AI results), with their product's name, for tagging. */
export async function loadOwnPhotos(userId: string, accountId: string, ids: string[]): Promise<TaggablePhoto[]> {
  // A photo has at most one group, so PostgREST embeds an object; untyped, supabase-js guesses an array.
  const rows = unwrap(
    await db()
      .from('assets')
      .select('id, storage_path, asset_groups(title)')
      .in('id', ids)
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .neq('origin', 'ai'),
  ) as unknown as { id: string; storage_path: string; asset_groups: { title: string } | null }[]
  return Promise.all(
    rows.map(async (row) => {
      const { data, error } = await bucket().download(row.storage_path)
      if (error) throw new Error(`Supabase Storage: ${error.message}`)
      return { id: row.id, bytes: new Uint8Array(await data.arrayBuffer()), product: row.asset_groups?.title ?? null }
    }),
  )
}

export async function deleteAssetGroup(userId: string, id: string): Promise<boolean> {
  const rows = unwrap(await db().from('asset_groups').delete().eq('id', id).eq('user_id', userId).select('id')) as { id: string }[]
  return rows.length > 0
}

export async function moveAssetToGroup(userId: string, accountId: string, assetId: string, groupId: string | null): Promise<boolean> {
  const { data, error } = await db().rpc('move_asset_to_group', {
    p_user_id: userId,
    p_account_id: accountId,
    p_asset_id: assetId,
    p_group_id: groupId,
  })
  if (error) throw new Error(`Supabase: ${error.message}`)
  return data === true
}

/** A photo AI may send as the product: the owner's own (uploaded or from the website) and not paused. */
const isProductPhoto = (asset: { is_active: boolean; origin: AssetOrigin }) => asset.is_active && asset.origin !== 'ai'

export async function listProductGroups(userId: string, accountId: string): Promise<ProductGroup[]> {
  const groups: {
    id: string
    title: string
    description: string
    assets: { id: string; is_active: boolean; origin: AssetOrigin }[]
  }[] = unwrap(
    await db()
      .from('asset_groups')
      .select('id, title, description, assets(id, is_active, origin)')
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .eq('category', 'product')
      .order('created_at', { ascending: false })
      .limit(40),
  )
  return groups
    .map((group) => ({
      id: group.id,
      title: group.title,
      description: group.description,
      imageCount: group.assets.filter(isProductPhoto).length,
    }))
    .filter((group) => group.imageCount > 0)
}

export async function loadProductImages(userId: string, groupId: string, limit = 2): Promise<ProductImage[]> {
  const accountId = await getConnectedAccountId(userId)
  if (!accountId) return []
  const group = unwrap(
    await db()
      .from('asset_groups')
      .select('title, assets(storage_path, is_active, origin, group_position)')
      .eq('id', groupId)
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .eq('category', 'product')
      .maybeSingle(),
  ) as {
    title: string
    assets: { storage_path: string; is_active: boolean; origin: AssetOrigin; group_position: number | null }[]
  } | null
  if (!group) return []
  const images = group.assets
    .filter(isProductPhoto)
    .sort((left, right) => (left.group_position ?? Number.MAX_SAFE_INTEGER) - (right.group_position ?? Number.MAX_SAFE_INTEGER))
    .slice(0, limit)
  return Promise.all(
    images.map(async (image) => {
      const { data, error } = await bucket().download(image.storage_path)
      if (error) throw new Error(`Supabase Storage: ${error.message}`)
      return { dataUrl: await toReferenceDataUrl(new Uint8Array(await data.arrayBuffer())), title: group.title }
    }),
  )
}

export async function listActiveWebsiteAssets(userId: string, limit = 6): Promise<{ id: string; bytes: Uint8Array }[]> {
  const accountId = await getConnectedAccountId(userId)
  if (!accountId) return []
  const rows: { id: string; storage_path: string }[] = unwrap(
    await db()
      .from('assets')
      .select('id, storage_path')
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .eq('origin', 'website')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(limit),
  )
  return Promise.all(
    rows.map(async (row) => {
      const { data, error } = await bucket().download(row.storage_path)
      if (error) throw new Error(`Supabase Storage: ${error.message}`)
      return { id: row.id, bytes: new Uint8Array(await data.arrayBuffer()) }
    }),
  )
}

export async function findWebsiteAsset(
  userId: string,
  accountId: string,
  sourceUrl: string,
  contentHash?: string,
): Promise<WebsiteAssetMatch | null> {
  const byUrl = unwrap(
    await db()
      .from('assets')
      .select('id, group_id')
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .eq('origin', 'website')
      .eq('source_url', sourceUrl)
      .maybeSingle(),
  ) as { id: string; group_id: string | null } | null
  if (byUrl || !contentHash) return byUrl ? { id: byUrl.id, groupId: byUrl.group_id } : null
  const byHash = unwrap(
    await db()
      .from('assets')
      .select('id, group_id')
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .eq('origin', 'website')
      .eq('content_hash', contentHash)
      .maybeSingle(),
  ) as { id: string; group_id: string | null } | null
  return byHash ? { id: byHash.id, groupId: byHash.group_id } : null
}

/** The stored JPEG of one of the user's photos, or null when it is gone. */
export async function loadAssetBytes(userId: string, assetId: string): Promise<Uint8Array | null> {
  const row = unwrap(
    await db().from('assets').select('storage_path').eq('id', assetId).eq('user_id', userId).maybeSingle(),
  ) as Pick<AssetRow, 'storage_path'> | null
  if (!row) return null
  const { data, error } = await bucket().download(row.storage_path)
  if (error) throw new Error(`Supabase Storage: ${error.message}`)
  return new Uint8Array(await data.arrayBuffer())
}

/** A file in the media bucket by its path, for the worker. */
export async function downloadMedia(path: string): Promise<Uint8Array> {
  const { data, error } = await bucket().download(path)
  if (error) throw new Error(`Supabase Storage: ${error.message}`)
  return new Uint8Array(await data.arrayBuffer())
}

/** Writes a worker-made JPEG that isn't a library photo (no assets row), replacing one already there. */
export async function uploadMediaFile(path: string, bytes: Uint8Array): Promise<void> {
  const { error } = await bucket().upload(path, bytes, { contentType: 'image/jpeg', upsert: true })
  if (error) throw new Error(`Supabase Storage: ${error.message}`)
}

export async function removeMediaFile(path: string): Promise<void> {
  const { error } = await bucket().remove([path])
  if (error) throw new Error(`Supabase Storage: ${error.message}`)
}

/** Deletes the row first: if a post still uses the photo, the foreign key stops it before the file is gone. */
export async function deleteAsset(userId: string, id: string, locale: Locale = 'id'): Promise<void> {
  const t = createTranslator({ locale, messages: locale === 'en' ? en : idMessages })
  const result = await db().from('assets').delete().eq('id', id).eq('user_id', userId).select('storage_path')
  if (result.error?.code === FOREIGN_KEY_VIOLATION) throw new AssetInUseError(t('library.text8'))
  const rows: Pick<AssetRow, 'storage_path'>[] = unwrap(result)
  if (rows.length === 0) return

  const removal = await bucket().remove([rows[0].storage_path])
  if (removal.error) console.error('[aset] file tertinggal di Storage:', describeError(removal.error))
}
