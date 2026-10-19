import 'server-only'
import { runLogged } from './ai'
import { imageModel } from './app-settings'
import { createAsset, loadAssetBytes } from './assets'
import type { SlideRole } from './brand-options'
import { describeError } from './errors'
import { drawImage, imageErrorMessage, imageLog, type DrawnImage } from './image-ai'
import type { ImageFormat } from './image-options'
import { RouterApiError } from './nine-router'
import { getPost, type Post } from './posts'
import { toReferenceDataUrl, toSlideJpeg } from './slide-image'
import {
  attachSlide,
  failSlide,
  findInnerSlideAsset,
  listUnfinishedSlides,
  requeueSlide,
  SlideError,
  type ClaimedSlide,
} from './slides'

/** The worker takes a slide at most this many times before it fails for the owner to try again. */
export const MAX_SLIDE_ATTEMPTS = 3
/** Waits before the 2nd and 3rd try. */
const RETRY_DELAYS_MS = [30_000, 120_000]

/** The provider's image as an Instagram-ready JPEG in Aset. */
export async function storeSlideImage(
  userId: string,
  accountId: string | null,
  drawn: DrawnImage,
  format: ImageFormat,
): Promise<string> {
  const image = await toSlideJpeg(drawn.bytes, format)
  const asset = await createAsset(userId, new Blob([image.bytes.slice().buffer]), image.width, image.height, {
    accountId: accountId ?? undefined,
    origin: 'ai',
  })
  return asset.id
}

/**
 * For an inner slide, the post's first inner slide already made (other than `exceptAssetId`), small, so all inner
 * slides keep one look. Cover and CTA get none: they follow only their own reference, never another slide.
 */
export async function innerSiblingImage(
  userId: string,
  post: Post,
  role: SlideRole | null,
  exceptAssetId: string | null,
): Promise<string | null> {
  if (role !== 'isi') return null
  const assetIds = post.media.map((item) => item.assetId)
  const sibling = await findInnerSlideAsset(userId, post.id, assetIds, exceptAssetId)
  const bytes = sibling ? await loadAssetBytes(userId, sibling) : null
  return bytes ? toReferenceDataUrl(bytes) : null
}

/** 9Router unreachable or too slow, throttled, or failing on its side: worth another try. */
export function isTransientSlideError(error: unknown): boolean {
  return error instanceof RouterApiError && (error.status === 0 || error.status === 429 || error.status >= 500)
}

/**
 * Makes one claimed slide's image and puts it into the post. It was paid with the post, so it costs nothing.
 * A passing failure puts the slide back in the queue until MAX_SLIDE_ATTEMPTS; any other failure fails it with a
 * message for the owner.
 */
export async function processSlide({ userId, accountId, attemptCount, slide }: ClaimedSlide): Promise<void> {
  try {
    await runLogged(
      userId,
      'content_slide',
      { postId: slide.postId, position: slide.position, headline: slide.headline, scene: slide.scene },
      async () => {
        const [post, unfinished] = await Promise.all([getPost(userId, slide.postId), listUnfinishedSlides(userId, slide.postId)])
        if (!post) throw new SlideError('Post tidak ditemukan.')
        const count = post.media.length + unfinished.length
        const drawn = await drawImage(userId, {
          headline: slide.headline,
          scene: slide.scene,
          format: slide.format,
          referenceImageId: slide.referenceImageId,
          example: slide.example,
          productGroupId: slide.productGroupId,
          includeLogo: slide.includeLogo,
          // A slide with a reference or example follows that, never another AI slide (drawImage drops it too).
          siblingImage: slide.referenceImageId || slide.example ? null : await innerSiblingImage(userId, post, slide.role, null),
          currentImage: null,
          attachment: slide.attachmentPath ? { path: slide.attachmentPath, note: slide.attachmentNote } : null,
          slide: count > 1 ? { index: Math.min(slide.position + 1, count), count, role: slide.role } : null,
        })
        await attachSlide(slide.id, await storeSlideImage(userId, accountId, drawn, slide.format))
        return drawn
      },
      { model: await imageModel(), logOutput: imageLog },
    )
  } catch (error) {
    const message = error instanceof SlideError ? error.message : imageErrorMessage(error)
    if (!(error instanceof SlideError)) console.error('[slide] gagal dibuat:', describeError(error))
    try {
      if (isTransientSlideError(error) && attemptCount < MAX_SLIDE_ATTEMPTS) {
        await requeueSlide(slide.id, message, RETRY_DELAYS_MS[Math.min(attemptCount, RETRY_DELAYS_MS.length) - 1])
      } else {
        await failSlide(slide.id, message)
      }
    } catch (failure) {
      // The slide stays generating and is taken again after 5 minutes.
      console.error('[slide] status gagal disimpan:', describeError(failure))
    }
  }
}
