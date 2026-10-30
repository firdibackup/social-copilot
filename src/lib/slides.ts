import 'server-only'
import type { SlideRole } from './brand-options'
import { isImageFormat, type ImageFormat } from './image-options'
import { db, unwrap } from './supabase'

export type SlideStatus = 'pending' | 'generating' | 'ready' | 'failed' | 'cancelled'

/** An AI slide: the prompt of its image and, until that image exists, its place in the generation queue. */
export interface SlideRecord {
  id: string
  postId: string
  position: number
  headline: string
  scene: string
  format: ImageFormat
  /** What the plan made it; null for a one-image post. */
  role: SlideRole | null
  /** The reference image it follows (see planReferenceImages). */
  referenceImageId: string | null
  /** The design template it follows when the account had no references (see planTemplates; ImageInput.example). */
  example: string | null
  /** The product group the planner chose; retries and edits preserve it. */
  productGroupId: string | null
  includeLogo: boolean
  /** The owner's image this slide uses and what it does with it; null when it uses none. */
  attachmentPath: string | null
  attachmentNote: string
  status: SlideStatus
  error: string | null
}

interface SlideRow {
  lease?: string | null
  id: string
  post_id: string
  position: number
  headline: string
  scene: string
  format: string
  role: SlideRole | null
  reference_image_id: string | null
  example: string | null
  product_group_id: string | null
  include_logo: boolean
  attachment_path: string | null
  attachment_note: string
  status: SlideStatus
  error: string | null
  claimed_at: string | null
}

const COLUMNS =
  'id, post_id, position, headline, scene, format, role, reference_image_id, example, product_group_id, include_logo, attachment_path, attachment_note, status, error, claimed_at'

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

function toSlide(row: SlideRow): SlideRecord {
  return {
    id: row.id,
    postId: row.post_id,
    position: row.position,
    headline: row.headline,
    scene: row.scene,
    format: isImageFormat(row.format) ? row.format : '4:5',
    role: row.role,
    referenceImageId: row.reference_image_id,
    example: row.example,
    productGroupId: row.product_group_id,
    includeLogo: row.include_logo,
    attachmentPath: row.attachment_path,
    attachmentNote: row.attachment_note,
    status: row.status,
    error: row.error,
  }
}

/** Slides of a post whose image isn't in it yet: waiting, being made, or failed. In carousel order. */
export async function listUnfinishedSlides(userId: string, postId: string): Promise<SlideRecord[]> {
  const rows: SlideRow[] = unwrap(
    await db()
      .from('post_slides')
      .select(COLUMNS)
      .eq('user_id', userId)
      .eq('post_id', postId)
      .neq('status', 'ready')
      .order('position'),
  )
  return rows.map(toSlide)
}

/** The Brand reference group persisted on this post's slides; null for admin-template or reference-free posts. */
export async function getPostReferenceId(userId: string, postId: string): Promise<string | null> {
  const slides = unwrap(await db().from('post_slides').select('reference_image_id').eq('user_id', userId)
    .eq('post_id', postId).order('position')) as { reference_image_id: string | null }[]
  const referenceImageId = slides.find((slide) => slide.reference_image_id)?.reference_image_id
  if (!referenceImageId) return null
  const image = unwrap(await db().from('brand_reference_images').select('reference_id').eq('id', referenceImageId)
    .eq('user_id', userId).maybeSingle()) as { reference_id: string } | null
  return image?.reference_id ?? null
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
  return rows[0] ? toSlide(rows[0]) : null
}

/**
 * The first of the post's photos (`assetIds`, in carousel order) that is an inner AI slide, leaving out
 * `exceptAssetId`: what the other inner slides keep their look from. Null when none is made yet. Never a cover
 * or CTA, so those never lend their layout to an inner slide.
 */
export async function findInnerSlideAsset(
  userId: string,
  postId: string,
  assetIds: string[],
  exceptAssetId: string | null = null,
): Promise<string | null> {
  const ids = assetIds.filter((id) => id !== exceptAssetId)
  if (ids.length === 0) return null
  const rows: { asset_id: string }[] = unwrap(
    await db()
      .from('post_slides')
      .select('asset_id')
      .eq('user_id', userId)
      .eq('post_id', postId)
      .eq('role', 'isi')
      .eq('status', 'ready')
      .in('asset_id', ids),
  )
  const inner = new Set(rows.map((row) => row.asset_id))
  return ids.find((id) => inner.has(id)) ?? null
}

/** A slide the worker took: whose it is, its post's Instagram account, and how many times the worker has taken it. */
export interface ClaimedSlide {
  lease: string
  userId: string
  /** The account the post belongs to, so the image lands in that account's Aset; null for an old post without one. */
  accountId: string | null
  attemptCount: number
  slide: SlideRecord
}

/** The worker's next slide due (see claim_next_slide), or null when none is. */
export async function claimNextSlide(): Promise<ClaimedSlide | null> {
  const { data, error } = await db().rpc('claim_next_slide')
  check(error)
  const row = ((data ?? []) as (SlideRow & { user_id: string; attempt_count: number })[])[0]
  if (!row) return null
  if (!row.lease) throw new Error('Slide lease missing. Apply the cancellation migration and restart the worker.')
  const post: { account_id: string | null } | null = unwrap(
    await db().from('posts').select('account_id').eq('id', row.post_id).maybeSingle(),
  )
  return {
    lease: row.lease,
    userId: row.user_id,
    accountId: post?.account_id ?? null,
    attemptCount: row.attempt_count,
    slide: toSlide(row),
  }
}

/** Back in the queue after `delayMs`, for a failure that may pass. Only a slide still being made. */
export async function requeueSlide(slideId: string, message: string, delayMs: number, lease: string): Promise<void> {
  unwrap(await db().from('post_slides').update({ status: 'pending', lease: null, error: message,
    next_attempt_at: new Date(Date.now() + delayMs).toISOString(), updated_at: new Date().toISOString() })
    .eq('id', slideId).eq('lease', lease).eq('status', 'generating'))
}

/** The owner's Coba lagi: a failed slide waits for the worker again. False when it isn't failed (anymore). */
export async function retrySlide(userId: string, slideId: string): Promise<boolean> {
  const { data, error } = await db().rpc('retry_slide', { p_user_id: userId, p_id: slideId })
  check(error)
  return data === true
}

/** The image is in the post. */
export async function attachSlide(slideId: string, assetId: string, lease: string): Promise<void> {
  const { error } = await db().rpc('attach_claimed_slide', { p_slide_id: slideId, p_asset_id: assetId, p_lease: lease })
  check(error)
}

/** Failed with the reason, for the owner to try again. Only a slide still being made. */
export async function failSlide(slideId: string, message: string, lease: string): Promise<void> {
  unwrap(
    await db()
      .from('post_slides')
      .update({ status: 'failed', lease: null, error: message, updated_at: new Date().toISOString() })
      .eq('id', slideId)
      .eq('lease', lease)
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
      .in('status', ['pending', 'failed', 'cancelled'])
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
  role: SlideRole | null
  referenceImageId: string | null
  productGroupId: string | null
  includeLogo: boolean
  example: string | null
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
    p_role: replacement.role,
    p_reference_image_id: replacement.referenceImageId,
    p_product_group_id: replacement.productGroupId,
    p_include_logo: replacement.includeLogo,
    p_example: replacement.example,
  })
  check(error)
}
