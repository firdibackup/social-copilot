/**
 * The editor's pure steps on top of layer-doc: what a drag, a resize handle or an arrow key does to one layer, and
 * how edits land in the undo history. No DOM, so it is tested on its own.
 */
import {
  clampBox, commit, HANDLES, LAYER_LIMITS, parseLayerDoc, resizeBox, snapBox,
  type Box, type Canvas, type Handle, type History, type ImageCrop, type ImageLayer, type Layer, type LayerDoc, type SnapResult,
} from '@/lib/layer-doc'

export type Guides = SnapResult['guides']
export const NO_GUIDES: Guides = { vertical: [], horizontal: [] }

/** A text box grows with its lines, so only its width and its corners (which scale the type) can be dragged. */
export const handlesFor = (layer: Layer): readonly Handle[] =>
  layer.kind === 'text' ? HANDLES.filter((handle) => handle !== 'n' && handle !== 's') : HANDLES

/** A dragged layer: snapped to the canvas and the other layers, then kept grabbable on the canvas. */
export function moveLayer<T extends Layer>(
  start: T, dx: number, dy: number, canvas: Canvas, others: Omit<Box, 'id'>[], tolerance: number,
): { layer: T; guides: Guides } {
  if (start.locked) return { layer: start, guides: NO_GUIDES }
  const moved = { ...start, x: start.x + dx, y: start.y + dy }
  const snap = snapBox(moved, canvas, others, tolerance)
  const layer = clampBox({ ...moved, x: snap.x, y: snap.y }, canvas)
  // A guide is only true while the clamp left that axis where the snap put it.
  return {
    layer,
    guides: {
      vertical: layer.x === snap.x ? snap.guides.vertical : [],
      horizontal: layer.y === snap.y ? snap.guides.horizontal : [],
    },
  }
}

export interface ResizeOptions {
  /**
   * Shift held: an image corner stretches freely instead of keeping its proportions, and an image side stretches
   * that one side instead of cropping. No effect on text, shapes or paths.
   */
  free?: boolean
}

/**
 * A layer after dragging `handle` by (dx, dy) canvas px, in the layer's own (unrotated) frame. An image corner keeps
 * its proportions (free with `options.free`); an image side crops (see cropImageSide), or stretches with `free`. A
 * text corner scales the box and the font size together; a text side changes only the width (the lines rewrap).
 */
export function resizeLayer(start: Layer, handle: Handle, dx: number, dy: number, options: ResizeOptions = {}): Layer {
  if (start.locked) return start
  if (start.kind === 'shape' || start.kind === 'path' || start.kind === 'frame') return resizeBox(start, handle, dx, dy, false)
  if (start.kind === 'image') {
    if (handle.length === 2) return resizeBox(start, handle, dx, dy, !options.free)
    return options.free ? resizeBox(start, handle, dx, dy, false) : cropImageSide(start, handle, dx, dy)
  }
  if (handle.length === 1) return resizeBox(start, handle, dx, 0, false)
  const nominal = resizeBox(start, handle, dx, dy, true)
  const { min, max } = LAYER_LIMITS.size
  const size = Math.min(max, Math.max(min, Math.round(start.size * (nominal.w / start.w) * 10) / 10))
  const factor = size / start.size
  const w = start.w * factor
  const h = start.h * factor
  return {
    ...start,
    size,
    w,
    h,
    x: handle.includes('w') ? start.x + start.w - w : start.x,
    y: handle.includes('n') ? start.y + start.h - h : start.y,
  }
}

/**
 * Keep the opposite handle stationary when resizing a rotated element. (dx, dy) are canvas px; `options` as for
 * resizeLayer (Shift → `{ free: true }`).
 */
export function resizeRotatedLayer(start: Layer, handle: Handle, dx: number, dy: number, options: ResizeOptions = {}): Layer {
  const local = toLocalDelta(start, dx, dy)
  return placeInFrame(start, resizeLayer(start, handle, local.x, local.y, options))
}

/** A canvas-px delta in the layer's own, unrotated frame. */
function toLocalDelta(layer: Pick<Layer, 'rotation'>, dx: number, dy: number): { x: number; y: number } {
  const angle = (layer.rotation ?? 0) * Math.PI / 180
  return { x: dx * Math.cos(angle) + dy * Math.sin(angle), y: -dx * Math.sin(angle) + dy * Math.cos(angle) }
}

/**
 * `next`, whose box was worked out in `start`'s unrotated frame, placed back on the canvas: its centre is turned
 * about `start`'s centre by the rotation, so whatever stayed put in the frame stays put on screen.
 */
function placeInFrame<T extends Layer>(start: Layer, next: T): T {
  const angle = (start.rotation ?? 0) * Math.PI / 180
  if (!angle) return next
  const cx = next.x + next.w / 2 - start.x - start.w / 2
  const cy = next.y + next.h / 2 - start.y - start.h / 2
  return { ...next, x: next.x + cx * Math.cos(angle) - cy * Math.sin(angle) - cx,
    y: next.y + cx * Math.sin(angle) + cy * Math.cos(angle) - cy }
}

// ---------- Rotate ----------

/** Degrees within which a free rotation settles on a multiple of 45°, and the step Shift rotates in. */
export const ROTATE_SNAP = { near: 3, quarter: 45, step: 15 }

interface Point { x: number; y: number }

/**
 * The layer's rotation after its rotate handle was dragged from `from` to `to` (any one coordinate space, e.g.
 * screen px) about the layer's centre: the start angle plus the turn of the pointer's bearing. In whole degrees
 * within (-180, 180]; near a multiple of 45° it settles on it, and `step` (Shift) keeps to multiples of 15°.
 */
export function rotationFromDrag(start: number, centre: Point, from: Point, to: Point, step = false): number {
  const bearing = (point: Point) => Math.atan2(point.y - centre.y, point.x - centre.x) * 180 / Math.PI
  let angle = start + bearing(to) - bearing(from)
  if (step) angle = Math.round(angle / ROTATE_SNAP.step) * ROTATE_SNAP.step
  else {
    const quarter = Math.round(angle / ROTATE_SNAP.quarter) * ROTATE_SNAP.quarter
    if (Math.abs(angle - quarter) <= ROTATE_SNAP.near) angle = quarter
  }
  angle = Math.round(angle) % 360
  if (angle > 180) angle -= 360
  if (angle <= -180) angle += 360
  return angle === 0 ? 0 : angle
}

/** The layer turned to `rotation` degrees; 0 drops the property, so an unrotated layer equals one never rotated. */
export function withRotation<T extends Layer>(layer: T, rotation: number): T {
  const next = { ...layer }
  if (rotation) next.rotation = rotation
  else delete next.rotation
  return next
}

// ---------- Image crop ----------

const FULL_CROP: ImageCrop = { x: 0, y: 0, w: 1, h: 1 }
const CROP_SNAP = 1e-6

/** The layer's crop, or the whole image. */
export const cropOf = (layer: Pick<ImageLayer, 'crop'>): ImageCrop => layer.crop ?? FULL_CROP

/** A crop kept inside the source (float error clamped); undefined when it is the whole image. */
function tidyCrop(crop: ImageCrop): ImageCrop | undefined {
  const min = LAYER_LIMITS.crop.min
  const w = Math.min(1, Math.max(min, crop.w))
  const h = Math.min(1, Math.max(min, crop.h))
  const x = Math.min(1 - w, Math.max(0, crop.x))
  const y = Math.min(1 - h, Math.max(0, crop.y))
  const snap = (value: number, to: number) => (Math.abs(value - to) < CROP_SNAP ? to : value)
  const tidy = { x: snap(x, 0), y: snap(y, 0), w: snap(w, 1), h: snap(h, 1) }
  return tidy.x === 0 && tidy.y === 0 && tidy.w === 1 && tidy.h === 1 ? undefined : tidy
}

/** The image layer with `crop` (tidied; dropped when it is the whole image). */
function withCrop<T extends ImageLayer>(layer: T, crop: ImageCrop): T {
  const tidy = tidyCrop(crop)
  const next: T = { ...layer }
  delete next.crop
  return tidy ? { ...next, crop: tidy } : next
}

/**
 * The whole, uncropped source image in canvas px, in the layer's own unrotated frame (draw it rotated about the
 * layer's centre like the layer itself): the ghost shown around the frame while cropping.
 */
export function imageFullRect(layer: Pick<ImageLayer, 'x' | 'y' | 'w' | 'h' | 'crop'>): Omit<Box, 'id'> {
  const crop = cropOf(layer)
  const w = layer.w / crop.w
  const h = layer.h / crop.h
  return { x: layer.x - crop.x * w, y: layer.y - crop.y * h, w, h }
}

/**
 * A side handle of an image dragged by (dx, dy) canvas px in the layer's unrotated frame: the edge moves and the
 * crop follows, so the picture stays where it is at the same scale. It stops at the image's own edge (never crops
 * past the source) and at LAYER_LIMITS.minBox / LAYER_LIMITS.crop.min. Corner handles fall back to resizeBox.
 */
export function cropImageSide<T extends ImageLayer>(start: T, handle: Handle, dx: number, dy: number): T {
  if (start.locked) return start
  if (handle.length !== 1) return resizeBox(start, handle, dx, dy, true)
  const crop = cropOf(start)
  // Canvas px per whole source image, per axis.
  const scaleX = start.w / crop.w
  const scaleY = start.h / crop.h
  const horizontal = handle === 'e' || handle === 'w'
  const scale = horizontal ? scaleX : scaleY
  const size = horizontal ? start.w : start.h
  const lowEdge = horizontal ? crop.x : crop.y
  const span = horizontal ? crop.w : crop.h
  const grows = handle === 'e' || handle === 's'
  const delta = horizontal ? (grows ? dx : -dx) : (grows ? dy : -dy)
  // Room in the source beyond the moving edge, in px.
  const room = (grows ? 1 - lowEdge - span : lowEdge) * scale
  const floor = Math.min(size, Math.max(LAYER_LIMITS.minBox, LAYER_LIMITS.crop.min * scale))
  const next = Math.min(size + room, Math.max(floor, size + delta))
  const nextSpan = next / scale
  const nextLow = grows ? lowEdge : lowEdge + span - nextSpan
  if (horizontal) {
    return withCrop({ ...start, w: next, x: grows ? start.x : start.x + start.w - next }, { ...crop, x: nextLow, w: nextSpan })
  }
  return withCrop({ ...start, h: next, y: grows ? start.y : start.y + start.h - next }, { ...crop, y: nextLow, h: nextSpan })
}

/**
 * The crop that shows the whole source image at `rect` (canvas px, the layer's unrotated frame, as imageFullRect
 * gives it) behind the unchanged frame. The image is kept covering the frame: grown to at least the frame's size
 * (and at most frame / LAYER_LIMITS.crop.min), and slid so no edge comes inside the frame.
 */
export function cropFromImageRect<T extends ImageLayer>(layer: T, rect: Omit<Box, 'id'>): T {
  if (layer.locked) return layer
  const min = LAYER_LIMITS.crop.min
  const w = Math.min(layer.w / min, Math.max(layer.w, rect.w))
  const h = Math.min(layer.h / min, Math.max(layer.h, rect.h))
  const x = Math.min(layer.x, Math.max(layer.x + layer.w - w, rect.x))
  const y = Math.min(layer.y, Math.max(layer.y + layer.h - h, rect.y))
  return withCrop(layer, { x: (layer.x - x) / w, y: (layer.y - y) / h, w: layer.w / w, h: layer.h / h })
}

/**
 * Crop mode: the picture slid by (dx, dy) canvas px behind the fixed frame (rotation taken into account), stopping
 * where an image edge would come inside the frame.
 */
export function panCrop<T extends ImageLayer>(layer: T, dx: number, dy: number): T {
  const local = toLocalDelta(layer, dx, dy)
  const full = imageFullRect(layer)
  return cropFromImageRect(layer, { ...full, x: full.x + local.x, y: full.y + local.y })
}

/**
 * Crop mode: the picture scaled by `factor` (> 1 zooms in, showing less) about `anchor` (canvas px; default the
 * frame's centre), which stays put. The frame doesn't move. Zooming out stops once the image just covers the frame,
 * zooming in at LAYER_LIMITS.crop.min of the source.
 */
export function zoomCrop<T extends ImageLayer>(layer: T, factor: number, anchor?: { x: number; y: number }): T {
  if (layer.locked || !Number.isFinite(factor) || factor <= 0) return layer
  const crop = cropOf(layer)
  const min = LAYER_LIMITS.crop.min
  const scale = Math.min(Math.min(crop.w, crop.h) / min, Math.max(Math.max(crop.w, crop.h), factor))
  const cx = layer.x + layer.w / 2
  const cy = layer.y + layer.h / 2
  let ax = layer.w / 2
  let ay = layer.h / 2
  if (anchor) {
    const local = toLocalDelta(layer, anchor.x - cx, anchor.y - cy)
    ax = local.x + layer.w / 2
    ay = local.y + layer.h / 2
  }
  const full = imageFullRect(layer)
  const ox = layer.x + ax
  const oy = layer.y + ay
  return cropFromImageRect(layer, { x: ox - (ox - full.x) * scale, y: oy - (oy - full.y) * scale, w: full.w * scale, h: full.h * scale })
}

/**
 * The crop undone without moving the picture: the frame grows to the whole image at its current scale (rotation
 * kept about the right point), so nothing on screen jumps. The same layer when it isn't cropped.
 */
export function resetCrop<T extends ImageLayer>(layer: T): T {
  if (layer.locked || !layer.crop) return layer
  return placeInFrame(layer, withCrop({ ...layer, ...imageFullRect(layer) }, FULL_CROP))
}

/** An arrow key's move, kept on the canvas like a drag. */
export const nudgeLayer = <T extends Layer>(layer: T, dx: number, dy: number, canvas: Canvas): T =>
  layer.locked ? layer : clampBox({ ...layer, x: layer.x + dx, y: layer.y + dy }, canvas)

export const replaceLayer = (doc: LayerDoc, layer: Layer): LayerDoc =>
  ({ ...doc, layers: doc.layers.map((item) => (item.id === layer.id ? layer : item)) })

export const updateLayer = (doc: LayerDoc, id: string, change: (layer: Layer) => Layer): LayerDoc =>
  ({ ...doc, layers: doc.layers.map((item) => (item.id === id ? change(item) : item)) })

export const addLayer = (doc: LayerDoc, layer: Layer): LayerDoc => ({ ...doc, layers: [...doc.layers, layer] })

export const removeLayer = (doc: LayerDoc, id: string): LayerDoc =>
  ({ ...doc, layers: doc.layers.filter((item) => item.id !== id) })

/**
 * Every text box at the height its lines need (`heightOf`, from layoutText). The same doc comes back when nothing
 * changed, so commit can tell that no step happened.
 */
export function fitTextHeights(doc: LayerDoc, heightOf: (layer: Extract<Layer, { kind: 'text' }>) => number): LayerDoc {
  let changed = false
  const layers = doc.layers.map((layer) => {
    if (layer.kind !== 'text' || layer.locked) return layer
    const h = Math.min(doc.height * 4, Math.max(1, heightOf(layer)))
    if (Math.abs(h - layer.h) < 0.01) return layer
    changed = true
    return { ...layer, h }
  })
  return changed ? { ...doc, layers } : doc
}

/**
 * One edit into the history. `amend` (more typing, the same colour being dragged, more arrow presses) replaces
 * the step it continues instead of adding one, so undo goes back past the whole burst.
 */
export function editStep(history: History, doc: LayerDoc, amend: boolean): History {
  if (doc === history.present) return history
  if (amend && history.past.length > 0) return { ...history, present: doc, future: [] }
  return commit(history, doc)
}

/** The edit bursts that amend: the same key within this many ms. */
export const AMEND_MS = 1000

/** A draft from localStorage worth offering: valid, for this canvas, and different from what is stored. */
export function readDraft(raw: string | null, current: LayerDoc): LayerDoc | null {
  if (!raw) return null
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  const parsed = parseLayerDoc(value && typeof value === 'object' && 'doc' in value ? value.doc : value)
  if ('error' in parsed) return null
  const { doc } = parsed
  if (doc.width !== current.width || doc.height !== current.height) return null
  return sameDoc(doc, current) ? null : doc
}

/**
 * Whether two docs are the same edit, whatever order their keys came in. A text box's height follows its lines
 * (and so the fonts loaded so far), so it isn't compared.
 */
export function sameDoc(a: LayerDoc, b: LayerDoc): boolean {
  const canonical = (doc: LayerDoc) => {
    const parsed = parseLayerDoc(doc)
    const layers = ('doc' in parsed ? parsed.doc : doc).layers.map((layer) => (layer.kind === 'text' ? { ...layer, h: 0 } : layer))
    return JSON.stringify({ width: doc.width, height: doc.height, layers })
  }
  return a === b || canonical(a) === canonical(b)
}
