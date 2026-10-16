import 'server-only'
import sharp, { type Sharp } from 'sharp'
import { IMAGE_FORMATS, type ImageFormat } from './image-options'

const JPEG_QUALITY = 90
/** Slides sent back to 9Router as references: small enough that slide 1, a brand reference and the logo fit 1 MB. */
const REFERENCE_WIDTH = 640
const REFERENCE_QUALITY = 80

/** The provider's bytes were not an image. */
export class SlideImageError extends Error {
  override name = 'SlideImageError'
}

export interface SlideImage {
  bytes: Uint8Array
  width: number
  height: number
}

async function encode(image: Sharp): Promise<Buffer> {
  try {
    return await image.toBuffer()
  } catch (error) {
    throw new SlideImageError(error instanceof Error ? error.message : 'Gambar tidak bisa dibaca')
  }
}

/**
 * The provider's image as an Instagram-ready JPEG of the format's exact size, whatever size and type it came in:
 * centre-cropped, white behind any transparency. This is the server's version of the browser's toInstagramJpeg.
 */
export async function toSlideJpeg(bytes: Uint8Array, format: ImageFormat): Promise<SlideImage> {
  const { width, height } = IMAGE_FORMATS[format]
  const data = await encode(
    sharp(bytes).rotate().resize(width, height, { fit: 'cover' }).flatten({ background: '#ffffff' }).jpeg({ quality: JPEG_QUALITY }),
  )
  return { bytes: new Uint8Array(data), width, height }
}

/** A small JPEG data URL of a stored slide, for 9Router to keep its look in another image. */
export async function toReferenceDataUrl(bytes: Uint8Array): Promise<string> {
  const data = await encode(
    sharp(bytes).resize({ width: REFERENCE_WIDTH, withoutEnlargement: true }).jpeg({ quality: REFERENCE_QUALITY }),
  )
  return `data:image/jpeg;base64,${data.toString('base64')}`
}
