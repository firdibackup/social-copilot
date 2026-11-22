/**
 * Seleksi banyak lapisan: the pure rules behind Shift+click, the marquee and ⌘A, and what a selection of several
 * layers can do together (move, nudge, delete, duplicate). One layer keeps the single-selection code paths.
 */
import { clampBox, LAYER_LIMITS, newLayerId, type Layer, type LayerDoc } from '@/lib/layer-doc'

export interface Rect { x: number; y: number; w: number; h: number }

/** The upright box around a layer as it is drawn, rotation included. */
export function layerBounds(layer: Pick<Layer, 'x' | 'y' | 'w' | 'h' | 'rotation'>): Rect {
  const angle = (layer.rotation ?? 0) * Math.PI / 180
  const w = Math.abs(layer.w * Math.cos(angle)) + Math.abs(layer.h * Math.sin(angle))
  const h = Math.abs(layer.w * Math.sin(angle)) + Math.abs(layer.h * Math.cos(angle))
  return { x: layer.x + (layer.w - w) / 2, y: layer.y + (layer.h - h) / 2, w, h }
}

/** The rect between two corners, whichever way it was dragged. */
export const rectOf = (a: { x: number; y: number }, b: { x: number; y: number }): Rect =>
  ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) })

const touches = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

/** What a selection may hold: layers that are shown and not locked, as in Canva. */
export const selectable = (layer: Layer) => !layer.hidden && !layer.locked

/** The marquee's layers: every selectable one its rect touches, bottom to top. */
export function layersInRect(layers: Layer[], rect: Rect): string[] {
  return layers.filter((layer) => selectable(layer) && touches(layerBounds(layer), rect)).map((layer) => layer.id)
}

/** ⌘A: every selectable layer. */
export const allSelectable = (doc: LayerDoc): string[] => doc.layers.filter(selectable).map((layer) => layer.id)

/** Shift+click: in if it was out, out if it was in; the order is the order of selecting, the last one leads. */
export const toggleSelection = (selection: string[], id: string): string[] =>
  selection.includes(id) ? selection.filter((item) => item !== id) : [...selection, id]

/** `ids` without repeats and without layers that are gone, hidden or locked. */
export function cleanSelection(doc: LayerDoc, ids: string[]): string[] {
  const allowed = new Set(allSelectable(doc))
  return [...new Set(ids)].filter((id) => allowed.has(id))
}

/** The box around several layers, or null for none. */
export function selectionBounds(layers: Layer[]): Rect | null {
  if (layers.length === 0) return null
  const boxes = layers.map(layerBounds)
  const x = Math.min(...boxes.map((box) => box.x))
  const y = Math.min(...boxes.map((box) => box.y))
  return { x, y, w: Math.max(...boxes.map((box) => box.x + box.w)) - x, h: Math.max(...boxes.map((box) => box.y + box.h)) - y }
}

/**
 * Every selected layer moved by the same (dx, dy), so they keep their places relative to each other. The move stops
 * short where one of them would leave the canvas (clampBox): the delta all of them can take is used for all.
 */
export function moveLayers(doc: LayerDoc, ids: string[], dx: number, dy: number): LayerDoc {
  const picked = new Set(cleanSelection(doc, ids))
  const moving = doc.layers.filter((layer) => picked.has(layer.id))
  if (moving.length === 0 || (dx === 0 && dy === 0)) return doc
  // The smallest move any one layer allows, per axis.
  let mx = dx
  let my = dy
  for (const layer of moving) {
    const clamped = clampBox({ ...layer, x: layer.x + dx, y: layer.y + dy }, doc)
    const ax = clamped.x - layer.x
    const ay = clamped.y - layer.y
    if (Math.abs(ax) < Math.abs(mx)) mx = ax
    if (Math.abs(ay) < Math.abs(my)) my = ay
  }
  return { ...doc, layers: doc.layers.map((layer) => (picked.has(layer.id) ? { ...layer, x: layer.x + mx, y: layer.y + my } : layer)) }
}

export function removeLayers(doc: LayerDoc, ids: string[]): LayerDoc {
  const picked = new Set(cleanSelection(doc, ids))
  return picked.size === 0 ? doc : { ...doc, layers: doc.layers.filter((layer) => !picked.has(layer.id)) }
}

/**
 * A copy of every selected layer, 20 px down and right, each right above its source so the stacking order holds.
 * As many as still fit under the layer limit, lowest first. Returns the new ids, to select them.
 */
export function duplicateLayers(doc: LayerDoc, ids: string[]): { doc: LayerDoc; ids: string[] } {
  const picked = new Set(cleanSelection(doc, ids))
  const layers: Layer[] = []
  const made: Layer[] = []
  for (const layer of doc.layers) {
    layers.push(layer)
    if (!picked.has(layer.id) || doc.layers.length + made.length >= LAYER_LIMITS.layers) continue
    const copy = clampBox({ ...layer, id: newLayerId({ ...doc, layers: [...doc.layers, ...made] }), x: layer.x + 20, y: layer.y + 20 }, doc) as Layer
    layers.push(copy)
    made.push(copy)
  }
  return { doc: made.length ? { ...doc, layers } : doc, ids: made.map((layer) => layer.id) }
}
