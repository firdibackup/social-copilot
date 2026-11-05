import { describe, expect, it } from 'vitest'
import { drawDoc, layerUploadAttempts, layoutText, textCss, type DrawContext } from './layer-canvas'
import type { LayerDoc, TextLayer } from './layer-doc'

/** Every character is size/2 px wide; ascent 0.8·size, descent 0.2·size. */
function fakeContext() {
  const calls: unknown[][] = []
  const ctx: DrawContext & { calls: unknown[][] } = {
    calls,
    font: '',
    fillStyle: '#000',
    textBaseline: 'alphabetic',
    textAlign: 'left',
    measureText(text: string) {
      const size = Number(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? 10)
      return { width: (text.length * size) / 2, fontBoundingBoxAscent: size * 0.8, fontBoundingBoxDescent: size * 0.2 }
    },
    drawImage: (...args: unknown[]) => { calls.push(['drawImage', ...args]) },
    fillText: (...args: unknown[]) => { calls.push(['fillText', ...args]) },
  }
  return ctx
}

const layer: TextLayer = {
  id: 't1', kind: 'text', x: 100, y: 200, w: 200, h: 10, text: 'aaaa bbbb cccc', font: 'Inter', size: 20, weight: 700,
  color: '#FF0000', align: 'center', lineHeight: 1.5,
}

describe('layoutText', () => {
  it('wraps to the box and positions lines like the editor', () => {
    const ctx = fakeContext()
    const { lines, height } = layoutText(ctx, layer, 'Inter')
    expect(ctx.font).toBe('700 20px Inter')
    // 10 px per char: "aaaa bbbb" = 90 px fits 200? 9 chars ·10 = 90; "aaaa bbbb cccc" = 140 fits too.
    expect(lines.map((line) => line.text)).toEqual(['aaaa bbbb cccc'])
    expect(lines[0]).toMatchObject({ x: 100 + (200 - 140) / 2, top: 200, baseline: 200 + (30 - 20) / 2 + 16 })
    expect(height).toBe(30)
    const narrow = layoutText(ctx, { ...layer, w: 95 }, 'Inter')
    expect(narrow.lines.map((line) => [line.text, line.top])).toEqual([['aaaa bbbb', 200], ['cccc', 230]])
    expect(narrow.height).toBe(60)
  })
})

describe('drawDoc', () => {
  it('draws the background, then layers back to front', () => {
    const ctx = fakeContext()
    const base = {} as CanvasImageSource
    const logo = {} as CanvasImageSource
    const doc: LayerDoc = {
      v: 1, width: 1080, height: 1350,
      layers: [
        { id: 'i1', kind: 'image', assetId: 'a', role: 'logo', x: 1, y: 2, w: 3, h: 4 },
        layer,
        { id: 'i2', kind: 'image', assetId: 'missing', role: 'upload', x: 0, y: 0, w: 1, h: 1 },
      ],
    }
    drawDoc(ctx, doc, base, new Map([['a', logo]]), (font) => font)
    expect(ctx.calls).toEqual([
      ['drawImage', base, 0, 0, 1080, 1350],
      ['drawImage', logo, 1, 2, 3, 4],
      ['fillText', 'aaaa bbbb cccc', 130, 221],
    ])
    expect(ctx.fillStyle).toBe('#FF0000')
  })
})

/** Like fakeContext, but records drawing state, and optionally spaces letters natively. */
function styledContext(native: boolean) {
  const calls: unknown[][] = []
  const ctx: DrawContext & { calls: unknown[][] } = {
    calls,
    font: '',
    fillStyle: '#000',
    textBaseline: 'alphabetic',
    textAlign: 'left',
    globalAlpha: 1,
    shadowColor: 'rgba(0,0,0,0)',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    ...(native ? { letterSpacing: '0px' } : {}),
    measureText(text: string) {
      const size = Number(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? 10)
      const spacing = native ? Number.parseFloat(this.letterSpacing ?? '0') : 0
      return { width: (text.length * size) / 2 + spacing * text.length, fontBoundingBoxAscent: size * 0.8, fontBoundingBoxDescent: size * 0.2 }
    },
    drawImage(...args: unknown[]) { calls.push(['drawImage', args[1], this.globalAlpha]) },
    fillText(text: string, x: number, y: number) {
      calls.push(['fillText', text, x, y, { font: this.font, alpha: this.globalAlpha, shadow: [this.shadowColor, this.shadowBlur, this.shadowOffsetY] }])
    },
    fillRect(...args: number[]) { calls.push(['fillRect', ...args]) },
  }
  return ctx
}

describe('text styling', () => {
  // 20 px font: 10 px per char; 0.1 em spacing = 2 px per char.
  const styled: TextLayer = { ...layer, text: 'ab cd', uppercase: true, letterSpacing: 0.1 }

  it('measures uppercase text with its spacing, natively or not', () => {
    for (const native of [false, true]) {
      const ctx = styledContext(native)
      const { lines } = layoutText(ctx, styled, 'Inter')
      expect(lines).toEqual([expect.objectContaining({ text: 'AB CD', width: 60, x: 100 + (200 - 60) / 2 })])
      if (native) expect(ctx.letterSpacing).toBe('2px')
    }
    // Spacing makes it wrap: 5 chars = 60 px > 55.
    expect(layoutText(styledContext(false), { ...styled, w: 55 }, 'Inter').lines.map((line) => line.text)).toEqual(['AB', 'CD'])
  })

  it('draws characters one by one without native spacing', () => {
    const ctx = styledContext(false)
    drawDoc(ctx, { v: 1, width: 1080, height: 1350, layers: [{ ...styled, text: 'ab' }] }, {} as CanvasImageSource, new Map(), (font) => font)
    const texts = ctx.calls.filter((call) => call[0] === 'fillText').map((call) => [call[1], call[2]])
    expect(texts).toEqual([['A', 188], ['B', 200]])
  })

  it('draws whole lines with native spacing', () => {
    const ctx = styledContext(true)
    drawDoc(ctx, { v: 1, width: 1080, height: 1350, layers: [{ ...styled, text: 'ab' }] }, {} as CanvasImageSource, new Map(), (font) => font)
    expect(ctx.calls.filter((call) => call[0] === 'fillText').map((call) => call[1])).toEqual(['AB'])
  })

  it('applies italic, opacity, shadow and underline, then restores the context', () => {
    const ctx = styledContext(true)
    const image = {} as CanvasImageSource
    const doc: LayerDoc = {
      v: 1, width: 1080, height: 1350,
      layers: [
        { ...layer, text: 'aa\n\nbb', italic: true, opacity: 0.5, shadow: true, underline: true },
        { id: 'i1', kind: 'image', assetId: 'a', role: 'upload', x: 0, y: 0, w: 10, h: 10, opacity: 0.25 },
        { id: 'i2', kind: 'image', assetId: 'a', role: 'upload', x: 0, y: 0, w: 10, h: 10 },
      ],
    }
    drawDoc(ctx, doc, {} as CanvasImageSource, new Map([['a', image]]), (font) => font)
    const shadow = ['rgba(0,0,0,0.45)', 20 * 0.08, 20 * 0.04]
    expect(ctx.calls.slice(1)).toEqual([
      ['fillText', 'aa', 190, 221, { font: 'italic 700 20px Inter', alpha: 0.5, shadow }],
      ['fillRect', 190, 223, 20, 1.2],
      // The empty line has no text and no underline.
      ['fillText', 'bb', 190, 281, { font: 'italic 700 20px Inter', alpha: 0.5, shadow }],
      ['fillRect', 190, 283, 20, 1.2],
      ['drawImage', 0, 0.25],
      ['drawImage', 0, 1],
    ])
    expect(ctx.globalAlpha).toBe(1)
    expect([ctx.shadowBlur, ctx.shadowOffsetY]).toEqual([0, 0])
  })

  it('underlines at least 1 px thick', () => {
    const ctx = styledContext(true)
    drawDoc(ctx, { v: 1, width: 1080, height: 1350, layers: [{ ...layer, size: 12, underline: true }] }, {} as CanvasImageSource, new Map(), (font) => font)
    expect(ctx.calls.find((call) => call[0] === 'fillRect')?.[4]).toBe(1)
  })
})

describe('textCss', () => {
  it('matches the canvas styling', () => {
    expect(textCss({ ...layer, italic: true, underline: true, uppercase: true, letterSpacing: 0.25, opacity: 0.6, shadow: true, weight: 300 }, 'Inter'))
      .toEqual({
        fontFamily: 'Inter', fontWeight: 300, fontStyle: 'italic', fontSize: '20px', letterSpacing: '5px',
        textDecoration: 'underline', textUnderlineOffset: '2px', textDecorationThickness: '1.2px', textTransform: 'uppercase',
        opacity: 0.6, textShadow: '0 0.8px 1.6px rgba(0,0,0,0.45)', whiteSpace: 'pre',
      })
  })

  it('uses plain defaults when nothing is set', () => {
    expect(textCss(layer, 'Inter')).toMatchObject({
      fontStyle: 'normal', letterSpacing: '0px', textDecoration: 'none', textTransform: 'none', opacity: 1, textShadow: 'none',
    })
  })
})

describe('layerUploadAttempts', () => {
  it('keeps transparency as PNG, stepping down in size from at most 1600 px', () => {
    const attempts = layerUploadAttempts(3200, 1600, 'image/webp')
    expect(attempts[0]).toEqual({ width: 1600, height: 800, type: 'image/png' })
    expect(attempts.every((attempt) => attempt.type === 'image/png' && attempt.quality === undefined)).toBe(true)
    expect(attempts[1]).toEqual({ width: 1360, height: 680, type: 'image/png' })
    expect(attempts.at(-1)!.width).toBeLessThan(attempts[1].width)
    expect(layerUploadAttempts(400, 300, 'image/png')[0]).toEqual({ width: 400, height: 300, type: 'image/png' })
    expect(layerUploadAttempts(400, 300, 'image/gif')[0].type).toBe('image/png')
  })

  it('encodes anything else as JPEG 0.9, lowering quality before size', () => {
    const attempts = layerUploadAttempts(1000, 2000, 'image/jpeg')
    expect(attempts.slice(0, 4)).toEqual([0.9, 0.8, 0.7, 0.6].map((quality) => ({ width: 800, height: 1600, quality, type: 'image/jpeg' })))
    expect(attempts[4].width).toBeLessThan(800)
    expect(layerUploadAttempts(100, 100, '')[0].type).toBe('image/jpeg')
  })
})
