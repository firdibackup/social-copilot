import 'server-only'
import sharp, { type Sharp } from 'sharp'
import { fitToInstagram, storedJpegAttempts, TARGET_STORED_BYTES, type StoredJpegAttempt } from './image'
import { IMAGE_FORMATS, type ImageFormat } from './image-options'

const JPEG_QUALITY = 90
/** Slides sent back to 9Router as references: small enough that another slide, a brand reference and the logo fit 1 MB. */
const REFERENCE_WIDTH = 640
const REFERENCE_QUALITY = 80
const WEBSITE_QUALITY = 85
/** Above any photo the app takes; a small file declaring huge dimensions would otherwise be decoded in full. */
const MAX_INPUT_PIXELS = 40_000_000
const WEBSITE_MIN_EDGE = 240

/** The provider's bytes were not an image. */
export class SlideImageError extends Error {
  override name = 'SlideImageError'
}

export interface SlideImage {
  bytes: Uint8Array
  width: number
  height: number
}

/** `build` runs inside the try: sharp throws synchronously for empty bytes, e.g. from base64 that decodes to nothing. */
async function encode(build: () => Sharp): Promise<Buffer> {
  try {
    return await build().toBuffer()
  } catch (error) {
    throw new SlideImageError(error instanceof Error ? error.message : 'Gambar tidak bisa dibaca')
  }
}

const PROCESSING_ERROR = 'Foto tidak bisa diproses. Coba foto lain.'

async function encodeStoredJpeg(
  attempts: StoredJpegAttempt[],
  build: (attempt: StoredJpegAttempt) => Sharp,
): Promise<{ data: Buffer; attempt: StoredJpegAttempt }> {
  for (const attempt of attempts) {
    const data = await encode(() => build(attempt))
    if (data.length <= TARGET_STORED_BYTES) return { data, attempt }
  }
  throw new SlideImageError(PROCESSING_ERROR)
}

/**
 * The provider's image as an Instagram-ready JPEG of the format's exact size, whatever size and type it came in:
 * centre-cropped, white behind any transparency. This is the server's version of the browser's toInstagramJpeg.
 */
export async function toSlideJpeg(bytes: Uint8Array, format: ImageFormat): Promise<SlideImage> {
  const { width, height } = IMAGE_FORMATS[format]
  const { data, attempt } = await encodeStoredJpeg(storedJpegAttempts(width, height, JPEG_QUALITY / 100, true), ({ width, height, quality }) =>
    sharp(bytes).rotate().resize(width, height, { fit: 'cover' }).flatten({ background: '#ffffff' }).jpeg({ quality: Math.round(quality * 100) }),
  )
  return { bytes: new Uint8Array(data), width: attempt.width, height: attempt.height }
}

export async function toWebsiteJpeg(bytes: Uint8Array): Promise<SlideImage> {
  try {
    const source = sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS })
    const metadata = await source.metadata()
    const width = metadata.autoOrient.width
    const height = metadata.autoOrient.height
    if (width < WEBSITE_MIN_EDGE || height < WEBSITE_MIN_EDGE) throw new SlideImageError('Gambar terlalu kecil.')
    const fit = fitToInstagram(width, height)
    const { data, attempt } = await encodeStoredJpeg(
      storedJpegAttempts(fit.width, fit.height, WEBSITE_QUALITY / 100, true),
      ({ width, height, quality }) =>
        sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS })
          .autoOrient()
          .extract({ left: fit.sx, top: fit.sy, width: fit.sw, height: fit.sh })
          .resize(width, height)
          .flatten({ background: '#ffffff' })
          .jpeg({ quality: Math.round(quality * 100) }),
    )
    return { bytes: new Uint8Array(data), width: attempt.width, height: attempt.height }
  } catch (error) {
    if (error instanceof SlideImageError) throw error
    throw new SlideImageError(error instanceof Error ? error.message : 'Gambar tidak bisa dibaca')
  }
}

/** A small JPEG data URL of a stored slide, for 9Router to keep its look in another image. */
export async function toReferenceDataUrl(bytes: Uint8Array): Promise<string> {
  try {
    const metadata = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS }).metadata()
    const sourceWidth = metadata.autoOrient.width
    const sourceHeight = metadata.autoOrient.height
    const width = Math.min(sourceWidth, REFERENCE_WIDTH)
    const height = Math.max(1, Math.round((sourceHeight * width) / sourceWidth))
    const { data } = await encodeStoredJpeg(
      storedJpegAttempts(width, height, REFERENCE_QUALITY / 100),
      ({ width, height, quality }) =>
        sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS }).autoOrient().resize(width, height).jpeg({ quality: Math.round(quality * 100) }),
    )
    return `data:image/jpeg;base64,${data.toString('base64')}`
  } catch (error) {
    if (error instanceof SlideImageError) throw error
    throw new SlideImageError(error instanceof Error ? error.message : 'Gambar tidak bisa dibaca')
  }
}
