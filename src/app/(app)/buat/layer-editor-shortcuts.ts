import { useSyncExternalStore } from 'react'
import { clampBox, LAYER_LIMITS, newLayerId, type Layer, type LayerDoc, type Reorder } from '@/lib/layer-doc'

// ---------- Zoom ----------

/** Canva's range: 10%–500%. A fit below 10% (a huge slide in a small window) is still allowed. */
export const ZOOM_MIN = 0.1
export const ZOOM_MAX = 5
/** The steps ⌘+ / ⌘− and the +/− buttons walk through. */
export const ZOOM_PRESETS = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 5] as const

export const clampZoom = (value: number, floor: number = ZOOM_MIN) =>
  Math.min(ZOOM_MAX, Math.max(Math.min(ZOOM_MIN, floor), value))

/** The next preset above (1) or below (-1) the current scale; a scale between presets snaps to the neighbour. */
export function zoomStep(scale: number, direction: 1 | -1): number {
  if (direction > 0) return ZOOM_PRESETS.find((preset) => preset > scale * 1.001) ?? ZOOM_MAX
  return [...ZOOM_PRESETS].reverse().find((preset) => preset < scale * 0.999) ?? Math.min(scale, ZOOM_MIN)
}

/**
 * How much one ⌘/Ctrl+wheel event (or a trackpad pinch, which browsers send as ctrl+wheel) scales the slide.
 * Smooth and proportional for a pinch's small deltas; one mouse notch is capped at about one preset step.
 */
export function wheelZoomFactor(deltaY: number, deltaMode = 0, pageHeight = 800): number {
  const pixels = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * pageHeight : deltaY
  return Math.exp(-Math.max(-25, Math.min(25, pixels)) * 0.01)
}

/** Where the slide's edge sits in the scroller's content: a 20 px gutter, or centred when it's smaller. */
export const slideOffset = (viewport: number, size: number, scale: number, gutter = 20) =>
  Math.max(gutter, (viewport - size * scale) / 2)

/** The slide coordinate (canvas px) under a point `screen` px into the scroller's viewport. */
export const slidePointAt = (scroll: number, screen: number, viewport: number, size: number, scale: number) =>
  (scroll + screen - slideOffset(viewport, size, scale)) / scale

/** The scroll position that puts slide coordinate `point` back under `screen` at the new scale. */
export const scrollToKeep = (point: number, screen: number, viewport: number, size: number, scale: number) =>
  point * scale + slideOffset(viewport, size, scale) - screen

// ---------- Keyboard ----------

export type ZoomTarget = 'in' | 'out' | 'actual' | 'fit' | 'fill'
export type AddKind = 'text' | 'rect' | 'ellipse' | 'line'

export type Shortcut =
  | { kind: 'zoom'; to: ZoomTarget }
  | { kind: 'undo' } | { kind: 'redo' }
  | { kind: 'duplicate' } | { kind: 'copy' } | { kind: 'cut' } | { kind: 'paste' } | { kind: 'selectTop' }
  | { kind: 'remove' }
  | { kind: 'nudge'; dx: number; dy: number }
  | { kind: 'reorder'; to: Reorder }
  | { kind: 'lock' }
  | { kind: 'add'; what: AddKind }
  | { kind: 'help' }

export interface KeyInput {
  key: string
  code: string
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}

/** Focus is in a field: letters, arrows and Delete belong to it. */
export function isTyping(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]'))
}

const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
const ADD_KEYS: Record<string, AddKind> = { t: 'text', r: 'rect', c: 'ellipse', l: 'line' }

/**
 * The editor action a key press means, Canva-style. ⌘ and Ctrl are the same on every platform. Digits and brackets
 * are read from `code`, since ⌥ on a Mac turns `key` into another character. While typing, only the ⌘/Ctrl zoom
 * keys count (they'd zoom the whole page otherwise).
 */
export function shortcutFor(event: KeyInput, typing = false): Shortcut | null {
  const mod = event.metaKey || event.ctrlKey
  const { code, shiftKey: shift, altKey: alt } = event
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key

  if (mod) {
    if (!alt && (code === 'Equal' || code === 'NumpadAdd' || key === '+' || key === '=')) return { kind: 'zoom', to: 'in' }
    if (!alt && (code === 'Minus' || code === 'NumpadSubtract' || key === '-')) return { kind: 'zoom', to: 'out' }
    if (code === 'Digit0' || code === 'Numpad0' || key === '0') return { kind: 'zoom', to: alt ? 'fit' : shift ? 'fill' : 'actual' }
  }
  if (typing) return null

  if (mod) {
    if (code === 'BracketRight') return { kind: 'reorder', to: alt ? 'front' : 'forward' }
    if (code === 'BracketLeft') return { kind: 'reorder', to: alt ? 'back' : 'backward' }
    if (code === 'Slash') return { kind: 'help' }
    if (alt) return null
    if (key === 'z') return { kind: shift ? 'redo' : 'undo' }
    if (shift) return null
    if (key === 'y') return { kind: 'redo' }
    if (key === 'd') return { kind: 'duplicate' }
    if (key === 'c') return { kind: 'copy' }
    if (key === 'x') return { kind: 'cut' }
    if (key === 'v') return { kind: 'paste' }
    if (key === 'a') return { kind: 'selectTop' }
    return null
  }

  if (alt && shift && code === 'KeyL') return { kind: 'lock' }
  if (alt) return null
  if (key === '?') return { kind: 'help' }
  if (shift && code === 'Digit1') return { kind: 'zoom', to: 'fit' }
  if (key === 'Delete' || key === 'Backspace') return { kind: 'remove' }
  const arrow = ARROWS[key]
  if (arrow) {
    const step = shift ? 10 : 1
    return { kind: 'nudge', dx: arrow[0] * step, dy: arrow[1] * step }
  }
  if (!shift && ADD_KEYS[key]) return { kind: 'add', what: ADD_KEYS[key] }
  return null
}

// ---------- Clipboard ----------

/**
 * The copied layer: kept for the whole editor session, so it pastes into another slide too. Not the system
 * clipboard, which can't hold a layer.
 */
let copied: Layer | null = null

export const copyLayer = (layer: Layer) => { copied = layer }
export const copiedLayer = () => copied

/**
 * The clipboard layer added on top, 20 px down and right of where it was copied (or last pasted), unlocked and with a
 * fresh id. Null when the doc is full. Each paste moves the clipboard along, so repeated pastes cascade.
 */
export function pasteLayer(doc: LayerDoc, layer: Layer): { doc: LayerDoc; layer: Layer } | null {
  if (doc.layers.length >= LAYER_LIMITS.layers) return null
  const pasted = clampBox({ ...layer, id: newLayerId(doc), x: layer.x + 20, y: layer.y + 20, locked: false }, doc) as Layer
  return { doc: { ...doc, layers: [...doc.layers, pasted] }, layer: pasted }
}

export function pasteCopied(doc: LayerDoc): { doc: LayerDoc; layer: Layer } | null {
  if (!copied) return null
  const result = pasteLayer(doc, copied)
  if (result) copied = result.layer
  return result
}

// ---------- Platform & help ----------

const noSubscribe = () => () => {}
const readMac = () => /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)

/** Whether to show ⌘ ⌥ ⇧ or Ctrl Alt Shift. False on the server, so the first render always matches. */
export const useIsMac = () => useSyncExternalStore(noSubscribe, readMac, () => false)

/** Modifier tokens in the order each platform writes them. */
const MAC_ORDER = ['alt', 'shift', 'mod']
const PC_ORDER = ['mod', 'alt', 'shift']
const MAC_SYMBOL: Record<string, string> = { mod: '⌘', shift: '⇧', alt: '⌥' }
const PC_NAME: Record<string, string> = { mod: 'Ctrl', shift: 'Shift', alt: 'Alt' }

/** The tokens of a combo with its modifiers spelled for the platform (`mod` → ⌘ or Ctrl); others unchanged. */
export function comboTokens(combo: readonly string[], mac: boolean): string[] {
  const order = mac ? MAC_ORDER : PC_ORDER
  const modifiers = order.filter((token) => combo.includes(token)).map((token) => (mac ? MAC_SYMBOL : PC_NAME)[token])
  return [...modifiers, ...combo.filter((token) => !order.includes(token))]
}

/** A short form for a tooltip, e.g. "⌘+" or "Ctrl++". */
export const comboTitle = (combo: readonly string[], mac: boolean) => comboTokens(combo, mac).join(mac ? '' : '+')

/** Words in combos that get a translated label (`layerEditor.shortcuts.keys.*`). */
export const WORD_KEYS = ['wheel', 'drag', 'space', 'arrows', 'delete', 'esc', 'tab', 'pinch', 'middleDrag'] as const
export type WordKey = (typeof WORD_KEYS)[number]

export const SHORTCUT_HELP = [
  { group: 'zoom', items: [
    { id: 'zoomIn', combos: [['mod', '+']] },
    { id: 'zoomOut', combos: [['mod', '-']] },
    { id: 'zoomWheel', combos: [['mod', 'wheel'], ['pinch']] },
    { id: 'zoomActual', combos: [['mod', '0']] },
    { id: 'zoomFit', combos: [['alt', 'mod', '0'], ['shift', '1']] },
    { id: 'zoomFill', combos: [['shift', 'mod', '0']] },
    { id: 'pan', combos: [['space', 'drag'], ['middleDrag']] },
  ] },
  { group: 'edit', items: [
    { id: 'undo', combos: [['mod', 'Z']] },
    { id: 'redo', combos: [['shift', 'mod', 'Z'], ['mod', 'Y']] },
    { id: 'copy', combos: [['mod', 'C']] },
    { id: 'cut', combos: [['mod', 'X']] },
    { id: 'paste', combos: [['mod', 'V']] },
    { id: 'duplicate', combos: [['mod', 'D']] },
    { id: 'remove', combos: [['delete']] },
    { id: 'nudge', combos: [['arrows'], ['shift', 'arrows']] },
    { id: 'lock', combos: [['alt', 'shift', 'L']] },
  ] },
  { group: 'select', items: [
    { id: 'selectTop', combos: [['mod', 'A']] },
    { id: 'nextLayer', combos: [['tab'], ['shift', 'tab']] },
    { id: 'deselect', combos: [['esc']] },
    { id: 'forward', combos: [['mod', ']']] },
    { id: 'backward', combos: [['mod', '[']] },
    { id: 'front', combos: [['alt', 'mod', ']']] },
    { id: 'back', combos: [['alt', 'mod', '[']] },
  ] },
  { group: 'add', items: [
    { id: 'addText', combos: [['T']] },
    { id: 'addRect', combos: [['R']] },
    { id: 'addEllipse', combos: [['C']] },
    { id: 'addLine', combos: [['L']] },
    { id: 'help', combos: [['?'], ['mod', '/']] },
  ] },
] as const
