import { describe, expect, it } from 'vitest'
import {
  clampBox, commit, createHistory, docAssetIds, fontShorthand, hitTest, isOutside, LAYER_LIMITS, lineBaseline, lineStart,
  newTextLayer, parseLayerDoc, redo, reorder, resizeBox, snapBox, TEXT_WEIGHTS, undo, wrapText, type LayerDoc,
  type TextLayer,
} from './layer-doc'

const ASSET = '11111111-1111-4111-8111-111111111111'
const text: TextLayer = {
  id: 't1', kind: 'text', x: 80, y: 100, w: 900, h: 120, text: 'Halo dunia', font: 'Inter', size: 64, weight: 700,
  color: '#ffffff', align: 'left', lineHeight: 1.2,
}
const doc = (layers: unknown[]): unknown => ({ v: 1, width: 1080, height: 1350, layers })
const sample: LayerDoc = { v: 1, width: 1080, height: 1350, layers: [text, { id: 'i1', kind: 'image', assetId: ASSET, role: 'logo', x: 10, y: 10, w: 100, h: 50 }] }

describe('parseLayerDoc', () => {
  it('accepts a valid doc and normalises colour and asset id case', () => {
    const result = parseLayerDoc(doc([text, { id: 'i1', kind: 'image', assetId: ASSET.toUpperCase(), role: 'logo', x: 0, y: 0, w: 100, h: 50 }]))
    expect('doc' in result && result.doc.layers[0]).toMatchObject({ color: '#FFFFFF' })
    expect('doc' in result && docAssetIds(result.doc)).toEqual([ASSET])
  })

  it('refuses unknown keys, versions and shapes', () => {
    expect(parseLayerDoc({ ...(doc([]) as object), extra: 1 })).toEqual({ error: 'shape' })
    expect(parseLayerDoc({ v: 2, width: 1080, height: 1350, layers: [] })).toEqual({ error: 'shape' })
    expect(parseLayerDoc(doc([{ ...text, html: '<b>' }]))).toEqual({ error: 'layer' })
    expect(parseLayerDoc({ v: 1, width: 1080.5, height: 1350, layers: [] })).toEqual({ error: 'size' })
  })

  it('enforces the limits of §9', () => {
    expect(parseLayerDoc(doc(Array.from({ length: 31 }, (_, i) => ({ ...text, id: `t${i}` }))))).toEqual({ error: 'too_many' })
    expect(parseLayerDoc(doc([{ ...text, text: 'a'.repeat(501) }]))).toEqual({ error: 'layer' })
    expect(parseLayerDoc(doc([{ ...text, text: '😀'.repeat(500) }]))).toHaveProperty('doc')
    expect(parseLayerDoc(doc([{ ...text, color: 'red' }]))).toEqual({ error: 'layer' })
    expect(parseLayerDoc(doc([{ ...text, size: 11 }]))).toEqual({ error: 'layer' })
    expect(parseLayerDoc(doc([{ ...text, size: 401 }]))).toEqual({ error: 'layer' })
    expect(parseLayerDoc(doc([{ ...text, lineHeight: 2.1 }]))).toEqual({ error: 'layer' })
    expect(parseLayerDoc(doc([{ ...text, weight: 900 }]))).toEqual({ error: 'layer' })
    expect(parseLayerDoc(doc([{ ...text, font: 'Comic Sans' }]))).toEqual({ error: 'layer' })
    expect(parseLayerDoc(doc([{ ...text, x: Number.NaN }]))).toEqual({ error: 'layer' })
    expect(parseLayerDoc(doc([{ ...text, x: 5000 }]))).toEqual({ error: 'layer' })
    expect(parseLayerDoc(doc([text, text]))).toEqual({ error: 'duplicate_id' })
    expect(parseLayerDoc(doc([{ id: 'i', kind: 'image', assetId: 'nope', role: 'logo', x: 0, y: 0, w: 1, h: 1 }]))).toEqual({ error: 'layer' })
    expect(parseLayerDoc(doc([{ id: 'i', kind: 'image', assetId: ASSET, role: 'sticker', x: 0, y: 0, w: 1, h: 1 }]))).toEqual({ error: 'layer' })
  })

  it('accepts every text weight and the optional styling, keeping absent keys absent', () => {
    for (const weight of TEXT_WEIGHTS) expect(parseLayerDoc(doc([{ ...text, weight }]))).toHaveProperty('doc')
    const styled = {
      ...text, italic: true, underline: false, uppercase: true, letterSpacing: -0.1, opacity: 0.1, shadow: true,
    }
    const result = parseLayerDoc(doc([styled, { id: 'i1', kind: 'image', assetId: ASSET, role: 'upload', x: 0, y: 0, w: 10, h: 10, opacity: 0.5 }]))
    expect('doc' in result && result.doc.layers).toEqual([
      { ...styled, color: '#FFFFFF' },
      { id: 'i1', kind: 'image', assetId: ASSET, role: 'upload', x: 0, y: 0, w: 10, h: 10, opacity: 0.5 },
    ])
    const plain = parseLayerDoc(doc([text]))
    expect('doc' in plain && Object.keys(plain.doc.layers[0])).not.toContain('italic')
  })

  it('refuses bad optional styling', () => {
    for (const weight of [100, 900, 450, '700']) expect(parseLayerDoc(doc([{ ...text, weight }]))).toEqual({ error: 'layer' })
    for (const flag of ['italic', 'underline', 'uppercase', 'shadow']) {
      expect(parseLayerDoc(doc([{ ...text, [flag]: 1 }]))).toEqual({ error: 'layer' })
      expect(parseLayerDoc(doc([{ ...text, [flag]: null }]))).toEqual({ error: 'layer' })
    }
    expect(parseLayerDoc(doc([{ ...text, letterSpacing: 0.51 }]))).toEqual({ error: 'layer' })
    expect(parseLayerDoc(doc([{ ...text, letterSpacing: -0.11 }]))).toEqual({ error: 'layer' })
    expect(parseLayerDoc(doc([{ ...text, letterSpacing: '0.1' }]))).toEqual({ error: 'layer' })
    expect(parseLayerDoc(doc([{ ...text, opacity: 0.05 }]))).toEqual({ error: 'layer' })
    expect(parseLayerDoc(doc([{ ...text, opacity: 1.01 }]))).toEqual({ error: 'layer' })
    expect(parseLayerDoc(doc([{ ...text, opacity: Number.NaN }]))).toEqual({ error: 'layer' })
    const image = { id: 'i', kind: 'image', assetId: ASSET, role: 'logo', x: 0, y: 0, w: 1, h: 1 }
    expect(parseLayerDoc(doc([{ ...image, opacity: 0 }]))).toEqual({ error: 'layer' })
    // Text styling is not an image key.
    expect(parseLayerDoc(doc([{ ...image, shadow: true }]))).toEqual({ error: 'layer' })
  })
})

describe('fontShorthand', () => {
  it('adds italic only when set', () => {
    expect(fontShorthand(text, 'Inter')).toBe('700 64px Inter')
    expect(fontShorthand({ ...text, italic: true, weight: 300 }, 'Inter')).toBe('italic 300 64px Inter')
    expect(fontShorthand({ ...text, italic: false }, 'Inter')).toBe('700 64px Inter')
  })
})

describe('wrapText', () => {
  // Every character is 10 px wide.
  const measure = (value: string) => value.length * 10

  it('wraps greedily by words to the box width', () => {
    expect(wrapText(measure, 'aaa bbb ccc', 70)).toEqual(['aaa bbb', 'ccc'])
    expect(wrapText(measure, 'aaa  bbb', 200)).toEqual(['aaa bbb'])
  })

  it('keeps hard line breaks and empty lines', () => {
    expect(wrapText(measure, 'aa\n\nbb', 200)).toEqual(['aa', '', 'bb'])
  })

  it('splits a word wider than the box', () => {
    expect(wrapText(measure, 'abcdefgh xy', 30)).toEqual(['abc', 'def', 'gh', 'xy'])
  })
})

describe('text layout', () => {
  it('places lines like CSS half-leading', () => {
    // 64 px font, line box 76.8, ascent 60 + descent 16 = 76: half-leading 0.4.
    expect(lineBaseline(text, 0, 60, 16)).toBeCloseTo(100 + 0.4 + 60)
    expect(lineBaseline(text, 2, 60, 16)).toBeCloseTo(100 + 2 * 76.8 + 0.4 + 60)
  })

  it('aligns lines inside the box', () => {
    expect(lineStart({ ...text, align: 'left' }, 300)).toBe(80)
    expect(lineStart({ ...text, align: 'center' }, 300)).toBe(80 + 300)
    expect(lineStart({ ...text, align: 'right' }, 300)).toBe(80 + 600)
  })
})

describe('geometry', () => {
  const canvas = { width: 1080, height: 1350 }

  it('snaps to the canvas centre and other boxes within tolerance', () => {
    const snapped = snapBox({ x: 437, y: 10, w: 200, h: 50 }, canvas, [], 6)
    expect(snapped.x).toBe(440)
    expect(snapped.guides.vertical).toEqual([540])
    expect(snapBox({ x: 400, y: 300, w: 100, h: 50 }, canvas, [{ x: 0, y: 352, w: 10, h: 10 }], 6).y).toBe(302)
    expect(snapBox({ x: 300, y: 300, w: 100, h: 50 }, canvas, [], 6)).toMatchObject({ x: 300, y: 300 })
  })

  it('keeps part of a dragged box on the canvas and flags overflow', () => {
    expect(clampBox({ x: -1000, y: 2000, w: 200, h: 100 }, canvas)).toMatchObject({ x: -160, y: 1310 })
    expect(isOutside({ x: 900, y: 0, w: 200, h: 10 }, canvas)).toBe(true)
    expect(isOutside({ x: 0, y: 0, w: 1080, h: 1350 }, canvas)).toBe(false)
  })

  it('hit-tests the topmost layer', () => {
    expect(hitTest(sample.layers, 50, 30)).toBe('i1')
    expect(hitTest(sample.layers, 500, 150)).toBe('t1')
    expect(hitTest(sample.layers, 5, 1300)).toBeNull()
  })

  it('resizes from the dragged handle, proportionally for images', () => {
    const box = { x: 100, y: 100, w: 200, h: 100 }
    expect(resizeBox(box, 'e', 50, 999, false)).toEqual({ x: 100, y: 100, w: 250, h: 100 })
    expect(resizeBox(box, 'nw', 20, 10, false)).toEqual({ x: 120, y: 110, w: 180, h: 90 })
    expect(resizeBox(box, 'se', 100, 0, true)).toEqual({ x: 100, y: 100, w: 300, h: 150 })
    expect(resizeBox(box, 'nw', -100, 0, true)).toEqual({ x: 0, y: 50, w: 300, h: 150 })
    expect(resizeBox(box, 'w', 500, 0, false).w).toBe(LAYER_LIMITS.minBox)
    expect(resizeBox(box, 'se', -500, -500, true).h).toBe(LAYER_LIMITS.minBox)
  })

  it('reorders the stack', () => {
    expect(reorder(sample, 't1', 'front').layers.map((layer) => layer.id)).toEqual(['i1', 't1'])
    expect(reorder(sample, 't1', 'back')).toBe(sample)
  })
})

describe('history', () => {
  it('undoes and redoes, dropping redo after a new change', () => {
    let history = createHistory(sample)
    const moved = { ...sample, layers: [{ ...text, x: 0 }, sample.layers[1]] }
    history = commit(history, moved)
    history = undo(history)
    expect(history.present).toBe(sample)
    history = redo(history)
    expect(history.present).toBe(moved)
    history = commit(undo(history), { ...sample })
    expect(history.future).toEqual([])
  })

  it('keeps at least 20 steps', () => {
    let history = createHistory(sample)
    for (let step = 0; step < 40; step++) history = commit(history, { ...sample, width: 1000 + step })
    expect(history.past.length).toBeGreaterThanOrEqual(20)
    for (let step = 0; step < 20; step++) history = undo(history)
    expect(history.present.width).toBe(1019)
  })
})

describe('newTextLayer', () => {
  it('is a valid layer', () => {
    const layer = newTextLayer(sample, 'Baru', 'Poppins')
    expect(parseLayerDoc({ ...sample, layers: [...sample.layers, layer] })).toHaveProperty('doc')
  })
})
