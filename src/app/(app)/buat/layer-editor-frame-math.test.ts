import { describe, expect, it } from 'vitest'
import { frameCrop, parseLayerDoc, type FrameLayer, type ImageLayer, type LayerDoc } from '@/lib/layer-doc'
import {
  clipImageOf, dataUrlFile, dragHasImage, dropLayerIntoFrame, FRAME_PRESETS, frameAsImage, frameWithCrop, imageFileOf, newFrameFromPreset,
} from './layer-editor-frame-math'
import { panCrop, zoomCrop } from './layer-editor-gesture'

const ASSET = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const base: LayerDoc = { v: 1, width: 1080, height: 1350, layers: [] }
const frame: FrameLayer = { id: 'f1', kind: 'frame', shape: 'ellipse', x: 100, y: 100, w: 400, h: 400, color: '#D9DCE3',
  radius: 0, strokeColor: '#171827', strokeWidth: 0 }
const image: ImageLayer = { id: 'i1', kind: 'image', assetId: ASSET, role: 'upload', x: 200, y: 200, w: 100, h: 100 }

describe('frame presets', () => {
  it('have unique ids and each makes a valid frame', () => {
    expect(new Set(FRAME_PRESETS.map((preset) => preset.id)).size).toBe(FRAME_PRESETS.length)
    for (const preset of FRAME_PRESETS) {
      const layer = newFrameFromPreset(base, preset)
      expect(layer.w / layer.h).toBeCloseTo(preset.aspect, 1)
      expect(parseLayerDoc({ ...base, layers: [layer] })).toHaveProperty('doc')
    }
  })
})

describe('repositioning a frame picture', () => {
  it('starts from the centred cover and writes back only the crop', () => {
    const filled = { ...frame, assetId: ASSET }
    const draft = frameAsImage(filled, 2000, 1000)
    expect(draft).toMatchObject({ kind: 'image', assetId: ASSET, x: 100, y: 100, w: 400, h: 400, crop: { x: 0.25, y: 0, w: 0.5, h: 1 } })
    const moved = zoomCrop(panCrop(draft, 50, 0), 1.5)
    const next = frameWithCrop(filled, moved)
    expect(next).toMatchObject({ x: 100, y: 100, w: 400, h: 400, assetId: ASSET })
    expect(next.crop).toBeDefined()
    // The stored crop already has the frame's aspect, so the renderer shows exactly what was framed.
    expect(frameCrop(next, 2000, 1000)).toEqual(expect.objectContaining({ w: next.crop!.w }))
    expect(parseLayerDoc({ ...base, layers: [next] })).toHaveProperty('doc')
  })

  it('keeps an empty frame empty', () => {
    expect(frameWithCrop(frame, { ...image, crop: { x: 0, y: 0, w: 0.5, h: 0.5 } })).toEqual(frame)
  })
})

describe('dropLayerIntoFrame', () => {
  it('puts a picture let go over a frame into it and removes the picture layer', () => {
    const doc = { ...base, layers: [{ ...frame, assetId: OTHER, crop: { x: 0, y: 0, w: 0.5, h: 0.5 } }, image] }
    expect(dropLayerIntoFrame(doc, image)).toEqual({ ...base, layers: [{ ...frame, assetId: ASSET }] })
  })

  it('does nothing away from a frame, on a locked one, or for other layers', () => {
    expect(dropLayerIntoFrame({ ...base, layers: [frame, image] }, image, { x: 900, y: 900 })).toBeNull()
    expect(dropLayerIntoFrame({ ...base, layers: [{ ...frame, locked: true }, image] }, image)).toBeNull()
    expect(dropLayerIntoFrame({ ...base, layers: [frame] }, frame)).toBeNull()
  })
})

describe('clipboard and drag data', () => {
  const file = (type: string) => ({ type, name: 'x' }) as File
  const data = (files: File[], items: Partial<DataTransferItem>[] = [], types: string[] = []) =>
    ({ files, items, types }) as unknown as DataTransfer

  it('picks the first image file, from files or items', () => {
    expect(imageFileOf(data([file('text/plain'), file('image/png')]))?.type).toBe('image/png')
    const pasted = file('image/jpeg')
    expect(imageFileOf(data([], [{ kind: 'file', type: 'image/jpeg', getAsFile: () => pasted }]))).toBe(pasted)
    expect(imageFileOf(data([file('application/pdf')]))).toBeNull()
    expect(imageFileOf(null)).toBeNull()
  })

  it('accepts drags that may carry a picture', () => {
    expect(dragHasImage(data([], [], ['Files']))).toBe(true)
    expect(dragHasImage(data([], [], ['text/uri-list']))).toBe(true)
    expect(dragHasImage(data([], [], ['text/html']))).toBe(true)
    expect(dragHasImage(data([], [], ['text/plain']))).toBe(false)
  })

  const clip = (values: Record<string, string>, files: File[] = []) =>
    ({ files, items: [], types: Object.keys(values), getData: (type: string) => values[type] ?? '' }) as unknown as DataTransfer
  const PNG = 'data:image/png;base64,iVBORw0KGgo='

  it('prefers a real image file', () => {
    const pasted = file('image/png')
    expect(clipImageOf(clip({ 'text/html': '<img src="https://a.test/x.jpg">' }, [pasted]))).toEqual({ file: pasted })
  })

  it('reads the picture out of copied HTML, as Google Images gives it', () => {
    expect(clipImageOf(clip({ 'text/html': '<meta charset="utf-8"><img alt="kucing" src="https://encrypted-tbn0.gstatic.com/images?q=tbn:A&amp;s=10">' })))
      .toEqual({ url: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:A&s=10' })
    expect(clipImageOf(clip({ 'text/html': "<IMG SRC='http://a.test/b.webp' />" }))).toEqual({ url: 'http://a.test/b.webp' })
    const inline = clipImageOf(clip({ 'text/html': `<img src="${PNG}">` }))
    expect(inline && 'file' in inline && inline.file.type).toBe('image/png')
  })

  it('falls back to a copied image address', () => {
    expect(clipImageOf(clip({ 'text/uri-list': '# from a page\r\nhttps://a.test/c.png' }))).toEqual({ url: 'https://a.test/c.png' })
    expect(clipImageOf(clip({ 'text/plain': '  https://a.test/d.jpg ' }))).toEqual({ url: 'https://a.test/d.jpg' })
  })

  it('finds nothing in plain words, other links or a null paste', () => {
    expect(clipImageOf(clip({ 'text/plain': 'halo dunia' }))).toBeNull()
    expect(clipImageOf(clip({ 'text/plain': 'javascript:alert(1)' }))).toBeNull()
    expect(clipImageOf(clip({ 'text/html': '<p>teks saja</p>' }))).toBeNull()
    expect(clipImageOf(null)).toBeNull()
  })

  it('decodes data: pictures, base64 or not, and rejects the rest', () => {
    const png = dataUrlFile(PNG)
    expect(png?.type).toBe('image/png')
    expect(png?.size).toBe(8)
    expect(dataUrlFile('data:image/svg+xml,%3Csvg%2F%3E')?.size).toBe(6)
    expect(dataUrlFile('data:text/plain;base64,aGk=')).toBeNull()
    expect(dataUrlFile('data:image/png;base64,***')).toBeNull()
  })
})
