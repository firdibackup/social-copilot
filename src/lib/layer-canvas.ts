/**
 * Browser drawing of a LayerDoc. The editor lays text out with layoutText and positions each line itself, and the
 * export draws the same lines on a canvas, so what the owner sees is what gets saved. The CSS font family is passed
 * in (fontFamilyOf from font-previews) so this file stays free of next/font.
 */
import { storedJpegAttempts, toInstagramJpeg, type PreparedImage } from './image'
import { MAX_STORED_BYTES } from './storage-quota-options'
import {
  fontShorthand, layerImageUrl, lineBaseline, lineBox, lineStart, textHeight, wrapText,
   type LayerDoc, type TextLayer, type ShapeLayer,
} from './layer-doc'
import type { FontName } from './design-styles'
import { loadFont } from './font-loader'
import { migrateLayerDoc } from './design-doc'
import { drawDesignPage } from './design-canvas'

export type FamilyOf = (font: FontName) => string

/** The part of CanvasRenderingContext2D text layout needs. */
export interface MeasureContext {
  font: string
  /** CSS length such as '4px'; absent in browsers without canvas letter spacing. */
  letterSpacing?: string
  measureText(text: string): Pick<TextMetrics, 'width'> & Partial<Pick<TextMetrics, 'fontBoundingBoxAscent' | 'fontBoundingBoxDescent'>>
}

/** Letter spacing in canvas px. */
const spacingPx = (layer: Pick<TextLayer, 'letterSpacing' | 'size'>) => (layer.letterSpacing ?? 0) * layer.size

/** The text as drawn: uppercased when the layer says so. */
const drawnText = (layer: Pick<TextLayer, 'text' | 'uppercase'>) => (layer.uppercase ? layer.text.toUpperCase() : layer.text)

/** Whether `ctx` spaces letters itself (canvas `letterSpacing`). */
const nativeSpacing = (ctx: MeasureContext) => 'letterSpacing' in ctx

/**
 * Sets the font and spacing on `ctx` and returns a width measure that includes the spacing (after every character,
 * like CSS letter-spacing). Without native canvas letter spacing the spacing is added per character.
 */
function textMeasure(ctx: MeasureContext, layer: TextLayer, family: string): (text: string) => number {
  ctx.font = fontShorthand(layer, family)
  const spacing = spacingPx(layer)
  if (nativeSpacing(ctx)) {
    ctx.letterSpacing = `${spacing}px`
    return (text) => ctx.measureText(text).width
  }
  return (text) => ctx.measureText(text).width + spacing * Array.from(text).length
}

export interface LaidLine {
  /** As drawn (uppercased when the layer says so). */
  text: string
  /** Canvas px: where the line starts, its top (of its line box) and its alphabetic baseline. */
  x: number
  top: number
  baseline: number
  /** Including the letter spacing. */
  width: number
}

export interface TextLayout {
  lines: LaidLine[]
  /** The box height the text needs; the editor grows the layer to it. */
  height: number
}

/** Lines of a text layer as the canvas will draw them. */
export function layoutText(ctx: MeasureContext, layer: TextLayer, family: string): TextLayout {
  const measure = textMeasure(ctx, layer, family)
  const texts = wrapText(measure, drawnText(layer), layer.w)
  const probe = ctx.measureText('Hg')
  // Older browsers lack font metrics; these are typical of the app's fonts.
  const ascent = probe.fontBoundingBoxAscent ?? layer.size * 0.9
  const descent = probe.fontBoundingBoxDescent ?? layer.size * 0.25
  const lines = texts.map((text, index) => {
    const width = measure(text)
    return {
      text,
      width,
      x: lineStart(layer, width),
      top: layer.y + index * lineBox(layer),
      baseline: lineBaseline(layer, index, ascent, descent),
    }
  })
  return { lines, height: textHeight(layer, lines.length) }
}

let shared: CanvasRenderingContext2D | null = null

/** One offscreen context for measuring while editing. */
export function measureContext(): CanvasRenderingContext2D {
  if (!shared) {
    const context = document.createElement('canvas').getContext('2d')
    if (!context) throw new Error('Canvas tidak tersedia di browser ini')
    shared = context
  }
  return shared
}

/** Waits until every font and weight the doc uses can be drawn; canvas would otherwise fall back silently. */
export async function loadFonts(doc: LayerDoc, familyOf: FamilyOf): Promise<void> {
  // Catalogue fonts first need their stylesheet; curated next/font ones resolve at once.
  const names = new Set(doc.layers.flatMap((layer) => (layer.kind === 'text' ? [layer.font] : [])))
  await Promise.all([...names].map((name) => loadFont(name)))
  const wanted = new Set(doc.layers.flatMap((layer) => (layer.kind === 'text' ? [fontShorthand({ ...layer, size: 32 }, familyOf(layer.font))] : [])))
  await Promise.all([...wanted].map((font) => document.fonts.load(font).catch(() => [])))
  await document.fonts.ready
}

/** A same-origin image, so drawing it keeps the canvas exportable. */
export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`image_unavailable:${url}`))
    image.src = url
  })
}

/** The part of CanvasRenderingContext2D drawing needs. */
export interface DrawContext extends MeasureContext {
  fillStyle: string | CanvasGradient | CanvasPattern
  textBaseline: CanvasTextBaseline
  textAlign: CanvasTextAlign
  drawImage(image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number): void
  fillText(text: string, x: number, y: number): void
  // Optional so small fakes stay small; a real canvas has them all.
  globalAlpha?: number
  shadowColor?: string
  shadowBlur?: number
  shadowOffsetX?: number
  shadowOffsetY?: number
  fillRect?(x: number, y: number, w: number, h: number): void
  save?(): void
  restore?(): void
  translate?(x: number, y: number): void
  rotate?(angle: number): void
  beginPath?(): void
  roundRect?(x: number, y: number, width: number, height: number, radius: number): void
  ellipse?(x: number, y: number, rx: number, ry: number, rotation: number, start: number, end: number): void
  moveTo?(x: number, y: number): void
  lineTo?(x: number, y: number): void
  closePath?(): void
  fill?(): void
  stroke?(): void
  strokeStyle?: string | CanvasGradient | CanvasPattern
  lineWidth?: number
  lineCap?: CanvasLineCap
}

const SHADOW_COLOR = 'rgba(0,0,0,0.45)'
/** Shadow blur and drop as fractions of the font size; textCss uses the same. */
const SHADOW_BLUR = 0.08
const SHADOW_DROP = 0.04
/** Underline thickness and its offset below the baseline, as fractions of the font size. */
const UNDERLINE_THICKNESS = 0.06
const UNDERLINE_OFFSET = 0.1

const underlineThickness = (size: number) => Math.max(1, size * UNDERLINE_THICKNESS)

/** Draws background and layers, back to front, at the doc's own pixel size. */
export function drawDoc(
  ctx: DrawContext,
  doc: LayerDoc,
  base: CanvasImageSource,
  images: ReadonlyMap<string, CanvasImageSource>,
  familyOf: FamilyOf,
): void {
  ctx.drawImage(base, 0, 0, doc.width, doc.height)
  for (const layer of doc.layers) {
    if (layer.hidden) continue
    const rotated = Boolean(layer.rotation)
    if (rotated) {
      ctx.save?.()
      ctx.translate?.(layer.x + layer.w / 2, layer.y + layer.h / 2)
      ctx.rotate?.((layer.rotation ?? 0) * Math.PI / 180)
      ctx.translate?.(-layer.x - layer.w / 2, -layer.y - layer.h / 2)
    }
    const alpha = ctx.globalAlpha ?? 1
    if (layer.opacity !== undefined) ctx.globalAlpha = alpha * layer.opacity
    if (layer.kind === 'image') {
      const image = images.get(layer.assetId)
      if (image) ctx.drawImage(image, layer.x, layer.y, layer.w, layer.h)
    } else if (layer.kind === 'shape') {
      drawShape(ctx, layer)
    } else {
      drawText(ctx, layer, familyOf(layer.font))
    }
    if (layer.opacity !== undefined) ctx.globalAlpha = alpha
    if (rotated) ctx.restore?.()
  }
}

export function drawShape(ctx: DrawContext, layer: ShapeLayer): void {
  const { x, y, w, h, shape } = layer
  ctx.beginPath?.()
  ctx.fillStyle = layer.color
  ctx.strokeStyle = layer.strokeColor
  ctx.lineWidth = layer.strokeWidth
  ctx.lineCap = 'round'
  if (shape === 'rect') ctx.roundRect?.(x, y, w, h, Math.min(layer.radius, w / 2, h / 2))
  else if (shape === 'ellipse') ctx.ellipse?.(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
  else if (shape === 'triangle') {
    ctx.moveTo?.(x + w / 2, y)
    ctx.lineTo?.(x + w, y + h)
    ctx.lineTo?.(x, y + h)
    ctx.closePath?.()
  } else {
    ctx.moveTo?.(x, y + h / 2)
    ctx.lineTo?.(x + w, y + h / 2)
    if (shape === 'arrow') {
      const head = Math.min(w / 3, h / 2)
      ctx.moveTo?.(x + w - head, y + h / 2 - head)
      ctx.lineTo?.(x + w, y + h / 2)
      ctx.lineTo?.(x + w - head, y + h / 2 + head)
    }
  }
  if (shape !== 'line' && shape !== 'arrow') ctx.fill?.()
  if (layer.strokeWidth > 0) ctx.stroke?.()
}

function drawText(ctx: DrawContext, layer: TextLayer, family: string): void {
  const { lines } = layoutText(ctx, layer, family)
  ctx.fillStyle = layer.color
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  if (layer.shadow) {
    ctx.shadowColor = SHADOW_COLOR
    ctx.shadowBlur = layer.size * SHADOW_BLUR
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = layer.size * SHADOW_DROP
  }
  const spacing = spacingPx(layer)
  const native = nativeSpacing(ctx)
  for (const line of lines) {
    if (!line.text) continue
    if (native || spacing === 0) {
      ctx.fillText(line.text, line.x, line.baseline)
    } else {
      // No canvas letter spacing: place each character, measured without spacing, then add it.
      let x = line.x
      for (const char of Array.from(line.text)) {
        ctx.fillText(char, x, line.baseline)
        x += ctx.measureText(char).width + spacing
      }
    }
    if (layer.underline) {
      const thickness = underlineThickness(layer.size)
      ctx.fillRect?.(line.x, line.baseline + layer.size * UNDERLINE_OFFSET, line.width, thickness)
    }
  }
  if (layer.shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0)'
    ctx.shadowBlur = 0
    ctx.shadowOffsetY = 0
  }
}

/**
 * The CSS the editor puts on each line span of a text layer, matching what drawDoc paints: same font, spacing,
 * decoration, opacity and shadow, in canvas px.
 */
export function textCss(layer: TextLayer, family: string): Record<string, string | number> {
  const { size } = layer
  return {
    fontFamily: family,
    fontWeight: layer.weight,
    fontStyle: layer.italic ? 'italic' : 'normal',
    fontSize: `${size}px`,
    letterSpacing: `${spacingPx(layer)}px`,
    textDecoration: layer.underline ? 'underline' : 'none',
    // CSS offsets the line's top from the baseline; the canvas rect starts at baseline + offset too.
    textUnderlineOffset: `${size * UNDERLINE_OFFSET}px`,
    textDecorationThickness: `${underlineThickness(size)}px`,
    textTransform: layer.uppercase ? 'uppercase' : 'none',
    opacity: layer.opacity ?? 1,
    textShadow: layer.shadow ? `0 ${size * SHADOW_DROP}px ${size * SHADOW_BLUR}px ${SHADOW_COLOR}` : 'none',
    whiteSpace: 'pre',
  }
}

/**
 * The flattened slide as an Instagram-ready JPEG: loads fonts and images (through the same-origin route), draws,
 * then re-encodes with toInstagramJpeg like any upload.
 */
export async function flattenDoc(doc: LayerDoc, baseAssetId: string, familyOf: FamilyOf): Promise<PreparedImage> {
  const ids = [...new Set(doc.layers.flatMap((layer) => (layer.kind === 'image' ? [layer.assetId] : [])))]
  const [base, ...loaded] = await Promise.all([
    loadImage(layerImageUrl(baseAssetId)),
    ...ids.map((id) => loadImage(layerImageUrl(id))),
    loadFonts(doc, familyOf).then(() => null),
  ])
  const images = new Map(ids.map((id, index) => {
    const image = loaded[index] as HTMLImageElement
    return [id, { image, width: image.naturalWidth, height: image.naturalHeight }] as const
  }))
  const background = base as HTMLImageElement
  images.set(baseAssetId, { image: background, width: background.naturalWidth, height: background.naturalHeight })
  const canvas = document.createElement('canvas')
  canvas.width = doc.width
  canvas.height = doc.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas tidak tersedia di browser ini')
  const design = migrateLayerDoc(doc, { id: crypto.randomUUID(), pageId: crypto.randomUUID(),
    nodeIds: doc.layers.map(() => crypto.randomUUID()) }, baseAssetId)
  drawDesignPage(ctx, design.pages[0], images, familyOf)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('Canvas tidak bisa diekspor')
  return toInstagramJpeg(new File([blob], 'slide.png', { type: 'image/png' }))
}

// ---------- The owner's own image as a layer ----------

/** An uploaded layer image's longest side; plenty for a 1080 px slide. */
export const LAYER_UPLOAD_MAX_SIDE = 1600
const UPLOAD_RESIZE_STEPS = 8
const UPLOAD_RESIZE_FACTOR = 0.85

export interface LayerUploadAttempt {
  width: number
  height: number
  type: 'image/png' | 'image/jpeg'
  /** JPEG only. */
  quality?: number
}

/**
 * The encodings to try, in order, for a `width`×`height` image of `sourceType`: capped at LAYER_UPLOAD_MAX_SIDE,
 * PNG for formats that may be transparent (stepping down in size), else JPEG 0.9 (stepping down in quality, then size).
 */
export function layerUploadAttempts(width: number, height: number, sourceType: string): LayerUploadAttempt[] {
  const scale = Math.min(1, LAYER_UPLOAD_MAX_SIDE / Math.max(width, height))
  const w = Math.max(1, Math.round(width * scale))
  const h = Math.max(1, Math.round(height * scale))
  if (!/^image\/(png|webp|gif)$/.test(sourceType)) {
    return storedJpegAttempts(w, h, 0.9).map((attempt) => ({ ...attempt, type: 'image/jpeg' }))
  }
  const attempts: LayerUploadAttempt[] = [{ width: w, height: h, type: 'image/png' }]
  let resized = w
  for (let step = 0; step < UPLOAD_RESIZE_STEPS; step++) {
    resized = Math.max(1, Math.floor(resized * UPLOAD_RESIZE_FACTOR))
    attempts.push({ width: resized, height: Math.max(1, Math.round((h * resized) / w)), type: 'image/png' })
  }
  return attempts
}

/**
 * Browser only: the owner's image ready to store as a layer, at most 2 MB. Throws Error('image_unreadable') when the
 * browser can't decode it and Error('image_too_large') when no attempt fits.
 */
export async function prepareLayerUpload(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('image_unreadable')
  }
  try {
    if (!bitmap.width || !bitmap.height) throw new Error('image_unreadable')
    const canvas = document.createElement('canvas')
    for (const attempt of layerUploadAttempts(bitmap.width, bitmap.height, file.type)) {
      canvas.width = attempt.width
      canvas.height = attempt.height
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas tidak tersedia di browser ini')
      if (attempt.type === 'image/jpeg') {
        // JPEG has no transparency; without a fill, transparent areas turn black.
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, attempt.width, attempt.height)
      } else {
        ctx.clearRect(0, 0, attempt.width, attempt.height)
      }
      ctx.drawImage(bitmap, 0, 0, attempt.width, attempt.height)
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, attempt.type, attempt.quality))
      if (blob && blob.size <= MAX_STORED_BYTES) return { blob, width: attempt.width, height: attempt.height }
    }
    throw new Error('image_too_large')
  } finally {
    bitmap.close()
  }
}
