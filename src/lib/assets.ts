import 'server-only'
import { randomUUID } from 'node:crypto'
import { describeError } from './errors'
import { isJpeg, MAX_IMAGE_BYTES } from './image'
import { db, unwrap } from './supabase'

const MEDIA_BUCKET = 'media'
const VIEW_URL_TTL_SECONDS = 60 * 60
// ponytail: newest 100 only; add pagination once the library outgrows it.
const LIBRARY_LIMIT = 100
const FOREIGN_KEY_VIOLATION = '23503'

export interface Asset {
  id: string
  url: string
  width: number
  height: number
}

interface AssetRow {
  id: string
  storage_path: string
  width: number
  height: number
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

export async function listAssets(): Promise<Asset[]> {
  const rows: AssetRow[] = unwrap(
    await db()
      .from('assets')
      .select('id, storage_path, width, height')
      .order('created_at', { ascending: false })
      .limit(LIBRARY_LIMIT),
  )
  const urls = await signMediaUrls(rows.map((row) => row.storage_path))
  return rows.map((row, index) => ({ id: row.id, url: urls[index], width: row.width, height: row.height }))
}

/** Stores a JPEG prepared by the browser. */
export async function createAsset(file: Blob, width: number, height: number): Promise<Asset> {
  if (file.size === 0 || file.size > MAX_IMAGE_BYTES) throw new InvalidImageError('Ukuran foto harus di bawah 8 MB.')
  if (![width, height].every((side) => Number.isInteger(side) && side > 0)) {
    throw new InvalidImageError('Ukuran foto tidak valid.')
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!isJpeg(bytes)) throw new InvalidImageError('File bukan JPEG.')

  const path = `${randomUUID()}.jpg`
  const upload = await bucket().upload(path, bytes, { contentType: 'image/jpeg' })
  if (upload.error) throw new Error(`Supabase Storage: ${upload.error.message}`)

  const insert = await db()
    .from('assets')
    .insert({ storage_path: path, width, height, size_bytes: bytes.length })
    .select('id')
    .single<{ id: string }>()
  if (insert.error) {
    // No row points at the object, so remove it rather than leave an orphan.
    await bucket().remove([path])
    throw new Error(`Supabase: ${insert.error.message}`)
  }
  const [url] = await signMediaUrls([path])
  return { id: insert.data.id, url, width, height }
}

/** Deletes the row first: if a post still uses the photo, the foreign key stops it before the file is gone. */
export async function deleteAsset(id: string): Promise<void> {
  const result = await db().from('assets').delete().eq('id', id).select('storage_path')
  if (result.error?.code === FOREIGN_KEY_VIOLATION) throw new AssetInUseError('Foto ini masih dipakai di post.')
  const rows: Pick<AssetRow, 'storage_path'>[] = unwrap(result)
  if (rows.length === 0) return

  const removal = await bucket().remove([rows[0].storage_path])
  if (removal.error) console.error('[aset] file tertinggal di Storage:', describeError(removal.error))
}
