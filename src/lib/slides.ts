import 'server-only'
import { isImageFormat, type ImageFormat } from './image-options'
import { db, unwrap } from './supabase'

export type SlideStatus = 'pending' | 'generating' | 'ready' | 'failed'

/** An AI slide: the prompt of its image and, until that image exists, its place in the generation queue. */
export interface SlideRecord {
  id: string
  postId: string
  position: number
  headline: string
  scene: string
  format: ImageFormat
  referenceId: string | null
  includeLogo: boolean
  status: SlideStatus
  error: string | null
  /** A generating slide whose generator has evidently died: it can be taken again (see claim_slide). */
  stale: boolean
}

interface SlideRow {
  id: string
  post_id: string
  position: number
  headline: string
  scene: string
  format: string
  reference_id: string | null
  include_logo: boolean
  status: SlideStatus
  error: string | null
  claimed_at: string | null
}

const COLUMNS = 'id, post_id, position, headline, scene, format, reference_id, include_logo, status, error, claimed_at'
const STALE_MS = 5 * 60 * 1000

/** A refusal from the slide functions. The message is safe to show to the owner. */
export class SlideError extends Error {
  override name = 'SlideError'
}

const REFUSALS: Record<string, string> = {
  post_locked: 'Post ini sedang atau mungkin sudah diterbitkan, jadi isinya tidak bisa diubah.',
  post_full: 'Post sudah berisi 10 foto. Hapus satu dulu.',
  slide_not_claimed: 'Slide sedang dibuat di tab lain atau sudah selesai.',
  slide_not_found: 'Slide tidak ditemukan. Muat ulang halaman.',
  invalid_media: 'Foto tidak ditemukan.',
}

/** Turns the SQL functions' `raise exception` codes into SlideErrors; anything else stays a database error. */
function check(error: { message: string } | null): void {
  if (!error) return
  const refusal = REFUSALS[error.message]
  throw refusal ? new SlideError(refusal) : new Error(`Supabase: ${error.message}`)
}

function toSlide(row: SlideRow, now: number): SlideRecord {
  return {
    id: row.id,
    postId: row.post_id,
    position: row.position,
    headline: row.headline,
    scene: row.scene,
    format: isImageFormat(row.format) ? row.format : '4:5',
    referenceId: row.reference_id,
    includeLogo: row.include_logo,
    status: row.status,
    error: row.error,
    stale: row.status === 'generating' && row.claimed_at !== null && now - new Date(row.claimed_at).getTime() > STALE_MS,
  }
}

/** Slides of a post whose image isn't in it yet: waiting, being made, or failed. In carousel order. */
export async function listUnfinishedSlides(userId: string, postId: string, now = new Date()): Promise<SlideRecord[]> {
  const rows: SlideRow[] = unwrap(
    await db()
      .from('post_slides')
      .select(COLUMNS)
      .eq('user_id', userId)
      .eq('post_id', postId)
      .neq('status', 'ready')
      .order('position'),
  )
  return rows.map((row) => toSlide(row, now.getTime()))
}

/** True while an image of the post is still to come, when saving the post's photos would race attach_slide. */
export async function hasSlidesInProgress(userId: string, postId: string): Promise<boolean> {
  const { count, error } = await db()
    .from('post_slides')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('post_id', postId)
    .in('status', ['pending', 'generating'])
  if (error || count === null) throw new Error(`Supabase: ${error?.message || 'jumlah slide tidak terbaca'}`)
  return count > 0
}

/** The prompt one of the user's images came from, newest first. Null for photos the owner uploaded. */
export async function findSlideByAsset(userId: string, assetId: string): Promise<SlideRecord | null> {
  const rows: SlideRow[] = unwrap(
    await db()
      .from('post_slides')
      .select(COLUMNS)
      .eq('user_id', userId)
      .eq('asset_id', assetId)
      .order('created_at', { ascending: false })
      .limit(1),
  )
  return rows[0] ? toSlide(rows[0], Date.now()) : null
}

/** Takes the slide for this generator, or null when it is ready, gone, or being made elsewhere. */
export async function claimSlide(userId: string, slideId: string): Promise<SlideRecord | null> {
  const { data, error } = await db().rpc('claim_slide', { p_user_id: userId, p_id: slideId })
  check(error)
  const rows = (data ?? []) as SlideRow[]
  return rows[0] ? toSlide(rows[0], Date.now()) : null
}

/** The image is in the post. */
export async function attachSlide(slideId: string, assetId: string): Promise<void> {
  const { error } = await db().rpc('attach_slide', { p_slide_id: slideId, p_asset_id: assetId })
  check(error)
}

/** Back in the queue with the reason, for the owner to try again. Only a slide still being made. */
export async function failSlide(slideId: string, message: string): Promise<void> {
  unwrap(
    await db()
      .from('post_slides')
      .update({ status: 'failed', error: message, updated_at: new Date().toISOString() })
      .eq('id', slideId)
      .eq('status', 'generating'),
  )
}

/** Drops a waiting or failed slide. False when it is being made right now, or is already in the post. */
export async function deleteUnfinishedSlide(userId: string, slideId: string): Promise<boolean> {
  const rows: unknown[] = unwrap(
    await db()
      .from('post_slides')
      .delete()
      .eq('id', slideId)
      .eq('user_id', userId)
      .in('status', ['pending', 'failed'])
      .select('id'),
  )
  return rows.length === 1
}

export interface Replacement {
  postId: string
  oldAssetId: string
  newAssetId: string
  headline: string
  scene: string
  format: ImageFormat
  referenceId: string | null
  includeLogo: boolean
}

/** An edited slide's new image takes the old one's place, and keeps its prompt for the next edit. */
export async function replaceSlide(userId: string, replacement: Replacement): Promise<void> {
  const { error } = await db().rpc('replace_slide', {
    p_user_id: userId,
    p_post_id: replacement.postId,
    p_old_asset_id: replacement.oldAssetId,
    p_new_asset_id: replacement.newAssetId,
    p_headline: replacement.headline,
    p_scene: replacement.scene,
    p_format: replacement.format,
    p_reference_id: replacement.referenceId,
    p_include_logo: replacement.includeLogo,
  })
  check(error)
}
