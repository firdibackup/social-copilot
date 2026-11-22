import { describe, expect, it } from 'vitest'
import {
  clampBox, commit, createHistory, docAssetIds, fontShorthand, hitTest, isOutside, LAYER_LIMITS, lineBaseline, lineStart,
  newTextLayer, newShapeLayer, duplicateLayer, parseLayerDoc, redo, reorder, resizeBox, snapBox, TEXT_WEIGHTS, undo, wrapText, type LayerDoc,
  type TextLayer, newPathLayer, normalizePath, pathPointsAbsolute, type PathLayer, newOverlayLayer, parseImageCrop,
  emptyFrame, fillFrame, FRAME_PLACEHOLDER, frameAt, frameCrop, newFrameLayer, type FrameLayer,
} from './layer-doc'
import { OVERLAY_PRESETS } from './gradients'
import { LINE_KINDS, SHAPE_KINDS } from './shape-paths'

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

describe('editor elements', () => {
  it('round-trips every basic shape with rotation and flags', () => {
    for (const shape of ['rect', 'ellipse', 'triangle', 'line', 'arrow'] as const) {
      const layer = { ...newShapeLayer(sample, shape), rotation: 45, locked: true, hidden: true, name: 'Panel' }
      expect(parseLayerDoc({ ...sample, layers: [layer] })).toEqual({ doc: { ...sample, layers: [layer] } })
      expect(parseLayerDoc({ ...sample, layers: [{ ...layer, radius: -1 }] })).toHaveProperty('error')
    }
  })

  it('accepts every shape kind, with or without a dash, and refuses unknown kinds and dashes', () => {
    for (const shape of SHAPE_KINDS) {
      const layer = newShapeLayer(sample, shape)
      expect(layer.strokeWidth > 0).toBe(LINE_KINDS.includes(shape as never))
      for (const dash of [undefined, 'dashed', 'dotted'] as const) {
        const styled = dash ? { ...layer, dash } : layer
        expect(parseLayerDoc({ ...sample, layers: [styled] })).toEqual({ doc: { ...sample, layers: [styled] } })
      }
    }
    const rect = newShapeLayer(sample, 'rect')
    for (const bad of [{ ...rect, shape: 'splat' }, { ...rect, dash: 'dashdot' }, { ...rect, dash: null }, { ...rect, extra: 1 }]) {
      expect(parseLayerDoc({ ...sample, layers: [bad] })).toEqual({ error: 'layer' })
    }
  })
})

describe('path layers', () => {
  const path: PathLayer = {
    id: 'p1', kind: 'path', x: 100, y: 200, w: 400, h: 300, closed: true, fill: true,
    color: '#6558F5', strokeColor: '#171827', strokeWidth: 4, dash: 'dotted', opacity: 0.8, rotation: 10,
    points: [{ x: 0, y: 0, out: { x: 0.3, y: -0.2 } }, { x: 1, y: 0, in: { x: 0.7, y: -0.2 } }, { x: 0.5, y: 1 }],
  }

  it('round-trips a valid path and drops nothing', () => {
    expect(parseLayerDoc({ ...sample, layers: [path] })).toEqual({ doc: { ...sample, layers: [path] } })
    const open = { ...path, closed: false, fill: false, dash: undefined }
    delete open.dash
    expect(parseLayerDoc({ ...sample, layers: [open] })).toEqual({ doc: { ...sample, layers: [open] } })
  })

  it('refuses malformed paths', () => {
    const point = { x: 0.5, y: 0.5 }
    for (const bad of [
      { ...path, points: [point] },
      { ...path, points: Array.from({ length: 101 }, () => point) },
      { ...path, points: [point, { x: 2.5, y: 0 }] },
      { ...path, points: [point, { x: 0, y: -1.5 }] },
      { ...path, points: [point, { x: 0, y: Number.NaN }] },
      { ...path, points: [point, { x: 0, y: 0, in: { x: 0, y: 3 } }] },
      { ...path, points: [point, { x: 0, y: 0, out: { x: 0, y: 0, z: 1 } }] },
      { ...path, points: [point, { x: 0, y: 0, weight: 1 }] },
      { ...path, points: 'M0 0' },
      { ...path, closed: 'yes' },
      { ...path, fill: 1 },
      { ...path, color: 'red' },
      { ...path, strokeWidth: 101 },
      { ...path, dash: 'long' },
      { ...path, radius: 0 },
      { ...path, shape: 'rect' },
    ]) {
      expect(parseLayerDoc({ ...sample, layers: [bad] })).toEqual({ error: 'layer' })
    }
  })

  it('normalizes absolute pen points into a box and fractions, and back', () => {
    const absolute = [{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 200, in: { x: 350, y: 150 } }]
    const normal = normalizePath(absolute)!
    expect(normal.box.x).toBe(100)
    expect(normal.box.y).toBe(100)
    // The curve bulges right of x = 300 but never reaches its handle.
    expect(normal.box.w).toBeGreaterThan(200)
    expect(normal.box.w).toBeLessThan(250)
    expect(normal.box.h).toBeCloseTo(100)
    const layer = { ...normal.box, points: normal.points }
    const back = pathPointsAbsolute(layer)
    back.forEach((point, index) => {
      expect(point.x).toBeCloseTo(absolute[index].x)
      expect(point.y).toBeCloseTo(absolute[index].y)
    })
    expect(back[2].in!.x).toBeCloseTo(350)
    expect(normalizePath([{ x: 1, y: 1 }])).toBeNull()
  })

  it('gives straight horizontal strokes a usable box and builds a valid layer', () => {
    const normal = normalizePath([{ x: 10, y: 50 }, { x: 210, y: 50 }])!
    expect(normal.box).toEqual({ x: 10, y: 49.5, w: 200, h: 1 })
    expect(normal.points).toEqual([{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }])
    const layer = newPathLayer(sample, [{ x: 100, y: 100 }, { x: 400, y: 120 }, { x: 250, y: 400 }], true)!
    expect(layer).toMatchObject({ kind: 'path', closed: true, fill: true, x: 100, y: 100, w: 300, h: 300 })
    expect(parseLayerDoc({ ...sample, layers: [layer] })).toHaveProperty('doc')
    expect(newPathLayer(sample, [{ x: 1, y: 1 }], false)).toBeNull()
  })

  it('duplicates above the source, unlocks the copy, and enforces the layer limit', () => {
    const result = duplicateLayer({ ...sample, layers: [{ ...text, locked: true }] }, text.id)
    expect(result.doc.layers[1]).toMatchObject({ x: text.x + 20, y: text.y + 20, locked: false, id: result.id })
    expect(result.id).not.toBe(text.id)
    expect(duplicateLayer({ ...sample, layers: Array.from({ length: 30 }, () => text) }, text.id).id).toBeNull()
  })

  it('hit-tests rotated boxes and ignores locked or hidden layers', () => {
    const rotated = { ...text, x: 100, y: 100, w: 200, h: 40, rotation: 90 }
    expect(hitTest([rotated], 200, 30)).toBe('t1')
    expect(hitTest([rotated], 105, 105)).toBeNull()
    expect(hitTest([{ ...rotated, hidden: true }], 200, 120)).toBeNull()
    expect(hitTest([{ ...rotated, locked: true }], 200, 120)).toBeNull()
  })
})

describe('image crop and gradients', () => {
  const image = { id: 'i1', kind: 'image', assetId: ASSET, role: 'upload', x: 0, y: 0, w: 100, h: 50 }
  const shape = { id: 's1', kind: 'shape', shape: 'rect', x: 0, y: 0, w: 100, h: 50, color: '#112233', radius: 0,
    strokeColor: '#000000', strokeWidth: 0 }
  const gradient = { kind: 'linear', angle: 180, stops: [{ offset: 0, color: '#000000', alpha: 0 }, { offset: 1, color: '#ffffff', alpha: 0.8 }] }

  it('accepts a crop inside the source', () => {
    const result = parseLayerDoc(doc([{ ...image, crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.8 } }]))
    expect('doc' in result && result.doc.layers[0]).toMatchObject({ crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.8 } })
    expect(parseImageCrop({ x: 0, y: 0, w: 1, h: 1 })).toEqual({ x: 0, y: 0, w: 1, h: 1 })
  })

  it('refuses a crop out of range, too small, past the source, or with extra keys', () => {
    for (const crop of [
      null, { x: 0, y: 0, w: 1 }, { x: -0.1, y: 0, w: 0.5, h: 0.5 }, { x: 0.6, y: 0, w: 0.5, h: 0.5 }, { x: 0, y: 0.7, w: 0.5, h: 0.5 },
      { x: 0, y: 0, w: 0.001, h: 0.5 }, { x: 0, y: 0, w: 1.2, h: 1 }, { x: 0, y: 0, w: 1, h: 1, z: 1 }, { x: '0', y: 0, w: 1, h: 1 },
    ]) expect(parseLayerDoc(doc([{ ...image, crop }])), JSON.stringify(crop)).toEqual({ error: 'layer' })
  })

  it('keeps a valid gradient on shapes, paths and text, and refuses one on images or a bad one', () => {
    const path = { id: 'p1', kind: 'path', x: 0, y: 0, w: 100, h: 50, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
      closed: true, fill: true, color: '#112233', strokeColor: '#000000', strokeWidth: 0 }
    const result = parseLayerDoc(doc([{ ...shape, gradient }, { ...path, gradient }, { ...text, id: 't9', gradient }]))
    if (!('doc' in result)) throw new Error(result.error)
    for (const layer of result.doc.layers) {
      expect('gradient' in layer && layer.gradient?.stops[1]).toEqual({ offset: 1, color: '#FFFFFF', alpha: 0.8 })
    }
    expect(parseLayerDoc(doc([{ ...image, gradient }]))).toEqual({ error: 'layer' })
    expect(parseLayerDoc(doc([{ ...shape, gradient: { ...gradient, stops: [] } }]))).toEqual({ error: 'layer' })
    expect(parseLayerDoc(doc([{ ...shape, gradient: { ...gradient, kind: 'conic' } }]))).toEqual({ error: 'layer' })
  })

  it('makes a full-canvas overlay from a preset without sharing it', () => {
    const preset = OVERLAY_PRESETS[0]
    const overlay = newOverlayLayer(sample, preset)
    expect(overlay).toMatchObject({ kind: 'shape', shape: 'rect', x: 0, y: 0, w: 1080, h: 1350, strokeWidth: 0, name: preset.id })
    expect(overlay.gradient).toEqual(preset.gradient)
    expect(overlay.gradient).not.toBe(preset.gradient)
    expect(newOverlayLayer(sample, preset, 'Bayangan').name).toBe('Bayangan')
    expect(parseLayerDoc({ ...sample, layers: [...sample.layers, overlay] })).toHaveProperty('doc')
  })
})

describe('frame layers', () => {
  const frame: FrameLayer = { id: 'f1', kind: 'frame', shape: 'heart', x: 100, y: 100, w: 400, h: 200, color: '#D9DCE3',
    radius: 0, strokeColor: '#171827', strokeWidth: 0 }

  it('parses empty and filled frames, and refuses lines, gradients, a crop without a picture and unknown keys', () => {
    const filled = { ...frame, assetId: ASSET, crop: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 } }
    expect(parseLayerDoc({ ...sample, layers: [frame] })).toEqual({ doc: { ...sample, layers: [frame] } })
    expect(parseLayerDoc({ ...sample, layers: [filled] })).toEqual({ doc: { ...sample, layers: [filled] } })
    const gradient = { type: 'linear', angle: 0, stops: [{ offset: 0, color: '#000000' }, { offset: 1, color: '#FFFFFF' }] }
    for (const bad of [{ ...frame, shape: 'line' }, { ...frame, gradient }, { ...frame, crop: filled.crop }, { ...frame, assetId: 'nope' }, { ...frame, extra: 1 }]) {
      expect(parseLayerDoc({ ...sample, layers: [bad] })).toEqual({ error: 'layer' })
    }
  })

  it('counts a filled frame among the doc assets', () => {
    expect(docAssetIds({ ...sample, layers: [frame] })).toEqual([])
    expect(docAssetIds({ ...sample, layers: [{ ...frame, assetId: ASSET }] })).toEqual([ASSET])
  })

  it('makes a centred frame at the preset aspect', () => {
    const made = newFrameLayer(sample, 'arch', 3 / 4)
    expect(made).toMatchObject({ kind: 'frame', shape: 'arch', color: FRAME_PLACEHOLDER, w: 365, h: 486 })
    expect(Math.abs(made.x + made.w / 2 - 540)).toBeLessThanOrEqual(1)
    expect(parseLayerDoc({ ...sample, layers: [made] })).toHaveProperty('doc')
  })

  it('covers the frame from the centre, and fits a stored crop to the frame aspect', () => {
    // 2:1 frame on a square picture: the middle half, full width.
    expect(frameCrop(frame, 1000, 1000)).toEqual({ x: 0, y: 0.25, w: 1, h: 0.5 })
    // 2:1 frame on a 4:1 picture: the middle half, full height.
    expect(frameCrop(frame, 4000, 1000)).toEqual({ x: 0.25, y: 0, w: 0.5, h: 1 })
    const fitted = frameCrop({ ...frame, crop: { x: 0, y: 0, w: 0.5, h: 0.5 } }, 1000, 1000)
    expect(fitted.w / fitted.h).toBeCloseTo(2)
    expect(fitted.x).toBeGreaterThanOrEqual(0)
    expect(fitted.y + fitted.h).toBeLessThanOrEqual(1)
  })

  it('fills and empties a frame', () => {
    const filled = fillFrame({ ...frame, assetId: ASSET, crop: { x: 0, y: 0, w: 0.5, h: 0.5 } }, ASSET)
    expect(filled).toEqual({ ...frame, assetId: ASSET })
    expect(emptyFrame({ ...filled, crop: { x: 0, y: 0, w: 1, h: 1 } })).toEqual(frame)
  })

  it('finds the top visible unlocked frame under a point', () => {
    const top = { ...frame, id: 'f2' }
    const layers = [frame, top, text]
    expect(frameAt(layers, 300, 200)?.id).toBe('f2')
    expect(frameAt([frame, { ...top, hidden: true }], 300, 200)?.id).toBe('f1')
    expect(frameAt([frame, { ...top, locked: true }], 300, 200)?.id).toBe('f1')
    expect(frameAt(layers, 900, 900)).toBeNull()
  })
})
