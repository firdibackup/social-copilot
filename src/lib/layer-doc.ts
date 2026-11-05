/**
 * The layers of an editable slide (slide_layers.doc), shared by the browser editor and the server. Pure: no DOM, no
 * database. Every position is in canvas px of the stored image; layers[0] is drawn first (furthest back).
 */
import { isCuratedFont, type FontName } from './design-styles'
import { isGoogleFont } from './google-fonts'

export interface Box { id: string; x: number; y: number; w: number; h: number }

export type TextAlign = 'left' | 'center' | 'right'

export const TEXT_WEIGHTS = [300, 400, 500, 600, 700, 800] as const
export type TextWeight = (typeof TEXT_WEIGHTS)[number]

export interface TextLayer extends Box {
  kind: 'text'
  /** Plain text; '\n' starts a new line. Never rendered as HTML. */
  text: string
  font: FontName
  size: number
  weight: TextWeight
  color: string
  align: TextAlign
  lineHeight: number
  // Optional styling: absent means the default, so docs stored before these existed stay valid.
  italic?: boolean
  underline?: boolean
  uppercase?: boolean
  /** In em: a fraction of `size`. Default 0. */
  letterSpacing?: number
  /** 0.1–1, default 1. */
  opacity?: number
  /** A soft drop shadow. */
  shadow?: boolean
}

export type ImageRole = 'logo' | 'product' | 'object' | 'upload'

export interface ImageLayer extends Box {
  kind: 'image'
  assetId: string
  role: ImageRole
  /** 0.1–1, default 1. */
  opacity?: number
}

export type Layer = TextLayer | ImageLayer

export interface LayerDoc {
  v: 1
  width: number
  height: number
  layers: Layer[]
}

export const LAYER_LIMITS = {
  layers: 30,
  text: 500,
  size: { min: 12, max: 400 },
  lineHeight: { min: 0.8, max: 2 },
  /** In em (a fraction of the font size). */
  letterSpacing: { min: -0.1, max: 0.5 },
  opacity: { min: 0.1, max: 1 },
  /** Canvas sides: Instagram's stored sizes fall well inside. */
  side: { min: 100, max: 2000 },
  /** The smallest box a resize leaves, in canvas px. */
  minBox: 24,
  history: 30,
} as const

/** Snapping tolerance in screen px (§7.1); divide by the display scale for canvas px. */
export const SNAP_SCREEN_PX = 6

const HEX = /^#[0-9a-fA-F]{6}$/
const ID = /^[A-Za-z0-9_-]{1,40}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ROLES: ReadonlySet<string> = new Set(['logo', 'product', 'object', 'upload'])
const ALIGNS: ReadonlySet<string> = new Set(['left', 'center', 'right'])
const BOX_KEYS = ['id', 'x', 'y', 'w', 'h', 'kind']
const TEXT_FLAGS = ['italic', 'underline', 'uppercase', 'shadow'] as const
const TEXT_KEYS = new Set([...BOX_KEYS, 'text', 'font', 'size', 'weight', 'color', 'align', 'lineHeight',
  ...TEXT_FLAGS, 'letterSpacing', 'opacity'])
const IMAGE_KEYS = new Set([...BOX_KEYS, 'assetId', 'role', 'opacity'])
const WEIGHTS: ReadonlySet<unknown> = new Set(TEXT_WEIGHTS)
const DOC_KEYS = new Set(['v', 'width', 'height', 'layers'])

/** A curated font or any family of the Google Fonts catalogue. */
export const isFontName = (value: unknown): value is FontName => isCuratedFont(value) || isGoogleFont(value)

type Json = Record<string, unknown>
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value)
const onlyKeys = (value: Json, keys: ReadonlySet<string>) => Object.keys(value).every((key) => keys.has(key))
const finite = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max

/** Why a doc was refused; the server answers with one generic message. */
export type LayerDocError = 'shape' | 'size' | 'too_many' | 'layer' | 'duplicate_id'

/** A doc from the browser or the database, checked field by field; unknown keys are refused, not dropped. */
export function parseLayerDoc(value: unknown): { doc: LayerDoc } | { error: LayerDocError } {
  if (!isObject(value) || !onlyKeys(value, DOC_KEYS) || value.v !== 1 || !Array.isArray(value.layers)) return { error: 'shape' }
  const { side } = LAYER_LIMITS
  if (!Number.isInteger(value.width) || !Number.isInteger(value.height)
    || !finite(value.width, side.min, side.max) || !finite(value.height, side.min, side.max)) return { error: 'size' }
  if (value.layers.length > LAYER_LIMITS.layers) return { error: 'too_many' }
  const width = value.width
  const height = value.height
  const layers: Layer[] = []
  const ids = new Set<string>()
  for (const item of value.layers) {
    const layer = parseLayer(item, width, height)
    if (!layer) return { error: 'layer' }
    if (ids.has(layer.id)) return { error: 'duplicate_id' }
    ids.add(layer.id)
    layers.push(layer)
  }
  return { doc: { v: 1, width, height, layers } }
}

function parseLayer(value: unknown, width: number, height: number): Layer | null {
  if (!isObject(value) || typeof value.id !== 'string' || !ID.test(value.id)) return null
  // A box may hang partly off the canvas, but not wander arbitrarily far.
  const { x, y, w, h } = value
  if (!finite(w, 1, width * 4) || !finite(h, 1, height * 4)) return null
  if (!finite(x, -w, width) || !finite(y, -h, height)) return null
  const box = { id: value.id, x, y, w, h }
  const { opacity } = value
  if (opacity !== undefined && !finite(opacity, LAYER_LIMITS.opacity.min, LAYER_LIMITS.opacity.max)) return null
  const extra: { opacity?: number } = opacity === undefined ? {} : { opacity }
  if (value.kind === 'text') {
    if (!onlyKeys(value, TEXT_KEYS)) return null
    const { text, font, size, weight, color, align, lineHeight, letterSpacing } = value
    if (typeof text !== 'string' || Array.from(text).length > LAYER_LIMITS.text) return null
    if (!isFontName(font) || !WEIGHTS.has(weight)) return null
    if (!finite(size, LAYER_LIMITS.size.min, LAYER_LIMITS.size.max)) return null
    if (!finite(lineHeight, LAYER_LIMITS.lineHeight.min, LAYER_LIMITS.lineHeight.max)) return null
    if (typeof color !== 'string' || !HEX.test(color)) return null
    if (typeof align !== 'string' || !ALIGNS.has(align)) return null
    const spacing = LAYER_LIMITS.letterSpacing
    if (letterSpacing !== undefined && !finite(letterSpacing, spacing.min, spacing.max)) return null
    const style: Partial<TextLayer> = { ...extra, ...(letterSpacing === undefined ? {} : { letterSpacing }) }
    for (const flag of TEXT_FLAGS) {
      const on = value[flag]
      if (on === undefined) continue
      if (typeof on !== 'boolean') return null
      style[flag] = on
    }
    return {
      ...box, kind: 'text', text, font, size, weight: weight as TextWeight, color: color.toUpperCase(), align: align as TextAlign,
      lineHeight, ...style,
    }
  }
  if (value.kind === 'image') {
    if (!onlyKeys(value, IMAGE_KEYS)) return null
    if (typeof value.assetId !== 'string' || !UUID.test(value.assetId)) return null
    if (typeof value.role !== 'string' || !ROLES.has(value.role)) return null
    return { ...box, kind: 'image', assetId: value.assetId.toLowerCase(), role: value.role as ImageRole, ...extra }
  }
  return null
}

/** The distinct images a doc draws, for the server's ownership check and orphan cleanup. */
export const docAssetIds = (doc: LayerDoc): string[] =>
  [...new Set(doc.layers.flatMap((layer) => (layer.kind === 'image' ? [layer.assetId] : [])))]

// ---------- Text layout: the editor's DOM and the export canvas both use these, so lines wrap identically. ----------

/** `ctx.font` / CSS `font` shorthand for a text layer, given the CSS family of its font. */
export const fontShorthand = (layer: Pick<TextLayer, 'weight' | 'size' | 'italic'>, family: string) =>
  `${layer.italic ? 'italic ' : ''}${layer.weight} ${layer.size}px ${family}`

/**
 * Greedy word wrap to `maxWidth`, as measured by `measure` (canvas measureText in the browser). '\n' always breaks;
 * spaces collapse into one between words; a word wider than the box is split by characters.
 */
export function wrapText(measure: (text: string) => number, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/[ \t]+/).filter(Boolean)
    if (words.length === 0) { lines.push(''); continue }
    let line = ''
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word
      if (measure(candidate) <= maxWidth) { line = candidate; continue }
      if (line) lines.push(line)
      if (measure(word) <= maxWidth) { line = word; continue }
      // Too long for one line by itself: break it where it overflows.
      let piece = ''
      for (const char of Array.from(word)) {
        if (piece && measure(piece + char) > maxWidth) { lines.push(piece); piece = '' }
        piece += char
      }
      line = piece
    }
    lines.push(line)
  }
  return lines
}

/** A line's box height in canvas px. */
export const lineBox = (layer: Pick<TextLayer, 'size' | 'lineHeight'>) => layer.size * layer.lineHeight

/** The height a text layer's box grows to for `lineCount` lines. */
export const textHeight = (layer: Pick<TextLayer, 'size' | 'lineHeight'>, lineCount: number) =>
  Math.max(1, lineCount) * lineBox(layer)

/**
 * The alphabetic baseline of line `index`, laid out like CSS: the font's ascent + descent sit centred in the line
 * box (half-leading on both sides). `ascent`/`descent` are measureText's fontBoundingBoxAscent/Descent.
 */
export const lineBaseline = (layer: Pick<TextLayer, 'y' | 'size' | 'lineHeight'>, index: number, ascent: number, descent: number) =>
  layer.y + index * lineBox(layer) + (lineBox(layer) - (ascent + descent)) / 2 + ascent

/** Where a line of `lineWidth` starts so it sits at the layer's alignment. */
export function lineStart(layer: Pick<TextLayer, 'x' | 'w' | 'align'>, lineWidth: number): number {
  if (layer.align === 'center') return layer.x + (layer.w - lineWidth) / 2
  if (layer.align === 'right') return layer.x + layer.w - lineWidth
  return layer.x
}

// ---------- Geometry ----------

export interface Canvas { width: number; height: number }

/** Whether any part of the box lies outside the canvas: the editor warns, it doesn't move it. */
export const isOutside = (box: Omit<Box, 'id'>, canvas: Canvas) =>
  box.x < 0 || box.y < 0 || box.x + box.w > canvas.width || box.y + box.h > canvas.height

/** Keeps at least `visible` px of the box on the canvas, so a layer dragged away can still be grabbed. */
export function clampBox<T extends Omit<Box, 'id'>>(box: T, canvas: Canvas, visible = 40): T {
  const keepX = Math.min(visible, box.w)
  const keepY = Math.min(visible, box.h)
  return {
    ...box,
    x: Math.min(Math.max(box.x, keepX - box.w), canvas.width - keepX),
    y: Math.min(Math.max(box.y, keepY - box.h), canvas.height - keepY),
  }
}

export interface SnapResult {
  x: number
  y: number
  /** Guide lines to draw, in canvas px. */
  guides: { vertical: number[]; horizontal: number[] }
}

/** The nearest target to any of `edges` within `tolerance`, as the offset to add; 0 when none is close. */
function nearest(edges: number[], targets: number[], tolerance: number): { offset: number; guide: number | null } {
  let best: { offset: number; guide: number | null } = { offset: 0, guide: null }
  let distance = tolerance + 1e-9
  for (const edge of edges) {
    for (const target of targets) {
      const gap = Math.abs(target - edge)
      if (gap <= distance) { distance = gap; best = { offset: target - edge, guide: target } }
    }
  }
  return best
}

/**
 * Snaps a moving box's edges and centre to the canvas edges and centre lines, and to the other boxes' edges and
 * centres. `tolerance` is in canvas px (SNAP_SCREEN_PX / display scale).
 */
export function snapBox(box: Omit<Box, 'id'>, canvas: Canvas, others: Omit<Box, 'id'>[], tolerance: number): SnapResult {
  const xs = [0, canvas.width / 2, canvas.width, ...others.flatMap((other) => [other.x, other.x + other.w / 2, other.x + other.w])]
  const ys = [0, canvas.height / 2, canvas.height, ...others.flatMap((other) => [other.y, other.y + other.h / 2, other.y + other.h])]
  const sx = nearest([box.x, box.x + box.w / 2, box.x + box.w], xs, tolerance)
  const sy = nearest([box.y, box.y + box.h / 2, box.y + box.h], ys, tolerance)
  return {
    x: box.x + sx.offset,
    y: box.y + sy.offset,
    guides: { vertical: sx.guide === null ? [] : [sx.guide], horizontal: sy.guide === null ? [] : [sy.guide] },
  }
}

/** The topmost layer under a canvas point, or null. */
export function hitTest(layers: Layer[], x: number, y: number): string | null {
  for (let index = layers.length - 1; index >= 0; index--) {
    const layer = layers[index]
    if (x >= layer.x && x <= layer.x + layer.w && y >= layer.y && y <= layer.y + layer.h) return layer.id
  }
  return null
}

export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
export const HANDLES: readonly Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

/**
 * The box after dragging `handle` by (dx, dy) canvas px from `start`. `keepRatio` (images) scales proportionally
 * from the opposite corner or edge; a box never shrinks below LAYER_LIMITS.minBox.
 */
export function resizeBox<T extends Omit<Box, 'id'>>(start: T, handle: Handle, dx: number, dy: number, keepRatio: boolean): T {
  const min = LAYER_LIMITS.minBox
  const west = handle.includes('w')
  const east = handle.includes('e')
  const north = handle.includes('n')
  const south = handle.includes('s')
  let w = start.w + (east ? dx : west ? -dx : 0)
  let h = start.h + (south ? dy : north ? -dy : 0)
  if (keepRatio) {
    const ratio = start.w / start.h
    const horizontal = east || west
    const vertical = north || south
    // A corner follows whichever side moved more; an edge drives the other side.
    const byWidth = horizontal && (!vertical || Math.abs(w / start.w - 1) >= Math.abs(h / start.h - 1))
    const factor = Math.max(byWidth ? w / start.w : h / start.h, min / Math.min(start.w, start.h))
    w = start.w * factor
    h = w / ratio
  } else {
    w = Math.max(min, w)
    h = Math.max(min, h)
  }
  const x = west ? start.x + start.w - w : east ? start.x : start.x + (start.w - w) / 2
  const y = north ? start.y + start.h - h : south ? start.y : start.y + (start.h - h) / 2
  return { ...start, x: west || east || keepRatio ? x : start.x, y: north || south || keepRatio ? y : start.y, w, h }
}

export type Reorder = 'front' | 'back' | 'forward' | 'backward'

/** The doc with one layer moved in the stack. */
export function reorder(doc: LayerDoc, id: string, to: Reorder): LayerDoc {
  const from = doc.layers.findIndex((layer) => layer.id === id)
  if (from < 0) return doc
  const last = doc.layers.length - 1
  const target = to === 'front' ? last : to === 'back' ? 0 : to === 'forward' ? Math.min(last, from + 1) : Math.max(0, from - 1)
  if (target === from) return doc
  const layers = [...doc.layers]
  const [layer] = layers.splice(from, 1)
  layers.splice(target, 0, layer)
  return { ...doc, layers }
}

// ---------- Undo/redo ----------

export interface History { past: LayerDoc[]; present: LayerDoc; future: LayerDoc[] }

export const createHistory = (doc: LayerDoc): History => ({ past: [], present: doc, future: [] })

/** Records a new state; keeps the newest LAYER_LIMITS.history steps. An unchanged doc is not a step. */
export function commit(history: History, doc: LayerDoc): History {
  if (doc === history.present) return history
  return { past: [...history.past, history.present].slice(-LAYER_LIMITS.history), present: doc, future: [] }
}

export function undo(history: History): History {
  const previous = history.past.at(-1)
  if (!previous) return history
  return { past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future] }
}

export function redo(history: History): History {
  const [next, ...future] = history.future
  if (!next) return history
  return { past: [...history.past, history.present], present: next, future }
}

// ---------- Small helpers ----------

/** Same-origin bytes of one of the owner's images, so the export canvas isn't tainted (see the layer-image route). */
export const layerImageUrl = (assetId: string) => `/api/content/layer-image?id=${encodeURIComponent(assetId)}`

/** The localStorage key of an unsaved edit of one slide image. */
export const layerDraftKey = (assetId: string) => `carousely:layers:${assetId}`

/** A short id unique within a doc. */
export const newLayerId = (doc: LayerDoc) => {
  const taken = new Set(doc.layers.map((layer) => layer.id))
  let index = doc.layers.length + 1
  while (taken.has(`l${index}`)) index++
  return `l${index}`
}

/** A doc with no layers over a background of the given size. */
export const emptyDoc = (width: number, height: number): LayerDoc => ({ v: 1, width, height, layers: [] })

/** A new text layer centred on the canvas, a third of its width tall-ish. */
export function newTextLayer(doc: LayerDoc, text: string, font: FontName, color = '#FFFFFF'): TextLayer {
  const size = Math.round(doc.width * 0.06)
  const w = Math.round(doc.width * 0.7)
  const lineHeight = 1.2
  return {
    id: newLayerId(doc), kind: 'text', text, font, size, weight: 700, color, align: 'center', lineHeight,
    x: Math.round((doc.width - w) / 2), y: Math.round(doc.height / 2 - size * lineHeight / 2), w, h: Math.round(size * lineHeight),
  }
}

/** A new image layer of natural size `width`×`height`, fitted to a quarter of the canvas width and centred. */
export function newImageLayer(doc: LayerDoc, assetId: string, role: ImageRole, width: number, height: number): ImageLayer {
  const w = Math.round(Math.min(doc.width * (role === 'logo' ? 0.22 : 0.4), width))
  const h = Math.round((w * height) / Math.max(1, width))
  return { id: newLayerId(doc), kind: 'image', assetId, role, x: Math.round((doc.width - w) / 2), y: Math.round((doc.height - h) / 2), w, h }
}
