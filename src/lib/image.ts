import { paletteOf } from './palette'
import { MAX_STORED_BYTES } from './storage-quota-options'

/** Meta's download limit. Stored images are compressed to the smaller storage target below. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024
export const TARGET_STORED_BYTES = MAX_STORED_BYTES - 128 * 1024
const MAX_WIDTH = 1440
const JPEG_QUALITY = 0.9
const MIN_JPEG_QUALITY = 0.6
const RESIZE_STEPS = 8
const RESIZE_FACTOR = 0.85

export interface StoredJpegAttempt {
  width: number
  height: number
  quality: number
}

/** A bounded quality-first encoding plan shared by browser canvas and server sharp pipelines. */
export function storedJpegAttempts(
  width: number,
  height: number,
  initialQuality: number,
  instagramRatio = false,
): StoredJpegAttempt[] {
  const attempts: StoredJpegAttempt[] = []
  for (const quality of [initialQuality, 0.8, 0.7, MIN_JPEG_QUALITY]) {
    if (!attempts.some((attempt) => attempt.quality === quality)) attempts.push({ width, height, quality })
  }

  let resizedWidth = width
  let resizedHeight = height
  for (let step = 0; step < RESIZE_STEPS; step += 1) {
    resizedWidth = Math.max(1, Math.floor(resizedWidth * RESIZE_FACTOR))
    const proportionalHeight = Math.max(1, Math.round((height * resizedWidth) / width))
    resizedHeight = instagramRatio
      ? Math.max(Math.ceil((resizedWidth * 100) / 191), Math.min(Math.floor((resizedWidth * 5) / 4), proportionalHeight))
      : proportionalHeight
    attempts.push({ width: resizedWidth, height: resizedHeight, quality: MIN_JPEG_QUALITY })
  }
  return attempts
}

export interface Fit {
  /** Source crop rectangle. */
  sx: number
  sy: number
  sw: number
  sh: number
  /** Output size. */
  width: number
  height: number
}

/** Centre-crops into the 4:5–1.91:1 range and caps the width. Integer math keeps the ratio inside the range. */
export function fitToInstagram(width: number, height: number): Fit {
  const sw = Math.min(width, Math.floor((height * 191) / 100))
  const sh = Math.min(height, Math.floor((width * 5) / 4))
  const outWidth = Math.min(sw, MAX_WIDTH)
  return {
    sx: Math.floor((width - sw) / 2),
    sy: Math.floor((height - sh) / 2),
    sw,
    sh,
    width: outWidth,
    height: Math.round((sh * outWidth) / sw),
  }
}

export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
}

export type ImageType = 'image/jpeg' | 'image/png' | 'image/webp'

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const ascii = (bytes: Uint8Array, start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end))

/** What the bytes really are, whatever the file name or Content-Type claims. Null for anything else. */
export function imageType(bytes: Uint8Array): ImageType | null {
  if (isJpeg(bytes)) return 'image/jpeg'
  if (bytes.length >= 8 && PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) return 'image/png'
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return 'image/webp'
  return null
}

export interface PreparedImage {
  blob: Blob
  width: number
  height: number
}

const PROCESSING_ERROR = 'Foto tidak bisa diproses. Coba foto lain.'

function canvasJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
}

async function compressCanvasJpeg(canvas: HTMLCanvasElement, initialQuality: number, instagramRatio = false): Promise<PreparedImage> {
  const original = document.createElement('canvas')
  original.width = canvas.width
  original.height = canvas.height
  const originalContext = original.getContext('2d')
  if (!originalContext) throw new Error(PROCESSING_ERROR)
  originalContext.drawImage(canvas, 0, 0)

  for (const attempt of storedJpegAttempts(original.width, original.height, initialQuality, instagramRatio)) {
    if (canvas.width !== attempt.width || canvas.height !== attempt.height) {
      canvas.width = attempt.width
      canvas.height = attempt.height
      const context = canvas.getContext('2d')
      if (!context) throw new Error(PROCESSING_ERROR)
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, attempt.width, attempt.height)
      context.drawImage(original, 0, 0, attempt.width, attempt.height)
    }
    const blob = await canvasJpeg(canvas, attempt.quality)
    if (!blob) throw new Error(PROCESSING_ERROR)
    if (blob.size <= TARGET_STORED_BYTES) return { blob, width: canvas.width, height: canvas.height }
  }
  throw new Error(PROCESSING_ERROR)
}

/** Browser only: decodes any image the browser can read and re-encodes it as an Instagram-ready JPEG. */
export async function toInstagramJpeg(file: File): Promise<PreparedImage> {
  // createImageBitmap applies the EXIF orientation, so phone photos come out upright.
  const bitmap = await createImageBitmap(file)
  const fit = fitToInstagram(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = fit.width
  canvas.height = fit.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas tidak tersedia di browser ini')
  // JPEG has no transparency; without a fill, transparent PNG areas turn black.
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, fit.width, fit.height)
  context.drawImage(bitmap, fit.sx, fit.sy, fit.sw, fit.sh, 0, 0, fit.width, fit.height)
  bitmap.close()

  return compressCanvasJpeg(canvas, JPEG_QUALITY, true)
}

/**
 * Instagram's own width. References travel to 9Router as data URLs under a 1 MB request limit
 * (see VISUAL_BODY_BUDGET), so smaller files let more of them into one analysis.
 */
const REFERENCE_MAX_EDGE = 1080
const REFERENCE_QUALITY = 0.85

export interface PreparedReference {
  blob: Blob
  palette: string[]
}

/** Browser only: a design reference as JPEG, uncropped and at most 1080 px on the long edge, with its palette. */
export async function toReferenceJpeg(file: File): Promise<PreparedReference> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, REFERENCE_MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas tidak tersedia di browser ini')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const palette = paletteOf(bitmap)
  bitmap.close()

  const { blob } = await compressCanvasJpeg(canvas, REFERENCE_QUALITY)
  return { blob, palette }
}
