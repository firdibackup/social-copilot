import { describe, expect, it } from 'vitest'
import { drawDoc, drawFrame, drawImageLayer, drawPath, drawShape, layerUploadAttempts, layoutText, textCss, type DrawContext } from './layer-canvas'
import type { LayerDoc, PathLayer, TextLayer } from './layer-doc'
import { isLineKind, SHAPE_KINDS } from './shape-paths'

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

/** A fake that records every path call. */
function pathContext() {
  const ctx = fakeContext()
  const record = (name: string) => (...args: unknown[]) => { ctx.calls.push([name, ...args]) }
  ctx.beginPath = () => { ctx.calls.push(['begin']) }
  ctx.moveTo = record('moveTo')
  ctx.lineTo = record('lineTo')
  ctx.bezierCurveTo = record('bezierCurveTo')
  ctx.quadraticCurveTo = record('quadraticCurveTo')
  ctx.arc = record('arc')
  ctx.ellipse = record('ellipse')
  ctx.roundRect = record('roundRect')
  ctx.closePath = record('closePath')
  ctx.fill = record('fill')
  ctx.stroke = record('stroke')
  ctx.setLineDash = record('setLineDash')
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
  it('omits hidden layers and restores the transform after rotated elements', () => {
    const ctx = fakeContext()
    ctx.save = () => { ctx.calls.push(['save']) }
    ctx.restore = () => { ctx.calls.push(['restore']) }
    ctx.translate = (x, y) => { ctx.calls.push(['translate', x, y]) }
    ctx.rotate = (angle) => { ctx.calls.push(['rotate', angle]) }
    drawDoc(ctx, { v: 1, width: 1080, height: 1350, layers: [{ ...layer, hidden: true }, { ...layer, id: 't2', rotation: 90 }] },
      {} as CanvasImageSource, new Map(), (font) => font)
    expect(ctx.calls.filter((call) => call[0] === 'fillText')).toHaveLength(1)
    expect(ctx.calls).toContainEqual(['rotate', Math.PI / 2])
    expect(ctx.calls.at(-1)).toEqual(['restore'])
  })

  it('draws shape fills separately from line and arrow strokes', () => {
    const ctx = fakeContext()
    ctx.beginPath = () => { ctx.calls.push(['begin']) }
    ctx.fill = () => { ctx.calls.push(['fill']) }
    ctx.stroke = () => { ctx.calls.push(['stroke']) }
    ctx.lineTo = (x, y) => { ctx.calls.push(['line', x, y]) }
    const shape = { id: 's1', kind: 'shape' as const, shape: 'arrow' as const, x: 10, y: 20, w: 200, h: 40,
      color: '#FFFFFF', strokeColor: '#000000', strokeWidth: 5, radius: 0 }
    drawShape(ctx, shape)
    expect(ctx.calls).not.toContainEqual(['fill'])
    expect(ctx.calls).toContainEqual(['line', 210, 40])
    expect(ctx.calls.at(-1)).toEqual(['stroke'])
    drawShape(ctx, { ...shape, shape: 'rect' })
    expect(ctx.calls).toContainEqual(['fill'])
  })
  it('traces every shape kind: closed ones fill (holes even-odd), lines only stroke', () => {
    for (const shape of SHAPE_KINDS) {
      const ctx = pathContext()
      drawShape(ctx, { id: 's', kind: 'shape', shape, x: 10, y: 20, w: 300, h: 120, color: '#FFFFFF',
        strokeColor: '#000000', strokeWidth: 4, radius: 12 })
      const names = ctx.calls.map((call) => call[0])
      expect(names[0]).toBe('begin')
      expect(names.filter((name) => ['moveTo', 'lineTo', 'bezierCurveTo', 'quadraticCurveTo', 'ellipse', 'roundRect'].includes(name as string)).length)
        .toBeGreaterThan(0)
      const fill = ctx.calls.find((call) => call[0] === 'fill')
      if (isLineKind(shape)) expect(fill).toBeUndefined()
      else expect(fill).toEqual(['fill', ['ring', 'frame', 'moon'].includes(shape) ? 'evenodd' : 'nonzero'])
      expect(names.at(-2)).toBe('stroke')
      for (const call of ctx.calls) for (const value of call.slice(1)) if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true)
    }
  })

  it('keeps the original arrow and rect geometry', () => {
    const ctx = pathContext()
    drawShape(ctx, { id: 's', kind: 'shape', shape: 'arrow', x: 10, y: 20, w: 200, h: 40, color: '#FFFFFF',
      strokeColor: '#000000', strokeWidth: 5, radius: 0 })
    expect(ctx.calls.filter((call) => call[0] === 'moveTo' || call[0] === 'lineTo')).toEqual([
      ['moveTo', 10, 40], ['lineTo', 210, 40], ['moveTo', 190, 20], ['lineTo', 210, 40], ['lineTo', 190, 60],
    ])
    drawShape(ctx, { id: 's', kind: 'shape', shape: 'rect', x: 0, y: 0, w: 100, h: 40, color: '#FFFFFF',
      strokeColor: '#000000', strokeWidth: 0, radius: 50 })
    expect(ctx.calls).toContainEqual(['roundRect', 0, 0, 100, 40, 20])
  })

  it('dashes strokes by their width and dots them with round caps', () => {
    const base = { id: 's', kind: 'shape' as const, shape: 'line' as const, x: 0, y: 0, w: 100, h: 40, color: '#FFFFFF',
      strokeColor: '#000000', strokeWidth: 4, radius: 0 }
    const dashed = pathContext()
    drawShape(dashed, { ...base, dash: 'dashed' })
    expect(dashed.calls).toContainEqual(['setLineDash', [12, 8]])
    expect(dashed.lineCap).toBe('butt')
    const dotted = pathContext()
    drawShape(dotted, { ...base, dash: 'dotted' })
    expect(dotted.calls).toContainEqual(['setLineDash', [0, 8]])
    expect(dotted.lineCap).toBe('round')
    const solid = pathContext()
    drawShape(solid, base)
    expect(solid.calls).toContainEqual(['setLineDash', []])
    // The dash never leaks into the next drawing.
    expect(dashed.calls.at(-1)).toEqual(['setLineDash', []])
  })

  it('draws free paths in their box: beziers where handles exist, straight otherwise', () => {
    const path: PathLayer = { id: 'p', kind: 'path', x: 100, y: 200, w: 200, h: 100, closed: true, fill: true,
      color: '#FF0000', strokeColor: '#000000', strokeWidth: 2,
      points: [{ x: 0, y: 0, out: { x: 0.5, y: -0.5 } }, { x: 1, y: 0 }, { x: 1, y: 1, in: { x: 1.5, y: 0.5 } }, { x: 0, y: 1 }] }
    const ctx = pathContext()
    drawPath(ctx, path)
    expect(ctx.calls.filter((call) => call[0] !== 'setLineDash')).toEqual([
      ['begin'], ['moveTo', 100, 200], ['bezierCurveTo', 200, 150, 300, 200, 300, 200], ['bezierCurveTo', 300, 200, 400, 250, 300, 300],
      ['lineTo', 100, 300], ['lineTo', 100, 200], ['closePath'], ['fill', 'nonzero'], ['stroke'],
    ])
    const open = pathContext()
    drawDoc(open, { v: 1, width: 1080, height: 1350, layers: [{ ...path, closed: false, fill: false }] },
      {} as CanvasImageSource, new Map(), (font) => font)
    expect(open.calls.map((call) => call[0])).not.toContain('fill')
    expect(open.calls.map((call) => call[0])).not.toContain('closePath')
    expect(open.calls.map((call) => call[0])).toContain('stroke')
  })

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

describe('image crop and gradient fills', () => {
  /** A fake that also records gradients (and their colour stops) and what fillStyle each fill/fillText used. */
  function gradientFake() {
    const ctx = pathContext()
    const make = (name: string) => (...args: number[]) => {
      const gradient = { name, args, stops: [] as [number, string][], addColorStop(offset: number, color: string) { this.stops.push([offset, color]) } }
      ctx.calls.push(['gradient', name, ...args])
      return gradient as unknown as CanvasGradient
    }
    ctx.createLinearGradient = make('linear')
    ctx.createRadialGradient = make('radial')
    ctx.fill = () => { ctx.calls.push(['fill', ctx.fillStyle]) }
    ctx.fillText = (text: string) => { ctx.calls.push(['fillText', text, ctx.fillStyle]) }
    return ctx
  }
  const gradient = { kind: 'linear' as const, angle: 90, stops: [{ offset: 0, color: '#FF0000', alpha: 1 }, { offset: 1, color: '#000000', alpha: 0 }] }

  it('draws the cropped part of the source stretched into the box', () => {
    const ctx = fakeContext()
    const source = { naturalWidth: 400, naturalHeight: 200 } as unknown as CanvasImageSource
    drawImageLayer(ctx, { id: 'i', kind: 'image', assetId: 'a', role: 'upload', x: 10, y: 20, w: 300, h: 50, crop: { x: 0.25, y: 0.5, w: 0.5, h: 0.5 } }, source)
    expect(ctx.calls).toEqual([['drawImage', source, 100, 100, 200, 100, 10, 20, 300, 50]])
    // Uncropped, or a source of unknown size: the plain 5-argument draw.
    const plain = fakeContext()
    drawImageLayer(plain, { id: 'i', kind: 'image', assetId: 'a', role: 'upload', x: 1, y: 2, w: 3, h: 4 }, source)
    expect(plain.calls).toEqual([['drawImage', source, 1, 2, 3, 4]])
  })

  it('fills shapes, paths and text with the gradient across their box, alpha as rgba', () => {
    const ctx = gradientFake()
    drawShape(ctx, { id: 's', kind: 'shape', shape: 'rect', x: 10, y: 20, w: 200, h: 100, color: '#123456', radius: 0,
      strokeColor: '#000000', strokeWidth: 0, gradient })
    const created = ctx.calls.find((call) => call[0] === 'gradient')
    expect(created).toEqual(['gradient', 'linear', 10, 70, 210, 70])
    const fill = ctx.calls.find((call) => call[0] === 'fill')?.[1] as unknown as { stops: [number, string][] }
    expect(fill.stops).toEqual([[0, 'rgba(255,0,0,1)'], [1, 'rgba(0,0,0,0)']])

    const path = gradientFake()
    drawPath(path, { id: 'p', kind: 'path', x: 0, y: 0, w: 60, h: 80, points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }], closed: true,
      fill: true, color: '#123456', strokeColor: '#000000', strokeWidth: 0, gradient: { ...gradient, kind: 'radial' } })
    expect(path.calls.find((call) => call[0] === 'gradient')).toEqual(['gradient', 'radial', 30, 40, 0, 30, 40, 50])

    const text = gradientFake()
    drawDoc(text, { v: 1, width: 1080, height: 1350, layers: [{ ...layer, gradient }] }, {} as CanvasImageSource, new Map(), (font) => font)
    const drawn = text.calls.find((call) => call[0] === 'fillText')
    expect((drawn?.[2] as unknown as { name: string }).name).toBe('linear')
  })

  it('keeps the plain colour for unfilled paths and contexts without gradients', () => {
    const ctx = pathContext()
    drawShape(ctx, { id: 's', kind: 'shape', shape: 'rect', x: 0, y: 0, w: 10, h: 10, color: '#123456', radius: 0,
      strokeColor: '#000000', strokeWidth: 0, gradient })
    expect(ctx.fillStyle).toBe('#123456')
  })
})

describe('drawFrame', () => {
  const frame = { id: 'f1', kind: 'frame', shape: 'ellipse', x: 0, y: 0, w: 200, h: 100, color: '#D9DCE3', radius: 0,
    strokeColor: '#000000', strokeWidth: 0 } as const

  it('draws nothing for an empty frame without a stroke', () => {
    const ctx = pathContext()
    drawFrame(ctx, frame, undefined)
    expect(ctx.calls.some((call) => call[0] === 'fill' || call[0] === 'drawImage' || call[0] === 'stroke')).toBe(false)
  })

  it('still strokes an empty frame', () => {
    const ctx = pathContext()
    drawFrame(ctx, { ...frame, strokeWidth: 2 }, undefined)
    expect(ctx.calls.at(-1)).toEqual(['stroke'])
    expect(ctx.calls.some((call) => call[0] === 'fill')).toBe(false)
  })

  it('clips the picture to the shape, covering the box from the centre, then strokes', () => {
    const ctx = pathContext()
    const clips: unknown[] = []
    ctx.save = () => {}
    ctx.restore = () => {}
    ctx.clip = (rule?: CanvasFillRule) => { clips.push(rule) }
    const image = { naturalWidth: 1000, naturalHeight: 1000 } as unknown as CanvasImageSource
    drawFrame(ctx, { ...frame, assetId: '11111111-1111-4111-8111-111111111111', strokeWidth: 3 }, image)
    expect(clips).toEqual(['nonzero'])
    expect(ctx.calls).toContainEqual(['drawImage', image, 0, 250, 1000, 500, 0, 0, 200, 100])
    expect(ctx.calls.at(-1)).toEqual(['stroke'])
    expect(ctx.calls).not.toContainEqual(['fill', 'nonzero'])
  })
})
