import { describe, expect, it } from 'vitest'
import { createHistory, parseLayerDoc, redo, undo, type ImageLayer, type LayerDoc, type TextLayer } from '@/lib/layer-doc'
import {
  editStep, fitTextHeights, handlesFor, imageFullRect, moveLayer, nudgeLayer, panCrop, readDraft, resetCrop, resizeLayer,
  resizeRotatedLayer, zoomCrop,
  rotationFromDrag, withRotation,
} from './layer-editor-gesture'

const ASSET = '11111111-1111-4111-8111-111111111111'
const canvas = { width: 1080, height: 1350 }
const text: TextLayer = {
  id: 't1', kind: 'text', x: 100, y: 100, w: 400, h: 120, text: 'Halo', font: 'Inter', size: 50, weight: 700,
  color: '#FFFFFF', align: 'left', lineHeight: 1.2,
}
const image: ImageLayer = { id: 'i1', kind: 'image', assetId: ASSET, role: 'logo', x: 10, y: 10, w: 200, h: 100 }
const doc: LayerDoc = { v: 1, width: 1080, height: 1350, layers: [text, image] }

describe('moveLayer', () => {
  it('snaps a box centre to the canvas centre and reports the guide', () => {
    // Centre lands at 538 → snaps to 540.
    const { layer, guides } = moveLayer(text, 238, 0, canvas, [], 6)
    expect(layer.x + layer.w / 2).toBe(540)
    expect(guides.vertical).toEqual([540])
  })

  it('keeps part of the box on the canvas and drops a guide the clamp moved off', () => {
    const { layer, guides } = moveLayer(text, -5000, 0, canvas, [], 6)
    expect(layer.x).toBe(40 - text.w)
    expect(guides.vertical).toEqual([])
  })
})

describe('resizeLayer', () => {
  it('preserves a rotated resize anchor and prevents edits to locked layers', () => {
    const shape = { id: 's1', kind: 'shape' as const, shape: 'rect' as const, x: 100, y: 100, w: 200, h: 80,
      rotation: 90, color: '#FFFFFF', strokeColor: '#000000', strokeWidth: 0, radius: 0 }
    const next = resizeRotatedLayer(shape, 'e', 0, 40)
    expect(next.w).toBeCloseTo(240)
    expect(next.x + next.w / 2).toBeCloseTo(200)
    expect(next.y + next.h / 2).toBeCloseTo(160)
    const locked = { ...image, locked: true }
    expect(resizeLayer(locked, 'e', 50, 0)).toBe(locked)
    expect(nudgeLayer(locked, 50, 0, canvas)).toBe(locked)
    expect(moveLayer(locked, 50, 0, canvas, [], 6).layer).toBe(locked)
  })
  it('keeps an image in proportion', () => {
    const next = resizeLayer(image, 'se', 100, 0)
    expect(next.w / next.h).toBeCloseTo(2)
    expect(next.w).toBe(300)
  })

  it('changes only the width of text from a side handle', () => {
    const next = resizeLayer(text, 'e', 50, 80) as TextLayer
    expect(next).toMatchObject({ w: 450, size: 50, x: 100 })
  })

  it('scales the text size with a corner, anchored on the opposite corner', () => {
    const next = resizeLayer(text, 'nw', -200, 0) as TextLayer
    expect(next.size).toBeCloseTo(75)
    expect(next.x + next.w).toBeCloseTo(text.x + text.w)
    expect(next.y + next.h).toBeCloseTo(text.y + text.h)
  })

  it('keeps the font size inside the limits', () => {
    expect((resizeLayer(text, 'se', -10_000, 0) as TextLayer).size).toBeGreaterThanOrEqual(12)
    expect((resizeLayer(text, 'se', 100_000, 0) as TextLayer).size).toBeLessThanOrEqual(400)
  })

  it('offers no top/bottom handles on text', () => {
    expect(handlesFor(text)).not.toContain('n')
    expect(handlesFor(image)).toHaveLength(8)
  })
})

describe('nudgeLayer', () => {
  it('moves and clamps', () => {
    expect(nudgeLayer(image, 10, -1, canvas)).toMatchObject({ x: 20, y: 9 })
    expect(nudgeLayer(image, 5000, 0, canvas).x).toBe(1080 - 40)
  })
})

describe('fitTextHeights', () => {
  it('grows text to its lines and returns the same doc when nothing changed', () => {
    const fitted = fitTextHeights(doc, () => 180)
    expect(fitted.layers[0].h).toBe(180)
    expect(fitted.layers[1]).toBe(image)
    expect(fitTextHeights(fitted, () => 180)).toBe(fitted)
  })
})

describe('editStep', () => {
  it('adds a step, or amends the last one during a burst', () => {
    const a = { ...doc, layers: [] }
    const b = { ...doc, layers: [image] }
    const one = editStep(createHistory(doc), a, false)
    expect(one.past).toEqual([doc])
    const amended = editStep(one, b, true)
    expect(amended.past).toEqual([doc])
    expect(amended.present).toBe(b)
    // The very first edit is always a step, even when marked as a continuation.
    expect(editStep(createHistory(doc), a, true).past).toHaveLength(1)
  })
})

describe('readDraft', () => {
  it('retains prompt-only edits in drafts and undo/redo', () => {
    const changed: LayerDoc = { ...doc, layers: [{ ...text, field: { kind: 'text', mode: 'ai', prompt: 'Tips usaha', length: 'medium' } }, image] }
    const restored = readDraft(JSON.stringify(changed), doc)
    expect(restored).toEqual(changed)
    const history = editStep(createHistory(doc), restored!, false)
    expect(undo(history).present).toEqual(doc)
    expect(redo(undo(history)).present).toEqual(changed)
  })
  it('offers a valid, different draft of the same canvas only', () => {
    const changed = { ...doc, layers: [{ ...text, text: 'Baru' }] }
    expect(readDraft(JSON.stringify(changed), doc)).toEqual(changed)
    expect(readDraft(JSON.stringify(doc), doc)).toBeNull()
    expect(readDraft(JSON.stringify({ ...changed, width: 1080, height: 1080 }), doc)).toBeNull()
    expect(readDraft('{nope', doc)).toBeNull()
    expect(readDraft(JSON.stringify({ ...changed, extra: true }), doc)).toBeNull()
    expect(readDraft(null, doc)).toBeNull()
  })

  it('ignores a text height that only followed the fonts', () => {
    const refitted = { ...doc, layers: [{ ...text, h: 999 }, image] }
    expect(readDraft(JSON.stringify(refitted), doc)).toBeNull()
  })
})

describe('image resize and crop', () => {
  // 200×100 box showing the whole source.
  const photo: ImageLayer = { id: 'p1', kind: 'image', assetId: ASSET, role: 'upload', x: 100, y: 100, w: 200, h: 100 }
  const close = (actual: object, expected: Record<string, number>) => {
    for (const [key, value] of Object.entries(expected)) expect((actual as Record<string, number>)[key], key).toBeCloseTo(value)
  }

  it('keeps proportions at a corner unless free (Shift), which stretches', () => {
    const kept = resizeLayer(photo, 'se', 100, 0)
    expect(kept.w / kept.h).toBeCloseTo(2)
    const free = resizeLayer(photo, 'se', 100, 100, { free: true })
    expect(free).toMatchObject({ x: 100, y: 100, w: 300, h: 200 })
    expect('crop' in free).toBe(false)
  })

  it('crops from a side handle, keeping the picture in place, and stops at the source edge', () => {
    const cropped = resizeLayer(photo, 'e', -50, 30) as ImageLayer
    expect(cropped).toMatchObject({ x: 100, y: 100, w: 150, h: 100 })
    close(cropped.crop!, { x: 0, y: 0, w: 0.75, h: 1 })
    expect(imageFullRect(cropped)).toEqual({ x: 100, y: 100, w: 200, h: 100 })
    const west = resizeLayer(photo, 'w', 40, 0) as ImageLayer
    expect(west).toMatchObject({ x: 140, w: 160 })
    close(west.crop!, { x: 0.2, w: 0.8 })
    close(imageFullRect(west), { x: 100, y: 100, w: 200, h: 100 })
    const north = resizeLayer(photo, 'n', 0, 30) as ImageLayer
    expect(north).toMatchObject({ y: 130, h: 70 })
    close(north.crop!, { y: 0.3, h: 0.7 })
    // Can't uncover more than the source: dragging out past the edge stops there and drops the crop.
    const back = resizeLayer(west, 'w', -500, 0) as ImageLayer
    expect(back).toMatchObject({ x: 100, w: 200 })
    expect(back.crop).toBeUndefined()
    expect(resizeLayer(photo, 'e', 300, 0)).toMatchObject({ w: 200 })
    // Never below the smallest box.
    expect(resizeLayer(photo, 'e', -1000, 0).w).toBe(24)
  })

  it('stretches a side with Shift instead of cropping', () => {
    const next = resizeLayer(photo, 'e', 50, 0, { free: true }) as ImageLayer
    expect(next).toMatchObject({ w: 250, h: 100 })
    expect(next.crop).toBeUndefined()
  })

  it('keeps a crop proportional at a corner (the crop is stretched with the box)', () => {
    const cropped = resizeLayer(photo, 'e', -100, 0) as ImageLayer
    const bigger = resizeLayer(cropped, 'se', 100, 0) as ImageLayer
    expect(bigger).toMatchObject({ w: 200, h: 200 })
    expect(bigger.crop).toEqual(cropped.crop)
  })

  it('crops a rotated image with the opposite edge fixed on screen', () => {
    const rotated = { ...photo, rotation: 90 }
    // Rotated 90°, the layer's east edge points down the screen; dragging up 50 px pulls it in by 50.
    const next = resizeRotatedLayer(rotated, 'e', 0, -50) as ImageLayer
    expect(next.w).toBeCloseTo(150)
    close(next.crop!, { x: 0, w: 0.75 })
    // The west edge's middle stays put: centre (200,150), rotated 90° → screen (200, 50).
    const westMid = (layer: ImageLayer) => ({ x: layer.x + layer.w / 2, y: layer.y + layer.h / 2 - layer.w / 2 })
    close(westMid(next), westMid(rotated))
    const free = resizeRotatedLayer(rotated, 'se', 0, 100, { free: true })
    expect(free.w).toBeCloseTo(300)
    expect(free.h).toBeCloseTo(100)
  })

  it('pans inside the frame, stopping at the image edges', () => {
    const cropped = resizeLayer(photo, 'e', -100, 0) as ImageLayer
    expect(cropped.crop).toEqual({ x: 0, y: 0, w: 0.5, h: 1 })
    // Dragging the picture left by 40 shows more of its right side.
    const panned = panCrop(cropped, -40, 0)
    close(panned.crop!, { x: 0.2, w: 0.5 })
    expect(panned).toMatchObject({ x: 100, y: 100, w: 100, h: 100 })
    expect(panCrop(cropped, -1000, 0).crop).toEqual({ x: 0.5, y: 0, w: 0.5, h: 1 })
    expect(panCrop(cropped, 1000, 1000).crop).toEqual({ x: 0, y: 0, w: 0.5, h: 1 })
    // Rotated 90°, the layer's +x points down the screen, so a drag up slides the picture towards its -x.
    close(panCrop({ ...cropped, rotation: 90 }, 0, -40).crop!, { x: 0.2 })
  })

  it('zooms about an anchor and never shows less than the frame', () => {
    const zoomed = zoomCrop(photo, 2)
    close(zoomed.crop!, { x: 0.25, y: 0.25, w: 0.5, h: 0.5 })
    expect(zoomed).toMatchObject({ x: 100, y: 100, w: 200, h: 100 })
    // Anchored on the frame's top-left corner, that corner of the picture stays.
    close(zoomCrop(photo, 2, { x: 100, y: 100 }).crop!, { x: 0, y: 0, w: 0.5, h: 0.5 })
    // Zooming out stops when the picture just covers the frame.
    expect(zoomCrop(zoomed, 0.1).crop).toBeUndefined()
    expect(zoomCrop(photo, 0.5)).toEqual(photo)
    expect(zoomCrop(photo, 1e6).crop!.w).toBeCloseTo(0.01)
    expect(zoomCrop(photo, Number.NaN)).toBe(photo)
  })

  it('resets the crop by showing the whole image at the same scale, and produces valid docs', () => {
    const cropped = panCrop(zoomCrop(photo, 2), 10, 0)
    const reset = resetCrop(cropped)
    expect(reset.crop).toBeUndefined()
    close(reset, imageFullRect(cropped))
    expect(resetCrop(photo)).toBe(photo)
    const rotated = resetCrop({ ...cropped, rotation: 30 })
    expect(rotated.w).toBeCloseTo(400)
    const locked = { ...cropped, locked: true }
    for (const step of [resetCrop(locked), panCrop(locked, 5, 5), zoomCrop(locked, 2)]) expect(step).toBe(locked)
    const result = parseLayerDoc({ ...doc, layers: [cropped, { ...resizeLayer(photo, 'w', 33.3333, 0), id: 'p2' },
      { ...zoomCrop(photo, 3.7), id: 'p3' }] })
    expect(result).toHaveProperty('doc')
  })
})

describe('rotate handle', () => {
  const centre = { x: 100, y: 100 }
  const below = { x: 100, y: 200 }

  it('turns by the change of the pointer’s bearing about the centre', () => {
    // From straight below the centre to its left: a quarter turn clockwise.
    expect(rotationFromDrag(0, centre, below, { x: 0, y: 100 })).toBe(90)
    expect(rotationFromDrag(0, centre, below, { x: 200, y: 100 })).toBe(-90)
    expect(rotationFromDrag(30, centre, below, { x: 0, y: 100 })).toBe(120)
    // Not moved: the angle it had.
    expect(rotationFromDrag(37, centre, below, below)).toBe(37)
  })

  it('settles on a multiple of 45° when close, and steps by 15° with Shift', () => {
    const at = (degrees: number) => ({ x: 100 + 100 * Math.cos((90 + degrees) * Math.PI / 180), y: 100 + 100 * Math.sin((90 + degrees) * Math.PI / 180) })
    expect(rotationFromDrag(0, centre, below, at(43))).toBe(45)
    expect(rotationFromDrag(0, centre, below, at(2))).toBe(0)
    expect(rotationFromDrag(0, centre, below, at(20))).toBe(20)
    expect(rotationFromDrag(0, centre, below, at(20), true)).toBe(15)
    expect(rotationFromDrag(0, centre, below, at(23), true)).toBe(30)
  })

  it('stays within (-180, 180] and never returns -0', () => {
    expect(rotationFromDrag(170, centre, below, { x: 0, y: 100 })).toBe(-100)
    expect(rotationFromDrag(90, centre, below, { x: 0, y: 100 })).toBe(180)
    expect(Object.is(rotationFromDrag(-1, centre, below, below), -0)).toBe(false)
  })

  it('drops the property at 0 so the layer equals one never rotated', () => {
    const layer = { id: 'a', kind: 'shape' as const, shape: 'rect' as const, color: '#000000', radius: 0, strokeColor: '#000000', strokeWidth: 0, x: 0, y: 0, w: 10, h: 10 }
    expect(withRotation({ ...layer, rotation: 30 }, 0)).toEqual(layer)
    expect(withRotation(layer, 45)).toEqual({ ...layer, rotation: 45 })
  })
})
