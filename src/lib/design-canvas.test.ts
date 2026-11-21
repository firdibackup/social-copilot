import { describe, expect, it } from 'vitest'
import { drawDesignPage, layoutDesignText } from './design-canvas'
import { gradientGeometry } from './gradients'
import { migrateLayerDoc, type TextNode } from './design-doc'
import type { LayerDoc } from './layer-doc'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const legacy: LayerDoc = { v: 1, width: 1080, height: 1350, layers: [{
  id: 't', kind: 'text', text: 'One two three', x: 0, y: 0, w: 80, h: 100, font: 'Inter', size: 20,
  weight: 700, color: '#000000', align: 'left', lineHeight: 1.2,
}] }
const text = () => migrateLayerDoc(legacy, { id: id(1), pageId: id(2), nodeIds: [id(3)] }, id(4)).pages[0].children[0] as TextNode
const context = () => ({ font: '', letterSpacing: '', measureText(this: { font: string; letterSpacing: string }, value: string) {
  const size = Number(/([\d.]+)px/.exec(this.font)?.[1] ?? 20)
  return { width: Array.from(value).length * (size / 2 + parseFloat(this.letterSpacing || '0')), fontBoundingBoxAscent: size * 0.8, fontBoundingBoxDescent: size * 0.2 }
} }) as unknown as CanvasRenderingContext2D

describe('design text layout', () => {
  it('wraps words and preserves intentional blank lines', () => {
    const node = text()
    node.content[0].runs[0].text = 'One two\n\nthree'
    const lines = layoutDesignText(context(), node, name => name)
    expect(lines.map(line => line.segments.map(part => part.text).join(''))).toEqual(['One two', '', 'three'])
    expect(lines[0]).toMatchObject({ width: 70, height: 24, ascent: 16, descent: 4 })
  })
  it('keeps rich text styles and uses the tallest run for the baseline', () => {
    const node = text()
    const style = node.content[0].runs[0].style
    node.box.width = 300
    node.content[0].runs = [{ text: 'Hello ', style }, { text: 'world', style: { ...style, fontSize: 40, underline: true } }]
    const [line] = layoutDesignText(context(), node, name => name)
    expect(line.segments.map(part => part.text)).toEqual(['Hello ', 'world'])
    expect(line).toMatchObject({ width: 160, height: 48, ascent: 32, descent: 8 })
  })
  it('applies uppercase and letter spacing and breaks long words by Unicode codepoint', () => {
    const node = text()
    node.content[0].runs[0].text = 'abcd🙂'
    node.content[0].runs[0].style = { ...node.content[0].runs[0].style, case: 'upper', letterSpacing: 10 }
    node.box.width = 36
    expect(layoutDesignText(context(), node, name => name).map(line => line.segments.map(part => part.text).join(''))).toEqual(['ABC', 'D🙂'])
  })
})

/** A 2D context that records every call; gradients record their colour stops. */
function recordingContext() {
  const calls: unknown[][] = []
  const state: Record<string, unknown> = { globalAlpha: 1 }
  const gradient = (name: string, args: number[]) => {
    const stops: [number, string][] = []
    calls.push(['gradient', name, ...args])
    return { name, args, stops, addColorStop: (offset: number, color: string) => { stops.push([offset, color]) } }
  }
  const ctx = new Proxy(state, {
    get(target, key: string) {
      if (key in target) return target[key]
      if (key === 'createLinearGradient') return (...args: number[]) => gradient('linear', args)
      if (key === 'createRadialGradient') return (...args: number[]) => gradient('radial', args)
      if (key === 'measureText') return () => ({ width: 10, fontBoundingBoxAscent: 8, fontBoundingBoxDescent: 2 })
      if (key === 'fill' || key === 'fillText') return (...args: unknown[]) => { calls.push([key, target.fillStyle, ...args]) }
      return (...args: unknown[]) => { calls.push([key, ...args]) }
    },
    set(target, key: string, value) { target[key] = value; return true },
  }) as unknown as CanvasRenderingContext2D
  return { ctx, calls }
}

describe('design crop and gradients', () => {
  const base = id(4)
  const asset = '11111111-1111-4111-8111-111111111111'
  const images = new Map([[base, { image: { tag: 'base' } as unknown as CanvasImageSource, width: 1080, height: 1350 }],
    [asset, { image: { tag: 'photo' } as unknown as CanvasImageSource, width: 400, height: 200 }]])
  const draw = (layers: LayerDoc['layers']) => {
    const doc = migrateLayerDoc({ v: 1, width: 1080, height: 1350, layers }, { id: id(1), pageId: id(2),
      nodeIds: layers.map((_, n) => id(10 + n)) }, base)
    const recorder = recordingContext()
    drawDesignPage(recorder.ctx, doc.pages[0], images, (name) => name)
    return recorder.calls
  }

  it('draws an image crop (source fractions) stretched into the box, like layer-canvas', () => {
    const calls = draw([{ id: 'i', kind: 'image', assetId: asset, role: 'upload', x: 10, y: 20, w: 300, h: 50, crop: { x: 0.25, y: 0.5, w: 0.5, h: 0.5 } }])
    const photo = calls.filter((call) => call[0] === 'drawImage').at(-1)
    expect(photo).toEqual(['drawImage', images.get(asset)!.image, 100, 100, 200, 100, 0, 0, 300, 50])
  })

  it('lays a layer gradient out exactly as layer-canvas does, for every angle and radial', () => {
    for (const angle of [0, 45, 90, 135, 180, 225, 270, 315, -30]) {
      for (const kind of ['linear', 'radial'] as const) {
        const box = { x: 10, y: 20, w: 200, h: 100 }
        const gradient = { kind, angle, stops: [{ offset: 0, color: '#FF0000', alpha: 1 }, { offset: 1, color: '#0000FF', alpha: 0.3 }] }
        const calls = draw([{ id: 's', kind: 'shape', shape: 'rect', ...box, color: '#123456', radius: 0, strokeColor: '#000000',
          strokeWidth: 0, gradient }])
        const created = calls.find((call) => call[0] === 'gradient')!
        // layer-canvas: in canvas px over the box; design-canvas: in the node's local frame (origin at the box corner).
        const expected = gradientGeometry(gradient, { ...box, x: 0, y: 0 })
        const numbers = (created.slice(2) as number[]).map((n) => Math.round(n * 1e6) / 1e6 + 0)
        const want = expected.kind === 'linear' ? [expected.x0, expected.y0, expected.x1, expected.y1]
          : [expected.cx, expected.cy, 0, expected.cx, expected.cy, expected.r]
        expect([created[1], ...numbers], `${kind} ${angle}`).toEqual([kind, ...want.map((n) => Math.round(n * 1e6) / 1e6 + 0)])
        const fill = calls.find((call) => call[0] === 'fill')![1] as { stops: [number, string][] }
        expect(fill.stops).toEqual([[0, 'rgba(255,0,0,1)'], [1, 'rgba(0,0,255,0.3)']])
      }
    }
  })
})
