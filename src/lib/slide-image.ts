import 'server-only'
import sharp, { type Sharp } from 'sharp'
import { fitToInstagram, MAX_IMAGE_BYTES } from './image'
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

/**
 * The provider's image as an Instagram-ready JPEG of the format's exact size, whatever size and type it came in:
 * centre-cropped, white behind any transparency. This is the server's version of the browser's toInstagramJpeg.
 */
export async function toSlideJpeg(bytes: Uint8Array, format: ImageFormat): Promise<SlideImage> {
  const { width, height } = IMAGE_FORMATS[format]
  const data = await encode(() =>
    sharp(bytes).rotate().resize(width, height, { fit: 'cover' }).flatten({ background: '#ffffff' }).jpeg({ quality: JPEG_QUALITY }),
  )
  return { bytes: new Uint8Array(data), width, height }
}

export async function toWebsiteJpeg(bytes: Uint8Array): Promise<SlideImage> {
  try {
    const source = sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS })
    const metadata = await source.metadata()
    const width = metadata.autoOrient.width
    const height = metadata.autoOrient.height
    if (width < WEBSITE_MIN_EDGE || height < WEBSITE_MIN_EDGE) throw new SlideImageError('Gambar terlalu kecil.')
    const fit = fitToInstagram(width, height)
    const data = await source
      .autoOrient()
      .extract({ left: fit.sx, top: fit.sy, width: fit.sw, height: fit.sh })
      .resize(fit.width, fit.height)
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: WEBSITE_QUALITY })
      .toBuffer()
    if (data.length > MAX_IMAGE_BYTES) throw new SlideImageError('Gambar hasil konversi melebihi 8 MB.')
    return { bytes: new Uint8Array(data), width: fit.width, height: fit.height }
  } catch (error) {
    if (error instanceof SlideImageError) throw error
    throw new SlideImageError(error instanceof Error ? error.message : 'Gambar tidak bisa dibaca')
  }
}

/** A small JPEG data URL of a stored slide, for 9Router to keep its look in another image. */
export async function toReferenceDataUrl(bytes: Uint8Array): Promise<string> {
  const data = await encode(() =>
    sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS }).resize({ width: REFERENCE_WIDTH, withoutEnlargement: true }).jpeg({ quality: REFERENCE_QUALITY }),
  )
  return `data:image/jpeg;base64,${data.toString('base64')}`
}
