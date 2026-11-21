import { describe, expect, it } from 'vitest'
import {
  copyGradient, designGradientAngle, GRADIENT_PRESETS, gradientCss, gradientGeometry, gradientPreset, gradientStyle,
  isGradient, OVERLAY_PRESETS, parseGradient, stopCss, type Gradient,
} from './gradients'

const linear: Gradient = { kind: 'linear', angle: 90, stops: [
  { offset: 0, color: '#ff0000', alpha: 1 }, { offset: 1, color: '#0000FF', alpha: 0.25 },
] }

/** Records the gradient factories and colour stops. */
function gradientContext() {
  const calls: unknown[][] = []
  const make = (name: string) => (...args: number[]) => {
    calls.push([name, ...args])
    return { addColorStop: (offset: number, color: string) => { calls.push(['stop', offset, color]) } } as CanvasGradient
  }
  return { calls, createLinearGradient: make('linear'), createRadialGradient: make('radial') }
}

describe('parseGradient', () => {
  it('accepts a valid gradient as an upper-cased copy', () => {
    const parsed = parseGradient(linear)
    expect(parsed).toEqual({ ...linear, stops: [{ offset: 0, color: '#FF0000', alpha: 1 }, { offset: 1, color: '#0000FF', alpha: 0.25 }] })
    expect(parsed?.stops).not.toBe(linear.stops)
    expect(isGradient({ kind: 'radial', angle: 0, stops: linear.stops })).toBe(true)
  })

  it('refuses bad kinds, angles, stops, colours, alphas, order and unknown keys', () => {
    const stop = { offset: 0, color: '#000000', alpha: 1 }
    for (const bad of [
      null, [], { ...linear, kind: 'conic' }, { ...linear, angle: 400 }, { ...linear, angle: Number.NaN },
      { ...linear, extra: 1 }, { ...linear, stops: [stop] }, { ...linear, stops: Array.from({ length: 11 }, () => stop) },
      { ...linear, stops: [stop, { ...stop, color: 'red' }] }, { ...linear, stops: [stop, { ...stop, alpha: 1.5 }] },
      { ...linear, stops: [stop, { ...stop, alpha: -0.1 }] }, { ...linear, stops: [{ ...stop, offset: 0.6 }, { ...stop, offset: 0.4 }] },
      { ...linear, stops: [stop, { ...stop, offset: 1.2 }] }, { ...linear, stops: [stop, { ...stop, glow: true }] },
      { kind: 'linear', stops: linear.stops },
    ]) expect(parseGradient(bad)).toBeNull()
  })
})

describe('gradient geometry', () => {
  const box = { x: 10, y: 20, w: 200, h: 100 }
  it('follows CSS angles: 0° up, 90° right, 180° down', () => {
    expect(gradientGeometry({ kind: 'linear', angle: 90 }, box)).toMatchObject({ x0: 10, y0: 70, x1: 210, y1: 70 })
    const down = gradientGeometry({ kind: 'linear', angle: 180 }, box)
    expect(down.kind === 'linear' && [down.x0, down.y0, down.x1, down.y1].map((n) => Math.round(n * 1e6) / 1e6)).toEqual([110, 20, 110, 120])
    const up = gradientGeometry({ kind: 'linear', angle: 0 }, box)
    expect(up.kind === 'linear' && [up.y0, up.y1]).toEqual([120, 20])
  })

  it('spans a diagonal like CSS and radiates to the farthest corner', () => {
    const diagonal = gradientGeometry({ kind: 'linear', angle: 45 }, { x: 0, y: 0, w: 100, h: 100 })
    if (diagonal.kind !== 'linear') throw new Error('linear')
    // CSS: line length |w sin a| + |h cos a| = 100√2, through the centre.
    expect(Math.hypot(diagonal.x1 - diagonal.x0, diagonal.y1 - diagonal.y0)).toBeCloseTo(100 * Math.SQRT2)
    expect(diagonal.x1).toBeCloseTo(100)
    expect(diagonal.y1).toBeCloseTo(0)
    expect(gradientGeometry({ kind: 'radial', angle: 0 }, { x: 0, y: 0, w: 60, h: 80 })).toEqual({ kind: 'radial', cx: 30, cy: 40, r: 50 })
  })

  it('creates a canvas gradient with rgba stops', () => {
    const ctx = gradientContext()
    gradientStyle(ctx, linear, box)
    expect(ctx.calls).toEqual([['linear', 10, 70, 210, 70], ['stop', 0, 'rgba(255,0,0,1)'], ['stop', 1, 'rgba(0,0,255,0.25)']])
    const radial = gradientContext()
    gradientStyle(radial, { ...linear, kind: 'radial' }, { x: 0, y: 0, w: 60, h: 80 })
    expect(radial.calls[0]).toEqual(['radial', 30, 40, 0, 30, 40, 50])
  })

  it('converts to design angles and to CSS', () => {
    expect([0, 90, 180, 270, -90, 360].map(designGradientAngle)).toEqual([270, 0, 90, 180, 180, 270])
    expect(stopCss({ color: '#0A0B0C', alpha: 0 })).toBe('rgba(10,11,12,0)')
    expect(gradientCss(linear)).toBe('linear-gradient(90deg, rgba(255,0,0,1) 0%, rgba(0,0,255,0.25) 100%)')
    expect(gradientCss({ ...linear, kind: 'radial' })).toMatch(/^radial-gradient\(circle farthest-corner at 50% 50%, /)
  })
})

describe('presets', () => {
  it('are many, valid, uniquely named and include transparent fades', () => {
    expect(GRADIENT_PRESETS.length).toBeGreaterThanOrEqual(24)
    expect(OVERLAY_PRESETS.length).toBeGreaterThanOrEqual(8)
    const all = [...GRADIENT_PRESETS, ...OVERLAY_PRESETS]
    expect(new Set(all.map((item) => item.id)).size).toBe(all.length)
    for (const item of all) expect(parseGradient(item.gradient), item.id).toEqual(item.gradient)
    expect(GRADIENT_PRESETS.some((item) => item.gradient.stops.some((stop) => stop.alpha === 0))).toBe(true)
    expect(OVERLAY_PRESETS.every((item) => item.gradient.stops.some((stop) => stop.alpha < 1))).toBe(true)
    expect(gradientPreset('vignette')?.gradient.kind).toBe('radial')
    expect(gradientPreset('nope')).toBeUndefined()
  })

  it('copies deeply', () => {
    const copy = copyGradient(linear)
    copy.stops[0].alpha = 0
    expect(linear.stops[0].alpha).toBe(1)
  })
})
