/**
 * The editor's pure steps on top of layer-doc: what a drag, a resize handle or an arrow key does to one layer, and
 * how edits land in the undo history. No DOM, so it is tested on its own.
 */
import {
  clampBox, commit, HANDLES, LAYER_LIMITS, parseLayerDoc, resizeBox, snapBox,
  type Box, type Canvas, type Handle, type History, type Layer, type LayerDoc, type SnapResult,
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

/**
 * A layer after dragging `handle` by (dx, dy) canvas px. Images always keep their proportions. A text corner
 * scales the box and the font size together; a text side changes only the width (the lines rewrap).
 */
export function resizeLayer(start: Layer, handle: Handle, dx: number, dy: number): Layer {
  if (start.kind === 'image') return resizeBox(start, handle, dx, dy, true)
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

/** An arrow key's move, kept on the canvas like a drag. */
export const nudgeLayer = <T extends Layer>(layer: T, dx: number, dy: number, canvas: Canvas): T =>
  clampBox({ ...layer, x: layer.x + dx, y: layer.y + dy }, canvas)

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
    if (layer.kind !== 'text') return layer
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
  const parsed = parseLayerDoc(value)
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
