import { describe, expect, it } from 'vitest'
import type { ImageLayer, LayerDoc, TextLayer } from '@/lib/layer-doc'
import { addStop, removeStop, sampleGradient, updateStop } from './layer-editor-gradient'
import { cropHandle } from './layer-editor-crop-math'
import { placeBackgroundSplit, placeLayerSplit, type SplitResult } from './layer-editor-split-place'

const A = '11111111-1111-4111-8111-111111111111'
const text: TextLayer = { id: 'l1', kind: 'text', x: 0, y: 0, w: 400, h: 100, text: 'Hi', font: 'Inter', size: 40, weight: 700,
  color: '#FFFFFF', align: 'left', lineHeight: 1.2 }
const photo: ImageLayer = { id: 'l2', kind: 'image', assetId: A, role: 'upload', x: 100, y: 200, w: 500, h: 250 }
const doc: LayerDoc = { v: 1, width: 1080, height: 1350, layers: [photo, text] }
const result = (box: SplitResult['object']['box'], width = 1000, height = 500): SplitResult => ({
  object: { assetId: 'obj', width: box.w, height: box.h, box },
  cleaned: { assetId: 'clean', width, height },
})

describe('placeBackgroundSplit', () => {
  it('puts the object at its own box, under every layer', () => {
    const placed = placeBackgroundSplit(doc, result({ x: 10, y: 20, w: 300, h: 400 }, 1080, 1350))
    expect(placed?.doc.layers[0]).toMatchObject({ kind: 'image', role: 'object', assetId: 'obj', x: 10, y: 20, w: 300, h: 400 })
    expect(placed?.doc.layers.slice(1)).toEqual(doc.layers)
  })
})

describe('placeLayerSplit', () => {
  it('swaps the source for the cleaned image and maps the object through a stretched layer', () => {
    // The 1000×500 source drawn at 500×250: half size.
    const placed = placeLayerSplit(doc, 'l2', result({ x: 200, y: 100, w: 400, h: 200 }))!
    expect(placed.doc.layers.map((layer) => layer.id)).toEqual(['l2', placed.layer.id, 'l1'])
    expect(placed.doc.layers[0]).toMatchObject({ assetId: 'clean', x: 100, y: 200, w: 500, h: 250 })
    expect(placed.layer).toMatchObject({ x: 200, y: 250, w: 200, h: 100 })
    expect(placed.layer.crop).toBeUndefined()
  })

  it('maps through the crop and crops an object reaching past it', () => {
    const cropped: ImageLayer = { ...photo, crop: { x: 0.5, y: 0, w: 0.5, h: 1 } }
    const placed = placeLayerSplit({ ...doc, layers: [cropped] }, 'l2', result({ x: 400, y: 0, w: 200, h: 500 }))!
    // Visible part: source x 500..600 of the object's 400..600 → the frame's left 100 px.
    expect(placed.layer).toMatchObject({ x: 100, y: 200, w: 100, h: 250 })
    expect(placed.layer.crop).toEqual({ x: 0.5, y: 0, w: 0.5, h: 1 })
  })

  it('turns the object with a rotated layer, about the layer centre', () => {
    const turned: ImageLayer = { ...photo, rotation: 180 }
    const placed = placeLayerSplit({ ...doc, layers: [turned] }, 'l2', result({ x: 0, y: 0, w: 200, h: 100 }))!
    // Top-left of the frame turned half round about (350, 325) lands bottom-right.
    expect(placed.layer.rotation).toBe(180)
    expect(placed.layer.x + placed.layer.w / 2).toBeCloseTo(550)
    expect(placed.layer.y + placed.layer.h / 2).toBeCloseTo(425)
  })

  it('refuses a missing layer', () => {
    expect(placeLayerSplit(doc, 'nope', result({ x: 0, y: 0, w: 10, h: 10 }))).toBeNull()
  })
})

describe('gradient stops', () => {
  const gradient = { kind: 'linear' as const, angle: 90, stops: [
    { offset: 0, color: '#000000', alpha: 1 }, { offset: 1, color: '#FFFFFF', alpha: 0 }] }

  it('adds a stop in the widest gap, coloured as the gradient is there', () => {
    const added = addStop(gradient)
    expect(added.index).toBe(1)
    expect(added.gradient.stops[1]).toEqual({ offset: 0.5, color: '#808080', alpha: 0.5 })
    expect(sampleGradient(gradient, 0.25).color).toBe('#404040')
  })

  it('keeps stops ordered when one is dragged past another, and at least two', () => {
    const three = addStop(gradient).gradient
    const moved = updateStop(three, 0, { offset: 0.7 })
    expect(moved.index).toBe(1)
    expect(moved.gradient.stops.map((stop) => stop.offset)).toEqual([0.5, 0.7, 1])
    expect(updateStop(three, 2, { offset: 1.4 }).gradient.stops[2].offset).toBe(1)
    expect(removeStop(gradient, 0)).toBe(gradient)
    expect(removeStop(addStop(gradient).gradient, 1).stops).toHaveLength(2)
  })
})

describe('cropHandle', () => {
  it('crops both sides from a corner and keeps the picture in place', () => {
    const next = cropHandle(photo, 'se', -100, -50)
    expect(next).toMatchObject({ x: 100, y: 200, w: 400, h: 200 })
    expect(next.crop).toEqual({ x: 0, y: 0, w: 0.8, h: 0.8 })
  })
})
