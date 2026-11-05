import { describe, expect, it } from 'vitest'
import { createHistory, type ImageLayer, type LayerDoc, type TextLayer } from '@/lib/layer-doc'
import { editStep, fitTextHeights, handlesFor, moveLayer, nudgeLayer, readDraft, resizeLayer } from './layer-editor-gesture'

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
