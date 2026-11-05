/**
 * Lapisan Ajaib (PRD §7.2–7.3): a flat slide split into a clean background, editable text blocks and, in beta, the
 * main subject as a transparent PNG. The AI only ever repaints masked areas: everything else is the original's pixels.
 */
import 'server-only'
import sharp from 'sharp'
import { AiOutputError, readJson, snippetOf } from './ai'
import type { FontName } from './design-styles'
import { TARGET_STORED_BYTES } from './image'
import { IMAGE_FORMATS } from './image-options'
import { LAYER_LIMITS, type Layer, type LayerDoc, type TextAlign } from './layer-doc'
import { chatCompletion, generateImage } from './nine-router'
import { SlideImageError, toReferenceDataUrl } from './slide-image'

/** One paragraph of text the vision model read, in px of the image. */
export interface TextBlock {
  text: string
  x: number
  y: number
  w: number
  h: number
  color: string
  /** Font size in px. */
  size: number
  weight: 400 | 700
  align: TextAlign
}

export interface PixelBox { x: number; y: number; w: number; h: number }

/** The vision model found no text: nothing was removed, and the caller refunds. */
export class NoTextError extends Error {
  override name = 'NoTextError'
}

export interface SplitResult {
  /** The clean background: a JPEG of exactly width × height. */
  background: Uint8Array
  blocks: TextBlock[]
  /** The person/object cut out as a PNG with transparency, and where it sits; null when not asked or not found. */
  object: ({ png: Uint8Array } & PixelBox) | null
  /** What the generation log keeps: prompts and sizes, never image data. */
  log: Record<string, unknown>
}

const MAX_BLOCKS = 30
const HEX = /^#[0-9a-fA-F]{6}$/
const ALIGNS: ReadonlySet<string> = new Set(['left', 'center', 'right'])
const TEXT_PAD = 0.02
const TEXT_FEATHER = 8
const SUBJECT_PAD = 0.02
const SUBJECT_FEATHER = 12
/** Room around the subject's box in the cut-out, so hair and hands the box missed aren't clipped. */
const CROP_PAD = 0.05
const JPEG_QUALITIES = [92, 85, 78, 70, 60]
/** Colour distance to #00FF00 below which a pixel is background, and the ramp to fully opaque after it. */
export const CHROMA = { threshold: 70, softness: 60 }

export const DETECT_PROMPT = [
  'Find every piece of visible text in this image: titles, body text, captions, small print, numbers, prices, social media handles, URLs and labels.',
  'Copy each text exactly as it is written in the image: same spelling, capitalisation, punctuation and emoji. Do not translate, correct or summarise.',
  'Give one block per line of text, in reading order.',
  'x, y = the top-left corner of the line\'s tight bounding box and w, h = its width and height, as fractions 0–1 (x and w of the image width, y and h of the image height).',
  'size = the font size (about the height of one line) as a fraction 0–1 of the image width. color = the main text colour as #RRGGBB. weight = 700 for bold, 400 for regular. align = left, center or right: how the line sits in its text column.',
  'Answer ONLY with strict JSON, no other text, in this shape: {"blocks":[{"text":"…","x":0.08,"y":0.10,"w":0.84,"h":0.12,"color":"#FFFFFF","size":0.06,"weight":700,"align":"left"}]}',
  'If the image has no text at all, answer {"blocks":[]}.',
].join('\n')

export const REMOVE_TEXT_PROMPT =
  'Remove all text, letters, numbers and captions from this image. Fill the areas naturally to match the surrounding background. Do not change anything else: same people, objects, colours, lighting, composition and framing.'

export const SUBJECT_PROMPT = [
  'Find the main subject of this image: the main person or product.',
  'Answer ONLY with strict JSON, no other text: {"subject":{"x":0.2,"y":0.3,"w":0.5,"h":0.6}}, the tight bounding box of the subject including hair, hands and anything it holds, as fractions 0–1 (x and w of the image width, y and h of the image height).',
  'If there is no clear main person or product, answer {"subject":null}.',
].join('\n')

export const GREEN_SCREEN_PROMPT =
  'Keep only the main subject (the person/product) exactly as it is, same pose, size and position. Replace everything else with a flat pure green #00FF00 background.'

export const REMOVE_SUBJECT_PROMPT =
  'Remove the main subject (person/product) completely and fill the area naturally to match the surrounding background. Keep everything else unchanged: same colours, lighting, composition and framing. No text.'

type Json = Record<string, unknown>
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value)
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const num = (value: unknown) => (typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN)
const capText = (text: string) => Array.from(text).slice(0, LAYER_LIMITS.text).join('').trimEnd()

/** A box of fractions from the model in px, clamped into the image; null when invalid or empty. */
function fractionBox(item: Json, width: number, height: number): PixelBox | null {
  const [x, y, w, h] = [item.x, item.y, item.w, item.h].map(num)
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null
  const left = clamp(x, 0, 1)
  const top = clamp(y, 0, 1)
  const right = clamp(x + w, 0, 1)
  const bottom = clamp(y + h, 0, 1)
  if (right <= left || bottom <= top) return null
  // Rounded to 0.01 px so fractions like 0.2 + 0.1 don't leave float dust.
  const px = (value: number) => Math.round(value * 100) / 100
  return { x: px(left * width), y: px(top * height), w: px((right - left) * width), h: px((bottom - top) * height) }
}

/** The vision answer's blocks in px: invalid ones dropped, the rest clamped to the image and the layer limits. */
export function parseBlocks(json: unknown, width: number, height: number): TextBlock[] {
  const items = isObject(json) && Array.isArray(json.blocks) ? json.blocks : []
  return items
    .flatMap((item): TextBlock[] => {
      if (!isObject(item) || typeof item.text !== 'string') return []
      const text = capText(item.text.trim())
      const box = fractionBox(item, width, height)
      const size = num(item.size) * width
      if (!text || !box || !Number.isFinite(size) || size <= 0) return []
      const color = typeof item.color === 'string' && HEX.test(item.color.trim()) ? item.color.trim().toUpperCase() : '#FFFFFF'
      const weight = num(item.weight) >= 600 || item.weight === 'bold' ? 700 : 400
      const align = typeof item.align === 'string' && ALIGNS.has(item.align) ? (item.align as TextAlign) : 'left'
      return [{ text, ...box, color, size: clamp(size, LAYER_LIMITS.size.min, LAYER_LIMITS.size.max), weight, align }]
    })
    .slice(0, MAX_BLOCKS)
}

/** Whether `line` continues `paragraph`: same look, overlapping columns, and close below it. */
const continues = (paragraph: TextBlock, line: TextBlock) =>
  paragraph.align === line.align
  && paragraph.weight === line.weight
  && paragraph.color === line.color
  && Math.abs(paragraph.size - line.size) <= 0.15 * Math.max(paragraph.size, line.size)
  && Math.min(paragraph.x + paragraph.w, line.x + line.w) > Math.max(paragraph.x, line.x)
  && line.y >= paragraph.y + paragraph.h - 0.2 * Math.min(paragraph.size, line.size)
  && line.y - (paragraph.y + paragraph.h) < 0.8 * Math.max(paragraph.size, line.size)

/** Lines of one paragraph joined with '\n' into one block whose box is their union. */
export function mergeBlocks(blocks: TextBlock[]): TextBlock[] {
  const paragraphs: TextBlock[] = []
  for (const line of [...blocks].sort((a, b) => a.y - b.y)) {
    const index = paragraphs.findIndex((paragraph) => continues(paragraph, line))
    if (index < 0) {
      paragraphs.push({ ...line })
      continue
    }
    const paragraph = paragraphs[index]
    if (Array.from(`${paragraph.text}\n${line.text}`).length > LAYER_LIMITS.text) {
      paragraphs.push({ ...line })
      continue
    }
    const x = Math.min(paragraph.x, line.x)
    const y = Math.min(paragraph.y, line.y)
    paragraphs[index] = {
      ...paragraph,
      text: capText(`${paragraph.text}\n${line.text}`),
      x,
      y,
      w: Math.max(paragraph.x + paragraph.w, line.x + line.w) - x,
      h: Math.max(paragraph.y + paragraph.h, line.y + line.h) - y,
    }
  }
  return paragraphs
}

/**
 * A greyscale mask (one byte per pixel): 255 inside the boxes grown by `padRatio` × the longer side, fading to 0
 * over `feather` px. Anything farther than pad + feather from every box is exactly 0.
 */
export function textMask(width: number, height: number, boxes: PixelBox[], padRatio = TEXT_PAD, feather = TEXT_FEATHER): Uint8Array {
  const mask = new Uint8Array(width * height)
  const pad = padRatio * Math.max(width, height)
  for (const box of boxes) {
    const x0 = box.x - pad
    const y0 = box.y - pad
    const x1 = box.x + box.w + pad
    const y1 = box.y + box.h + pad
    const top = Math.max(0, Math.floor(y0 - feather))
    const bottom = Math.min(height, Math.ceil(y1 + feather))
    const left = Math.max(0, Math.floor(x0 - feather))
    const right = Math.min(width, Math.ceil(x1 + feather))
    for (let y = top; y < bottom; y++) {
      const dy = Math.max(y0 - (y + 0.5), 0, y + 0.5 - y1)
      for (let x = left; x < right; x++) {
        const distance = Math.hypot(Math.max(x0 - (x + 0.5), 0, x + 0.5 - x1), dy)
        let alpha = 0
        if (distance === 0) alpha = 255
        else if (distance < feather) {
          const t = 1 - distance / feather
          alpha = Math.round(255 * t * t * (3 - 2 * t))
        }
        const index = y * width + x
        if (alpha > mask[index]) mask[index] = alpha
      }
    }
  }
  return mask
}

/** `original` with `edited` blended in where the mask is set; where it is 0 the original's bytes are copied as they are. */
export function compositeRaw(original: Uint8Array, edited: Uint8Array, mask: Uint8Array, channels = 3): Uint8Array {
  const out = new Uint8Array(original)
  for (let pixel = 0; pixel < mask.length; pixel++) {
    const alpha = mask[pixel]
    if (alpha === 0) continue
    for (let channel = 0; channel < channels; channel++) {
      const index = pixel * channels + channel
      out[index] = alpha === 255 ? edited[index] : Math.round((original[index] * (255 - alpha) + edited[index] * alpha) / 255)
    }
  }
  return out
}

/** Any image as raw sRGB of exactly width × height: centre-cropped like toSlideJpeg, white behind transparency. */
async function rawRgb(bytes: Uint8Array, width: number, height: number): Promise<Buffer> {
  try {
    return await sharp(bytes)
      .autoOrient()
      .resize(width, height, { fit: 'cover' })
      .flatten({ background: '#ffffff' })
      .toColourspace('srgb')
      .removeAlpha()
      .raw()
      .toBuffer()
  } catch (error) {
    throw new SlideImageError(error instanceof Error ? error.message : 'Gambar tidak bisa dibaca')
  }
}

/** A stored-size JPEG of exactly width × height: only the quality drops when it is too large. */
async function encodeJpeg(raw: Uint8Array, width: number, height: number): Promise<Uint8Array> {
  for (const quality of JPEG_QUALITIES) {
    const data = await sharp(raw, { raw: { width, height, channels: 3 } }).jpeg({ quality }).toBuffer()
    if (data.length <= TARGET_STORED_BYTES) return new Uint8Array(data)
  }
  throw new SlideImageError('Foto tidak bisa diproses. Coba foto lain.')
}

/** The original with the edited image (any size, normalised to width × height) only where the mask is set, as JPEG. */
export async function compositeMasked(original: Uint8Array, edited: Uint8Array, width: number, height: number, mask: Uint8Array): Promise<Uint8Array> {
  const [base, fill] = await Promise.all([rawRgb(original, width, height), rawRgb(edited, width, height)])
  return encodeJpeg(compositeRaw(base, fill, mask), width, height)
}

/**
 * Raw RGB or RGBA to RGBA with the #00FF00 background keyed out: transparent within `threshold` of pure green,
 * ramping to opaque over `softness`. A pixel where green doesn't dominate is never keyed. Edge pixels lose their
 * green spill: green is cut to max(red, blue).
 */
export function chromaKey(raw: Uint8Array, width: number, height: number, { threshold, softness } = CHROMA): Uint8Array {
  const pixels = width * height
  const channels = raw.length / pixels
  if (channels !== 3 && channels !== 4) throw new Error('chromaKey: expected raw RGB or RGBA')
  const out = new Uint8Array(pixels * 4)
  for (let pixel = 0; pixel < pixels; pixel++) {
    const r = raw[pixel * channels]
    const g = raw[pixel * channels + 1]
    const b = raw[pixel * channels + 2]
    const source = channels === 4 ? raw[pixel * 4 + 3] : 255
    const keep = g <= Math.max(r, b) ? 1 : clamp((Math.hypot(r, 255 - g, b) - threshold) / Math.max(1, softness), 0, 1)
    out.set([r, g, b, Math.round(keep * source)], pixel * 4)
  }
  const alphaAt = (x: number, y: number) => (x < 0 || y < 0 || x >= width || y >= height ? 255 : out[(y * width + x) * 4 + 3])
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4
      const alpha = out[index + 3]
      const most = Math.max(out[index], out[index + 2])
      if (alpha === 0 || out[index + 1] <= most) continue
      const edge = alpha < 255 || alphaAt(x - 1, y) < 255 || alphaAt(x + 1, y) < 255 || alphaAt(x, y - 1) < 255 || alphaAt(x, y + 1) < 255
      if (edge) out[index + 1] = most
    }
  }
  return out
}

/** The vision answer's subject box in px, or null when there is none or it is too small to cut out. */
export function parseSubject(json: unknown, width: number, height: number): PixelBox | null {
  const subject = isObject(json) ? json.subject : null
  const box = isObject(subject) ? fractionBox(subject, width, height) : null
  return box && box.w * box.h >= 0.01 * width * height ? box : null
}

/** The 9Router size closest to the slide's shape. */
export const imageSize = (width: number, height: number) =>
  Math.abs(height / width - 1.25) < 0.1 ? IMAGE_FORMATS['4:5'].size : IMAGE_FORMATS['1:1'].size

/** `box` grown by `ratio` × the longer side, in whole px inside the image. */
function grownBox(box: PixelBox, ratio: number, width: number, height: number) {
  const pad = ratio * Math.max(width, height)
  const left = Math.max(0, Math.floor(box.x - pad))
  const top = Math.max(0, Math.floor(box.y - pad))
  const right = Math.min(width, Math.ceil(box.x + box.w + pad))
  const bottom = Math.min(height, Math.ceil(box.y + box.h + pad))
  return { left, top, width: right - left, height: bottom - top }
}

/** One vision question about an image; the answer must be JSON with `key`. */
async function ask(prompt: string, image: string, key: string, signal?: AbortSignal): Promise<Json> {
  const answer = await chatCompletion(
    [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: image } }] }],
    undefined,
    signal,
  )
  const json = readJson(answer)
  if (!json || !(key in json) || (key === 'blocks' && !Array.isArray(json.blocks))) throw new AiOutputError(snippetOf(answer))
  return json
}

async function edit(prompt: string, image: string, size: string, signal?: AbortSignal): Promise<Buffer> {
  return Buffer.from(await generateImage({ prompt, size, images: [image] }, undefined, signal), 'base64')
}

/**
 * Reads the slide's text, removes it, and (with `splitObject`) cuts the main subject out and removes it from the
 * background too. Throws NoTextError before any image is generated when there is no text.
 */
export async function splitSlide(
  input: { bytes: Uint8Array; width: number; height: number; splitObject: boolean },
  signal?: AbortSignal,
): Promise<SplitResult> {
  const { bytes, width, height, splitObject } = input
  const size = imageSize(width, height)
  const reference = await toReferenceDataUrl(bytes)
  const blocks = mergeBlocks(parseBlocks(await ask(DETECT_PROMPT, reference, 'blocks', signal), width, height))
  if (blocks.length === 0) throw new NoTextError('Tidak ada teks di gambar ini')
  signal?.throwIfAborted()

  const original = await rawRgb(bytes, width, height)
  const cleaned = await rawRgb(await edit(REMOVE_TEXT_PROMPT, reference, size, signal), width, height)
  let background = compositeRaw(original, cleaned, textMask(width, height, blocks))
  const log: Record<string, unknown> = {
    size, detectPrompt: DETECT_PROMPT, removeTextPrompt: REMOVE_TEXT_PROMPT, blocks: blocks.length, inputBytes: bytes.length, objectFound: false,
  }

  let object: SplitResult['object'] = null
  if (splitObject) {
    signal?.throwIfAborted()
    const clean = await toReferenceDataUrl(await encodeJpeg(background, width, height))
    const subject = parseSubject(await ask(SUBJECT_PROMPT, clean, 'subject', signal), width, height)
    Object.assign(log, { subjectPrompt: SUBJECT_PROMPT, objectFound: subject !== null })
    if (subject) {
      signal?.throwIfAborted()
      const green = await rawRgb(await edit(GREEN_SCREEN_PROMPT, clean, size, signal), width, height)
      const crop = grownBox(subject, CROP_PAD, width, height)
      const png = await sharp(chromaKey(green, width, height), { raw: { width, height, channels: 4 } }).extract(crop).png().toBuffer()
      signal?.throwIfAborted()
      const removed = await rawRgb(await edit(REMOVE_SUBJECT_PROMPT, clean, size, signal), width, height)
      background = compositeRaw(background, removed, textMask(width, height, [subject], SUBJECT_PAD, SUBJECT_FEATHER))
      object = { png: new Uint8Array(png), x: crop.left, y: crop.top, w: crop.width, h: crop.height }
      Object.assign(log, { greenScreenPrompt: GREEN_SCREEN_PROMPT, removeSubjectPrompt: REMOVE_SUBJECT_PROMPT, objectBytes: png.length })
    }
  }

  const jpeg = await encodeJpeg(background, width, height)
  log.backgroundBytes = jpeg.length
  return { background: jpeg, blocks, object, log }
}

const pxBox = (box: PixelBox) => ({
  x: Math.round(box.x),
  y: Math.round(box.y),
  w: Math.max(1, Math.round(box.w)),
  h: Math.max(1, Math.round(box.h)),
})

/** The layer doc of a split slide: the object (if any) furthest back, then a text layer per block. */
export function buildDoc(
  width: number,
  height: number,
  blocks: TextBlock[],
  fonts: { heading: FontName; body: FontName },
  object: ({ assetId: string } & PixelBox) | null,
): LayerDoc {
  const { size: sizes, lineHeight: heights } = LAYER_LIMITS
  const layers: Layer[] = object ? [{ id: 'o1', kind: 'image', role: 'object', assetId: object.assetId, ...pxBox(object) }] : []
  const texts = blocks.slice(0, LAYER_LIMITS.layers - layers.length)
  const largest = texts.reduce((best, block, index) => (block.size > texts[best].size ? index : best), 0)
  texts.forEach((block, index) => {
    const size = Math.round(clamp(block.size, sizes.min, sizes.max))
    const ratio = block.h / (block.text.split('\n').length * size)
    const lineHeight = Number.isFinite(ratio) ? Math.round(clamp(ratio, heights.min, heights.max) * 100) / 100 : 1.2
    layers.push({
      id: `t${index + 1}`,
      kind: 'text',
      text: block.text,
      font: index === largest ? fonts.heading : fonts.body,
      size,
      weight: block.weight,
      color: block.color,
      align: block.align,
      lineHeight,
      ...pxBox(block),
    })
  })
  return { v: 1, width, height, layers }
}
