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

export const GRAPHIC_KINDS = ['photo', 'icon', 'logo', 'illustration'] as const
export type GraphicKind = (typeof GRAPHIC_KINDS)[number]

/** A graphic placed on the slide (photo, icon, logo, illustration), in px of the image. */
export interface GraphicBox extends PixelBox {
  kind: GraphicKind
}

/** A graphic cut out of the original slide as a rectangle: `bytes` is a PNG or JPEG of exactly w × h. */
export interface GraphicCrop extends GraphicBox {
  bytes: Uint8Array
}

/** A flat solid-colour shape on the slide, in px of the image. */
export interface ShapeBox extends PixelBox {
  shape: 'rect' | 'ellipse' | 'triangle'
  color: string
  /** Corner radius in px (rect only; 0 otherwise). */
  radius: number
  /** 0.1–1; absent when opaque. */
  opacity?: number
}

/** The vision model found no text, graphic or shape: nothing was removed, and the caller refunds. */
export class NoTextError extends Error {
  override name = 'NoTextError'
}

export interface SplitResult {
  /** The clean background: a JPEG of exactly width × height. */
  background: Uint8Array
  blocks: TextBlock[]
  /** Graphics cropped from the original slide, each placed back at its own box. */
  images: GraphicCrop[]
  shapes: ShapeBox[]
  /** The person/object cut out as a PNG with transparency, and where it sits; null when not asked or not found. */
  object: ({ png: Uint8Array } & PixelBox) | null
  /** What the generation log keeps: prompts and sizes, never image data. */
  log: Record<string, unknown>
}

const MAX_BLOCKS = 30
const MAX_IMAGES = 12
const MAX_SHAPES = 12
/** A graphic or shape covering more of the slide than this is its background, which stays. */
export const MAX_ELEMENT_AREA = 0.85
/** A graphic smaller than this on either side is not worth its own image. */
const MIN_GRAPHIC_PX = 4
const HEX = /^#[0-9a-fA-F]{6}$/
const ALIGNS: ReadonlySet<string> = new Set(['left', 'center', 'right'])
const TEXT_PAD = 0.02
const TEXT_FEATHER = 8
/** Room around a graphic's box in its crop, so anti-aliased edges and soft shadows the box missed aren't clipped. */
const GRAPHIC_PAD = 0.01
const SUBJECT_PAD = 0.02
const SUBJECT_FEATHER = 12
/** Room around the subject's box in the cut-out, so hair and hands the box missed aren't clipped. */
const CROP_PAD = 0.05
const JPEG_QUALITIES = [92, 85, 78, 70, 60]
/** Colour distance to #00FF00 below which a pixel is background, and the ramp to fully opaque after it. */
export const CHROMA = { threshold: 70, softness: 60 }

export const DETECT_PROMPT = [
  'This image is a flat social media slide. Find every element placed on its background: text blocks, graphic images and flat shapes.',
  'Every box below: x, y = the top-left corner of the element\'s tight bounding box and w, h = its width and height, as fractions 0–1 (x and w of the image width, y and h of the image height).',
  '1. blocks: every piece of visible text: titles, body text, captions, small print, numbers, prices, social media handles, URLs and labels.',
  'Copy each text exactly as it is written in the image: same spelling, capitalisation, punctuation and emoji. Do not translate, correct or summarise.',
  'Give one block per line of text, in reading order.',
  'size = the font size (about the height of one line) as a fraction 0–1 of the image width. color = the main text colour as #RRGGBB. weight = 700 for bold, 400 for regular. align = left, center or right: how the line sits in its text column.',
  '2. images: every distinct graphic element placed on the slide: photos and product shots (framed or cut out), icons, logos, stickers and illustrations. kind = photo, icon, logo or illustration.',
  'Do NOT list the background as an image: a full-bleed photo, gradient, pattern or texture behind everything, or anything covering most of the slide, is the background. Letters that are part of a logo, a product or a photo belong to that image and are not blocks.',
  '3. shapes: every flat, solid-colour geometric element: boxes, cards, panels, rounded badges and pills behind text, circles, dots, bars, underlines and divider lines.',
  'shape = rect, ellipse or triangle (rect for bars and lines). color = its fill as #RRGGBB. radius = its corner radius as a fraction 0–0.5 of its shorter side (0.5 for a pill, 0 for sharp corners, ellipses and triangles). opacity = 0.1–1 only when it is see-through.',
  'Skip gradients, photos, textures and outline-only shapes, and never list the background itself. When text sits on a shape, the text is a block and the shape is listed separately.',
  'Answer ONLY with strict JSON, no other text, in this shape: {"blocks":[{"text":"…","x":0.08,"y":0.10,"w":0.84,"h":0.12,"color":"#FFFFFF","size":0.06,"weight":700,"align":"left"}],"images":[{"x":0.55,"y":0.30,"w":0.40,"h":0.45,"kind":"photo"}],"shapes":[{"x":0.06,"y":0.80,"w":0.40,"h":0.08,"shape":"rect","color":"#FF5A36","radius":0.5}]}',
  'Use an empty list for anything the image does not have; with nothing at all, answer {"blocks":[],"images":[],"shapes":[]}.',
].join('\n')

/** The edit prompt when only text is removed. */
export const REMOVE_TEXT_PROMPT =
  'Remove all text, letters, numbers and captions from this image. Fill the areas naturally to match the surrounding background. Do not change anything else: same people, objects, colours, lighting, composition and framing.'

const percent = (value: number, side: number) => Math.round((value / side) * 100)
const where = (box: PixelBox, width: number, height: number) =>
  `left ${percent(box.x, width)}–${percent(box.x + box.w, width)}%, top ${percent(box.y, height)}–${percent(box.y + box.h, height)}%`
const shapeName = (shape: ShapeBox) =>
  shape.shape === 'ellipse' ? 'oval' : shape.shape === 'triangle' ? 'triangle' : shape.radius > 0 ? 'rounded box' : 'box'

/**
 * The background edit prompt: the text and every graphic and shape that becomes a layer, each named with where it
 * sits so the editor removes those and leaves the background picture itself (people and scenery in it) alone.
 */
export function removePrompt(images: GraphicBox[], shapes: ShapeBox[], width: number, height: number): string {
  if (images.length === 0 && shapes.length === 0) return REMOVE_TEXT_PROMPT
  const parts = ['all text, letters, numbers and captions']
  if (images.length) parts.push(`these graphic elements placed on the slide: ${images.map((image) => `the ${image.kind} at ${where(image, width, height)}`).join('; ')}`)
  if (shapes.length) parts.push(`these flat solid-colour shapes: ${shapes.map((shape) => `the ${shapeName(shape)} at ${where(shape, width, height)}`).join('; ')}`)
  return [
    `Remove from this image: ${parts.join('. Also ')}.`,
    'Fill every removed area naturally so it continues the surrounding background: same colours, gradients, textures and lighting, with no outlines, shadows or empty frames left behind.',
    'Do not change anything else: the background picture stays exactly as it is, including people and scenery that are part of it, with the same colours, lighting, composition and framing. No text.',
  ].join(' ')
}

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

/** Whether a box covers so much of the slide that it is the background, which stays. */
const isBackground = (box: PixelBox, width: number, height: number) => box.w * box.h > MAX_ELEMENT_AREA * width * height

/** The vision answer's graphics in px: invalid, tiny and background-sized ones dropped. An unknown kind is a photo. */
export function parseImages(json: unknown, width: number, height: number): GraphicBox[] {
  const items = isObject(json) && Array.isArray(json.images) ? json.images : []
  return items
    .flatMap((item): GraphicBox[] => {
      if (!isObject(item)) return []
      const box = fractionBox(item, width, height)
      if (!box || box.w < MIN_GRAPHIC_PX || box.h < MIN_GRAPHIC_PX || isBackground(box, width, height)) return []
      const kind = (GRAPHIC_KINDS as readonly unknown[]).includes(item.kind) ? (item.kind as GraphicKind) : 'photo'
      return [{ ...box, kind }]
    })
    .slice(0, MAX_IMAGES)
}

const SHAPES: ReadonlySet<string> = new Set(['rect', 'ellipse', 'triangle'])

/**
 * The vision answer's flat shapes in px: invalid, colourless and background-sized ones dropped. The radius comes as a
 * fraction of the shorter side (at most 0.5, a pill) and is kept for rects only; an opaque shape has no opacity.
 */
export function parseShapes(json: unknown, width: number, height: number): ShapeBox[] {
  const items = isObject(json) && Array.isArray(json.shapes) ? json.shapes : []
  return items
    .flatMap((item): ShapeBox[] => {
      if (!isObject(item) || typeof item.color !== 'string' || !HEX.test(item.color.trim())) return []
      const box = fractionBox(item, width, height)
      if (!box || isBackground(box, width, height)) return []
      const shape = typeof item.shape === 'string' && SHAPES.has(item.shape) ? (item.shape as ShapeBox['shape']) : 'rect'
      const ratio = num(item.radius)
      const radius = shape === 'rect' && Number.isFinite(ratio) && ratio > 0
        ? Math.round(clamp(ratio, 0, 0.5) * Math.min(box.w, box.h) * 100) / 100
        : 0
      const alpha = num(item.opacity)
      if (alpha <= 0) return []
      const opacity = Number.isFinite(alpha) && alpha < 1
        ? { opacity: Math.round(clamp(alpha, LAYER_LIMITS.opacity.min, LAYER_LIMITS.opacity.max) * 100) / 100 }
        : {}
      return [{ ...box, shape, color: item.color.trim().toUpperCase(), radius, ...opacity }]
    })
    .slice(0, MAX_SHAPES)
}

/**
 * What fits in `budget` layers: text first, then graphics, then shapes. Whatever doesn't fit is not extracted, so it
 * stays in the background rather than being erased.
 */
export function fitLayers<T extends { blocks: unknown[]; images: unknown[]; shapes: unknown[] }>(elements: T, budget: number): T {
  const blocks = elements.blocks.slice(0, Math.max(0, budget))
  const images = elements.images.slice(0, Math.max(0, budget - blocks.length))
  const shapes = elements.shapes.slice(0, Math.max(0, budget - blocks.length - images.length))
  return { ...elements, blocks, images, shapes }
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

/**
 * The model that reads the slide's text: its boxes decide what gets erased and where each layer sits, so it gets a
 * stronger reader than the default text model. ROUTER_LAYERS_MODEL overrides it.
 */
export const DEFAULT_TEXT_READER_MODEL = 'cc/claude-opus-5-5'
const textReaderModel = () => process.env.ROUTER_LAYERS_MODEL?.trim() || DEFAULT_TEXT_READER_MODEL

/** One vision question about an image; the answer must be JSON with `key`. Without `model`, the app's text model. */
async function ask(prompt: string, image: string, key: string, signal?: AbortSignal, model?: string): Promise<Json> {
  const answer = await chatCompletion(
    [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: image } }] }],
    model,
    signal,
  )
  const json = readJson(answer)
  // The element answer counts when it lists any kind of element; a model may leave out an empty list.
  const valid = key === 'blocks'
    ? !!json && ['blocks', 'images', 'shapes'].some((name) => Array.isArray(json[name]))
    : !!json && key in json
  if (!json || !valid) throw new AiOutputError(snippetOf(answer))
  return json
}

async function edit(prompt: string, image: string, size: string, signal?: AbortSignal): Promise<Buffer> {
  return Buffer.from(await generateImage({ prompt, size, images: [image] }, undefined, signal), 'base64')
}

/**
 * A graphic's rectangle of the original (raw RGB of width × height), grown a little: flat art (icons, logos,
 * illustrations) as a lossless PNG when it fits the stored size, photos and anything larger as JPEG.
 */
async function cropGraphic(original: Uint8Array, width: number, height: number, graphic: GraphicBox): Promise<GraphicCrop> {
  const crop = grownBox(graphic, GRAPHIC_PAD, width, height)
  const region = () => sharp(original, { raw: { width, height, channels: 3 } }).extract(crop)
  let bytes: Buffer | null = null
  if (graphic.kind !== 'photo') {
    const png = await region().png({ compressionLevel: 9 }).toBuffer()
    if (png.length <= TARGET_STORED_BYTES) bytes = png
  }
  for (const quality of JPEG_QUALITIES) {
    if (bytes) break
    const jpeg = await region().jpeg({ quality }).toBuffer()
    if (jpeg.length <= TARGET_STORED_BYTES) bytes = jpeg
  }
  if (!bytes) throw new SlideImageError('Foto tidak bisa diproses. Coba foto lain.')
  return { kind: graphic.kind, bytes: new Uint8Array(bytes), x: crop.left, y: crop.top, w: crop.width, h: crop.height }
}

/**
 * Reads the slide's text, graphics and flat shapes in one vision call, crops the graphics out of the original, and
 * has all of it removed from the background in one edit that is kept only inside the elements' boxes. With
 * `splitObject` it then cuts the main subject out of that clean background and removes it there too. Throws
 * NoTextError before any image is generated when the slide has no element at all.
 */
export async function splitSlide(
  input: { bytes: Uint8Array; width: number; height: number; splitObject: boolean },
  signal?: AbortSignal,
): Promise<SplitResult> {
  const { bytes, width, height, splitObject } = input
  const size = imageSize(width, height)
  const reference = await toReferenceDataUrl(bytes)
  const answer = await ask(DETECT_PROMPT, reference, 'blocks', signal, textReaderModel())
  // One layer stays free for the subject when it is asked for; what doesn't fit stays in the background.
  const { blocks, images: graphics, shapes } = fitLayers({
    blocks: mergeBlocks(parseBlocks(answer, width, height)),
    images: parseImages(answer, width, height),
    shapes: parseShapes(answer, width, height),
  }, LAYER_LIMITS.layers - (splitObject ? 1 : 0))
  if (blocks.length + graphics.length + shapes.length === 0) throw new NoTextError('Tidak ada teks atau elemen di gambar ini')
  signal?.throwIfAborted()

  const original = await rawRgb(bytes, width, height)
  const images = await Promise.all(graphics.map((graphic) => cropGraphic(original, width, height, graphic)))
  const prompt = removePrompt(graphics, shapes, width, height)
  const cleaned = await rawRgb(await edit(prompt, reference, size, signal), width, height)
  // Only the extracted elements' areas are repainted: every other pixel is the original's.
  let background = compositeRaw(original, cleaned, textMask(width, height, [...blocks, ...images, ...shapes]))
  const log: Record<string, unknown> = {
    size, detectModel: textReaderModel(), detectPrompt: DETECT_PROMPT, removeTextPrompt: prompt, blocks: blocks.length,
    images: images.length, shapes: shapes.length, imageBytes: images.reduce((sum, image) => sum + image.bytes.length, 0),
    inputBytes: bytes.length, objectFound: false,
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
  return { background: jpeg, blocks, images, shapes, object, log }
}

const pxBox = (box: PixelBox) => ({
  x: Math.round(box.x),
  y: Math.round(box.y),
  w: Math.max(1, Math.round(box.w)),
  h: Math.max(1, Math.round(box.h)),
})

/** A stored graphic crop, for buildDoc. */
export type PlacedGraphic = { assetId: string; kind: GraphicKind } & PixelBox

/**
 * The layer doc of a split slide, back to front: the object (if any), the flat shapes, the graphics, then a text
 * layer per block on top. Text is kept first when the layer limit cuts. With `labels`, each graphic is named after
 * its kind and number ("Ikon 2"); shapes and the object keep the editor's own labels.
 */
export function buildDoc(
  width: number,
  height: number,
  blocks: TextBlock[],
  fonts: { heading: FontName; body: FontName },
  object: ({ assetId: string } & PixelBox) | null,
  elements: { images?: PlacedGraphic[]; shapes?: ShapeBox[]; labels?: Record<GraphicKind, string> } = {},
): LayerDoc {
  const { size: sizes, lineHeight: heights } = LAYER_LIMITS
  const fit = fitLayers({ blocks, images: elements.images ?? [], shapes: elements.shapes ?? [] }, LAYER_LIMITS.layers - (object ? 1 : 0))
  const layers: Layer[] = object ? [{ id: 'o1', kind: 'image', role: 'object', assetId: object.assetId, ...pxBox(object) }] : []
  fit.shapes.forEach((shape, index) => {
    const box = pxBox(shape)
    layers.push({
      id: `s${index + 1}`, kind: 'shape', shape: shape.shape, color: shape.color,
      radius: Math.round(clamp(shape.radius, 0, Math.min(box.w, box.h) / 2)), strokeColor: shape.color, strokeWidth: 0,
      ...(shape.opacity !== undefined ? { opacity: shape.opacity } : {}), ...box,
    })
  })
  const counts: Partial<Record<GraphicKind, number>> = {}
  fit.images.forEach((image, index) => {
    counts[image.kind] = (counts[image.kind] ?? 0) + 1
    const name = elements.labels ? { name: `${elements.labels[image.kind]} ${counts[image.kind]}`.slice(0, 120) } : {}
    layers.push({ id: `i${index + 1}`, kind: 'image', role: 'object', assetId: image.assetId, ...name, ...pxBox(image) })
  })
  const texts = fit.blocks
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
