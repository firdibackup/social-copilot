import 'server-only'
import sharp from 'sharp'
import { IMAGE_FORMATS } from './image-options'
import { chromaKey } from './magic-layers'
import { generateImage } from './nine-router'
import { MAX_STORED_BYTES } from './storage-quota-options'

/**
 * Elemen AI: one sticker-like object drawn by the image model on a green screen and keyed out, so the editor gets
 * a transparent PNG it can place as an image layer. One image request; no reference images.
 */

/** Alpha above which a pixel counts as part of the element when trimming. */
const VISIBLE_ALPHA = 16
/** A keyed image with less than this share of visible pixels has no usable element. */
const MIN_VISIBLE_SHARE = 0.01
const TRIM_PAD = 8
const SIDES = [1024, 768, 512]

export class NoElementError extends Error {
  override name = 'NoElementError'
}

/** In English, as image models follow it best; the description goes in quotes, in the owner's own words. */
export function elementPrompt(subject: string): string {
  return [
    `A single design element for a social media slide: "${subject}".`,
    'Draw only that one object as a clean sticker-style illustration, centred, fully inside the frame with a margin around it.',
    'Background: one flat pure green #00FF00 colour filling the whole image, with no gradient, shadow, floor, texture or pattern.',
    'The object itself contains no green; no text, letters, numbers, watermark, border or frame unless the description asks for them.',
  ].join('\n')
}

export interface PixelBounds { x: number; y: number; w: number; h: number }

/** The box around every visible pixel of raw RGBA, grown by `pad` inside the image; null when almost nothing is. */
export function visibleBounds(rgba: Uint8Array, width: number, height: number, pad = TRIM_PAD): PixelBounds | null {
  let left = width
  let top = height
  let right = -1
  let bottom = -1
  let visible = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3] <= VISIBLE_ALPHA) continue
      visible += 1
      if (x < left) left = x
      if (x > right) right = x
      if (y < top) top = y
      if (y > bottom) bottom = y
    }
  }
  if (visible < MIN_VISIBLE_SHARE * width * height) return null
  const x = Math.max(0, left - pad)
  const y = Math.max(0, top - pad)
  return { x, y, w: Math.min(width, right + 1 + pad) - x, h: Math.min(height, bottom + 1 + pad) - y }
}

export interface DrawnElement {
  png: Uint8Array
  width: number
  height: number
  /** The prompt and sizes, never image data. */
  log: { prompt: string; bytes: number; width: number; height: number }
}

/**
 * Draws `subject` and returns it cut out. Throws NoElementError when the model filled the frame instead of drawing
 * one object on green (nothing left after keying, or nothing keyed at all).
 */
export async function drawElement(subject: string, signal?: AbortSignal): Promise<DrawnElement> {
  const prompt = elementPrompt(subject)
  const b64 = await generateImage({ prompt, size: IMAGE_FORMATS['1:1'].size, images: [] }, undefined, signal)
  const { data, info } = await sharp(Buffer.from(b64, 'base64')).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const keyed = chromaKey(new Uint8Array(data), info.width, info.height)
  const bounds = visibleBounds(keyed, info.width, info.height)
  // Nothing left, or the whole frame left: the green screen was not drawn.
  if (!bounds || (bounds.w >= info.width && bounds.h >= info.height && !hasTransparency(keyed))) throw new NoElementError('Elemen tidak tergambar')
  const cut = sharp(Buffer.from(keyed), { raw: { width: info.width, height: info.height, channels: 4 } })
    .extract({ left: bounds.x, top: bounds.y, width: bounds.w, height: bounds.h })
  for (const side of SIDES) {
    const out = await cut.clone().resize({ width: side, height: side, fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true })
    if (out.data.length <= MAX_STORED_BYTES || side === SIDES.at(-1)) {
      return {
        png: new Uint8Array(out.data), width: out.info.width, height: out.info.height,
        log: { prompt, bytes: out.data.length, width: out.info.width, height: out.info.height },
      }
    }
  }
  throw new NoElementError('Elemen tidak tergambar')
}

function hasTransparency(rgba: Uint8Array): boolean {
  for (let index = 3; index < rgba.length; index += 4) if (rgba[index] <= VISIBLE_ALPHA) return true
  return false
}
