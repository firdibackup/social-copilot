import { describe, expect, it } from 'vitest'
import { LAYER_LIMITS, parseLayerDoc, type Layer, type LayerDoc } from '@/lib/layer-doc'
import {
  allSelectable, cleanSelection, duplicateLayers, layerBounds, layersInRect, moveLayers, rectOf, removeLayers, selectionBounds, toggleSelection,
} from './layer-editor-select'

const shape = (id: string, x: number, y: number, extra: Partial<Layer> = {}): Layer =>
  ({ id, kind: 'shape', shape: 'rect', color: '#000000', radius: 0, strokeColor: '#000000', strokeWidth: 0, x, y, w: 100, h: 100, ...extra }) as Layer
const doc = (...layers: Layer[]): LayerDoc => ({ v: 1, width: 1000, height: 1000, layers })

describe('marquee', () => {
  const layers = [shape('a', 0, 0), shape('b', 300, 300), shape('c', 600, 600, { locked: true }), shape('d', 320, 320, { hidden: true })]

  it('takes every shown, unlocked layer the rect touches, whichever way it was dragged', () => {
    expect(layersInRect(layers, rectOf({ x: 350, y: 350 }, { x: 50, y: 50 }))).toEqual(['a', 'b'])
    expect(layersInRect(layers, rectOf({ x: 0, y: 0 }, { x: 1000, y: 1000 }))).toEqual(['a', 'b'])
    expect(layersInRect(layers, rectOf({ x: 150, y: 150 }, { x: 250, y: 250 }))).toEqual([])
  })

  it('measures a rotated layer by the box it is drawn in', () => {
    const turned = shape('r', 400, 400, { w: 200, h: 20, rotation: 90 })
    const bounds = layerBounds(turned)
    expect([bounds.x, bounds.y, bounds.w, bounds.h].map(Math.round)).toEqual([490, 310, 20, 200])
    // Outside the unrotated strip, inside the turned one.
    expect(layersInRect([turned], { x: 495, y: 320, w: 5, h: 5 })).toEqual(['r'])
    expect(layersInRect([turned], { x: 410, y: 405, w: 5, h: 5 })).toEqual([])
  })
})

describe('selection', () => {
  it('toggles with Shift+click and keeps the order of selecting', () => {
    expect(toggleSelection(['a'], 'b')).toEqual(['a', 'b'])
    expect(toggleSelection(['a', 'b'], 'a')).toEqual(['b'])
  })

  it('selects all but hidden and locked layers, and forgets ids that no longer qualify', () => {
    const value = doc(shape('a', 0, 0), shape('b', 0, 0, { locked: true }), shape('c', 0, 0, { hidden: true }), shape('d', 0, 0))
    expect(allSelectable(value)).toEqual(['a', 'd'])
    expect(cleanSelection(value, ['d', 'b', 'gone', 'd', 'a'])).toEqual(['d', 'a'])
  })

  it('bounds several layers together', () => {
    expect(selectionBounds([shape('a', 10, 20), shape('b', 300, 400)])).toEqual({ x: 10, y: 20, w: 390, h: 480 })
    expect(selectionBounds([])).toBeNull()
  })
})

describe('acting on several layers', () => {
  it('moves them by one delta and leaves the rest', () => {
    const moved = moveLayers(doc(shape('a', 100, 100), shape('b', 300, 300), shape('c', 500, 500)), ['a', 'b'], 30, -20)
    expect(moved.layers.map((layer) => [layer.x, layer.y])).toEqual([[130, 80], [330, 280], [500, 500]])
  })

  it('stops the whole group where one layer would leave the canvas, keeping their spacing', () => {
    // b can go 640 px right before only 40 px of it stays visible; a could go further.
    const moved = moveLayers(doc(shape('a', 0, 0), shape('b', 320, 0)), ['a', 'b'], 900, 0)
    expect(moved.layers.map((layer) => layer.x)).toEqual([640, 960])
    expect(moved.layers[1].x - moved.layers[0].x).toBe(320)
  })

  it('never moves a locked layer, and returns the same doc for no move', () => {
    const value = doc(shape('a', 0, 0), shape('b', 0, 0, { locked: true }))
    expect(moveLayers(value, ['a', 'b'], 10, 10).layers[1]).toBe(value.layers[1])
    expect(moveLayers(value, ['a'], 0, 0)).toBe(value)
  })

  it('removes the selected layers only', () => {
    const value = doc(shape('a', 0, 0), shape('b', 0, 0), shape('c', 0, 0, { locked: true }))
    expect(removeLayers(value, ['a', 'c']).layers.map((layer) => layer.id)).toEqual(['b', 'c'])
    expect(removeLayers(value, [])).toBe(value)
  })

  it('duplicates each layer right above its source with a fresh id', () => {
    const result = duplicateLayers(doc(shape('l1', 0, 0), shape('l2', 100, 100), shape('l3', 200, 200)), ['l1', 'l3'])
    expect(result.doc.layers.map((layer) => layer.id)).toEqual(['l1', 'l4', 'l2', 'l3', 'l5'])
    expect(result.ids).toEqual(['l4', 'l5'])
    expect(result.doc.layers[1]).toMatchObject({ x: 20, y: 20 })
    expect(parseLayerDoc(result.doc)).not.toHaveProperty('error')
  })

  it('duplicates only as many as fit under the layer limit', () => {
    const many = Array.from({ length: LAYER_LIMITS.layers - 1 }, (_, index) => shape(`l${index + 1}`, 0, 0))
    const result = duplicateLayers(doc(...many), ['l1', 'l2'])
    expect(result.ids).toHaveLength(1)
    expect(result.doc.layers).toHaveLength(LAYER_LIMITS.layers)
  })
})
