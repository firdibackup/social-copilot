import { describe, expect, it } from 'vitest'
import { LAYER_LIMITS, type LayerDoc, type ShapeLayer } from '@/lib/layer-doc'
import {
  clampZoom, comboTitle, comboTokens, pasteLayer, scrollToKeep, shortcutFor, slidePointAt, wheelZoomFactor, zoomStep,
  type KeyInput,
} from './layer-editor-shortcuts'

const press = (key: string, extra: Partial<KeyInput> = {}): KeyInput => ({
  key,
  code: /^[a-z]$/i.test(key) ? `Key${key.toUpperCase()}` : /^\d$/.test(key) ? `Digit${key}` : key,
  metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...extra,
})

describe('shortcutFor', () => {
  it('reads ⌘ and Ctrl alike for zoom, undo and the clipboard', () => {
    expect(shortcutFor(press('=', { code: 'Equal', metaKey: true }))).toEqual({ kind: 'zoom', to: 'in' })
    expect(shortcutFor(press('+', { code: 'Equal', ctrlKey: true, shiftKey: true }))).toEqual({ kind: 'zoom', to: 'in' })
    expect(shortcutFor(press('-', { code: 'Minus', ctrlKey: true }))).toEqual({ kind: 'zoom', to: 'out' })
    expect(shortcutFor(press('0', { metaKey: true }))).toEqual({ kind: 'zoom', to: 'actual' })
    expect(shortcutFor(press('z', { ctrlKey: true }))).toEqual({ kind: 'undo' })
    expect(shortcutFor(press('Z', { metaKey: true, shiftKey: true }))).toEqual({ kind: 'redo' })
    expect(shortcutFor(press('y', { ctrlKey: true }))).toEqual({ kind: 'redo' })
    expect(shortcutFor(press('c', { metaKey: true }))).toEqual({ kind: 'copy' })
    expect(shortcutFor(press('x', { metaKey: true }))).toEqual({ kind: 'cut' })
    expect(shortcutFor(press('v', { ctrlKey: true }))).toEqual({ kind: 'paste' })
    expect(shortcutFor(press('d', { ctrlKey: true }))).toEqual({ kind: 'duplicate' })
  })

  it('reads ⌥ combos by physical key, since ⌥ changes the character on a Mac', () => {
    expect(shortcutFor(press('º', { code: 'Digit0', metaKey: true, altKey: true }))).toEqual({ kind: 'zoom', to: 'fit' })
    expect(shortcutFor(press(')', { code: 'Digit0', metaKey: true, shiftKey: true }))).toEqual({ kind: 'zoom', to: 'fill' })
    expect(shortcutFor(press('‘', { code: 'BracketRight', metaKey: true, altKey: true }))).toEqual({ kind: 'reorder', to: 'front' })
    expect(shortcutFor(press('“', { code: 'BracketLeft', metaKey: true, altKey: true }))).toEqual({ kind: 'reorder', to: 'back' })
    expect(shortcutFor(press(']', { code: 'BracketRight', ctrlKey: true }))).toEqual({ kind: 'reorder', to: 'forward' })
    expect(shortcutFor(press('[', { code: 'BracketLeft', ctrlKey: true }))).toEqual({ kind: 'reorder', to: 'backward' })
    expect(shortcutFor(press('¬', { code: 'KeyL', altKey: true, shiftKey: true }))).toEqual({ kind: 'lock' })
  })

  it('nudges 1 px, or 10 px with Shift', () => {
    expect(shortcutFor(press('ArrowLeft'))).toEqual({ kind: 'nudge', dx: -1, dy: 0 })
    expect(shortcutFor(press('ArrowDown', { shiftKey: true }))).toEqual({ kind: 'nudge', dx: 0, dy: 10 })
  })

  it('adds text and shapes from single letters, and opens the list', () => {
    expect(shortcutFor(press('t'))).toEqual({ kind: 'add', what: 'text' })
    expect(shortcutFor(press('R'))).toEqual({ kind: 'add', what: 'rect' })
    expect(shortcutFor(press('c'))).toEqual({ kind: 'add', what: 'ellipse' })
    expect(shortcutFor(press('l'))).toEqual({ kind: 'add', what: 'line' })
    expect(shortcutFor(press('?', { code: 'Slash', shiftKey: true }))).toEqual({ kind: 'help' })
    expect(shortcutFor(press('/', { code: 'Slash', metaKey: true }))).toEqual({ kind: 'help' })
    expect(shortcutFor(press('!', { code: 'Digit1', shiftKey: true }))).toEqual({ kind: 'zoom', to: 'fit' })
  })

  it('leaves the browser its own combos and lets typing through except zoom', () => {
    expect(shortcutFor(press('t', { shiftKey: true }))).toBeNull()
    expect(shortcutFor(press('t', { metaKey: true }))).toBeNull()
    expect(shortcutFor(press('c', { metaKey: true, shiftKey: true }))).toBeNull()
    expect(shortcutFor(press('Backspace'), true)).toBeNull()
    expect(shortcutFor(press('t'), true)).toBeNull()
    expect(shortcutFor(press('c', { metaKey: true }), true)).toBeNull()
    expect(shortcutFor(press('=', { code: 'Equal', metaKey: true }), true)).toEqual({ kind: 'zoom', to: 'in' })
  })
})

describe('zoom', () => {
  it('steps through the presets and snaps from between them', () => {
    expect(zoomStep(1, 1)).toBe(1.25)
    expect(zoomStep(1, -1)).toBe(0.75)
    expect(zoomStep(0.6, 1)).toBe(0.75)
    expect(zoomStep(0.6, -1)).toBe(0.5)
    expect(zoomStep(5, 1)).toBe(5)
    expect(zoomStep(0.1, -1)).toBe(0.1)
  })

  it('clamps to 10%–500%, but never above a smaller fit', () => {
    expect(clampZoom(9)).toBe(5)
    expect(clampZoom(0.01)).toBe(0.1)
    expect(clampZoom(0.01, 0.05)).toBe(0.05)
  })

  it('scales smoothly with the wheel and caps a mouse notch', () => {
    expect(wheelZoomFactor(-10)).toBeCloseTo(Math.exp(0.1))
    expect(wheelZoomFactor(10)).toBeLessThan(1)
    expect(wheelZoomFactor(-1000)).toBeCloseTo(wheelZoomFactor(-25))
    expect(wheelZoomFactor(-3, 1)).toBeCloseTo(wheelZoomFactor(-25))
  })

  it('keeps the slide point under the cursor across a zoom', () => {
    const viewport = 800
    const size = 1080
    // At 50% the slide is 540 px wide, centred: its edge sits at 130 px.
    const point = slidePointAt(0, 400, viewport, size, 0.5)
    expect(point).toBeCloseTo(540)
    // At 200% it's 2160 px plus the gutter; the scroll that keeps x=540 under 400 px.
    const scroll = scrollToKeep(point, 400, viewport, size, 2)
    expect(slidePointAt(scroll, 400, viewport, size, 2)).toBeCloseTo(540)
    expect(scroll).toBeCloseTo(540 * 2 + 20 - 400)
  })
})

describe('pasteLayer', () => {
  const shape: ShapeLayer = { id: 'l1', kind: 'shape', shape: 'rect', color: '#000000', radius: 0, strokeColor: '#000000', strokeWidth: 0,
    x: 100, y: 100, w: 200, h: 200, locked: true }
  const doc: LayerDoc = { v: 1, width: 1080, height: 1350, layers: [shape] }

  it('adds an unlocked copy on top, 20 px down and right, with a fresh id', () => {
    const result = pasteLayer(doc, shape)
    expect(result?.layer).toMatchObject({ x: 120, y: 120, locked: false })
    expect(result?.layer.id).not.toBe('l1')
    expect(result?.doc.layers.at(-1)).toBe(result?.layer)
  })

  it('works on another slide and refuses a full one', () => {
    expect(pasteLayer({ ...doc, layers: [] }, shape)?.doc.layers).toHaveLength(1)
    const layers = Array.from({ length: LAYER_LIMITS.layers }, (_, index) => ({ ...shape, id: `l${index + 1}` }))
    expect(pasteLayer({ ...doc, layers }, shape)).toBeNull()
  })
})

describe('combo labels', () => {
  it('writes modifiers per platform', () => {
    expect(comboTokens(['shift', 'mod', 'Z'], true)).toEqual(['⇧', '⌘', 'Z'])
    expect(comboTokens(['shift', 'mod', 'Z'], false)).toEqual(['Ctrl', 'Shift', 'Z'])
    expect(comboTitle(['alt', 'mod', '0'], true)).toBe('⌥⌘0')
    expect(comboTitle(['alt', 'mod', '0'], false)).toBe('Ctrl+Alt+0')
  })
})
