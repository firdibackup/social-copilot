import 'server-only'
import { randomUUID } from 'node:crypto'
import { SlideImageError, toReferenceDataUrl } from './slide-image'
import { db } from './supabase'

/**
 * The image the owner attaches to a request in the Buat composer. It lives in the brand bucket, beside the other
 * reference material, because it is often another account's design.
 */
const BUCKET = 'brand'
const JPEG_PREFIX = 'data:image/jpeg;base64,'
/** The composer sends a JPEG of at most 1080 px; anything near this size is not what it sends. */
export const ATTACHMENT_MAX_LENGTH = 4_000_000
const DATA_URL = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/
const PATH = /^([0-9a-f-]{36})\/lampiran\/[0-9a-f-]{36}\.jpg$/

export interface Attachment {
  /** A 640 px JPEG, the size every input image goes to 9Router at. */
  dataUrl: string
  bytes: Uint8Array
}

const bucket = () => db().storage.from(BUCKET)
const NOT_AN_IMAGE = { error: 'Lampiran harus berupa gambar.' }

/** What the composer sent, re-encoded small, which also proves it is an image. Null when nothing was attached. */
export async function readAttachment(value: unknown): Promise<Attachment | { error: string } | null> {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string') return NOT_AN_IMAGE
  if (value.length > ATTACHMENT_MAX_LENGTH) return { error: 'Gambar lampiran terlalu besar.' }
  const base64 = DATA_URL.exec(value)?.[1]
  if (!base64) return NOT_AN_IMAGE
  try {
    const dataUrl = await toReferenceDataUrl(Buffer.from(base64, 'base64'))
    return { dataUrl, bytes: Buffer.from(dataUrl.slice(JPEG_PREFIX.length), 'base64') }
  } catch (error) {
    if (error instanceof SlideImageError) return { error: 'Gambar lampiran tidak bisa dibaca.' }
    throw error
  }
}

/** Kept for the slides of a new post, which are made later, one request each. */
export async function saveAttachment(userId: string, attachment: Attachment): Promise<string> {
  const path = `${userId}/lampiran/${randomUUID()}.jpg`
  const { error } = await bucket().upload(path, attachment.bytes, { contentType: 'image/jpeg' })
  if (error) throw new Error(`Supabase Storage: ${error.message}`)
  return path
}

/** A stored attachment as a data URL. Null for any path that isn't one of the user's own attachments. */
export async function loadAttachment(userId: string, path: string): Promise<string | null> {
  if (PATH.exec(path)?.[1] !== userId) return null
  const { data, error } = await bucket().download(path)
  if (error) throw new Error(`Supabase Storage: ${error.message}`)
  return `${JPEG_PREFIX}${Buffer.from(await data.arrayBuffer()).toString('base64')}`
}

export async function removeAttachment(path: string): Promise<void> {
  const { error } = await bucket().remove([path])
  if (error) throw new Error(`Supabase Storage: ${error.message}`)
}
