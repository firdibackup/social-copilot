import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  MimoTour,
  baseSize,
  clampSpot,
  dockSize,
  easeInOut,
  flightControl,
  flightPoint,
  inPressWindow,
  perchPoint,
  pressPoint,
  resolvePhase,
  smoothstep,
  speedStretch,
  splitRanges,
  stopRange,
  type Box,
} from './mimo-tour'

const box = (left: number, top: number, width: number, height: number): Box => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
})

// Geometry and motion need browser QA; these cover the SSR contract and the pure math.
describe('MimoTour SSR', () => {
  it.each([true, false])('renders nothing on the server (enabled=%s)', enabled => {
    const html = renderToStaticMarkup(<MimoTour enabled={enabled} />)
    expect(html).toBe('')
    expect(html).not.toContain('data-mascot')
  })
})

describe('ranges', () => {
  it('starts each stop at 62% of the viewport, the first at 0', () => {
    expect(stopRange(1000, 1500, 1000, false)).toEqual({ from: 380, to: 880 })
    expect(stopRange(100, 900, 1000, true)).toEqual({ from: 0, to: 280 })
  })

  it('never ends before it starts', () => {
    expect(stopRange(0, 200, 1000, true)).toEqual({ from: 0, to: 0 })
  })

  it('leaves far-apart ranges alone', () => {
    const ranges = [
      { from: 0, to: 300 },
      { from: 500, to: 900 },
    ]
    expect(splitRanges(ranges)).toEqual(ranges)
  })

  it('splits close or overlapping ranges at the midpoint, 20px each side', () => {
    expect(
      splitRanges([
        { from: 0, to: 300 },
        { from: 310, to: 900 },
      ]),
    ).toEqual([
      { from: 0, to: 285 },
      { from: 325, to: 900 },
    ])
    expect(
      splitRanges([
        { from: 0, to: 500 },
        { from: 400, to: 900 },
      ]),
    ).toEqual([
      { from: 0, to: 430 },
      { from: 470, to: 900 },
    ])
  })

  it('does not mutate its input', () => {
    const input = [
      { from: 0, to: 300 },
      { from: 310, to: 900 },
    ]
    splitRanges(input)
    expect(input[0].to).toBe(300)
  })

  it('resolves perches and eased flights', () => {
    const ranges = [
      { from: 0, to: 300 },
      { from: 500, to: 900 },
    ]
    expect(resolvePhase(100, [])).toBeNull()
    expect(resolvePhase(100, ranges)).toEqual({ kind: 'perch', index: 0 })
    expect(resolvePhase(700, ranges)).toEqual({ kind: 'perch', index: 1 })
    expect(resolvePhase(5000, ranges)).toEqual({ kind: 'perch', index: 1 })
    expect(resolvePhase(400, ranges)).toEqual({ kind: 'flight', from: 0, to: 1, u: 0.5 })
    const early = resolvePhase(325, ranges)
    expect(early?.kind).toBe('flight')
    if (early?.kind === 'flight') expect(early.u).toBeCloseTo(easeInOut(0.125))
  })

  it('sizes a docked Mimo to fill its seat', () => {
    expect(dockSize({ left: 0, top: 0, right: 64, bottom: 64, width: 64, height: 64 })).toBeCloseTo(86.4)
  })

  it('presses only around the middle of the range', () => {
    const range = { from: 0, to: 1000 }
    expect(inPressWindow(500, range, 1000)).toBe(true)
    expect(inPressWindow(545, range, 1000)).toBe(true)
    expect(inPressWindow(546, range, 1000)).toBe(false)
  })
})

describe('easing', () => {
  it('eases in and out symmetrically', () => {
    expect(easeInOut(0)).toBe(0)
    expect(easeInOut(1)).toBe(1)
    expect(easeInOut(0.5)).toBeCloseTo(0.5)
    expect(easeInOut(0.25) + easeInOut(0.75)).toBeCloseTo(1)
  })

  it('grows the first stop with smoothstep(.03, .15)', () => {
    expect(smoothstep(0.03, 0.15, 0)).toBe(0)
    expect(smoothstep(0.03, 0.15, 0.03)).toBe(0)
    expect(smoothstep(0.03, 0.15, 0.09)).toBeCloseTo(0.5)
    expect(smoothstep(0.03, 0.15, 0.2)).toBe(1)
  })
})

describe('flight', () => {
  const a = { x: 100, y: 500 }
  const b = { x: 700, y: 300 }

  it('lifts the control point above the higher end', () => {
    const dist = Math.hypot(600, 200)
    expect(flightControl(a, b, 1000)).toEqual({ x: 400, y: 300 - dist * 0.35 })
    // Short hops still arc at least 24px; long ones at most 28vh.
    expect(flightControl({ x: 0, y: 100 }, { x: 10, y: 100 }, 1000).y).toBe(76)
    expect(flightControl({ x: 0, y: 900 }, { x: 3000, y: 900 }, 1000).y).toBeCloseTo(620)
  })

  it('starts at A, ends at B and peaks above both', () => {
    expect(flightPoint(a, b, 0, 1000)).toEqual(a)
    expect(flightPoint(a, b, 1, 1000)).toEqual(b)
    const mid = flightPoint(a, b, 0.5, 1000)
    expect(mid.x).toBeCloseTo(400)
    expect(mid.y).toBeLessThan(300)
  })
})

describe('perch geometry', () => {
  const rect = box(100, 400, 200, 60)

  it('sits on top, near the right edge, by default', () => {
    expect(perchPoint(rect, 'top', 100, 1200)).toEqual({ x: 272, y: 367 })
  })

  it('sits beside the element when there is room, otherwise on top', () => {
    expect(perchPoint(rect, 'right', 100, 1200)).toEqual({ x: 356, y: 430 })
    expect(perchPoint(rect, 'right', 100, 350)).toEqual(perchPoint(rect, 'top', 100, 350))
    expect(perchPoint(box(300, 400, 200, 60), 'left', 100, 1200)).toEqual({ x: 244, y: 430 })
    expect(perchPoint(rect, 'left', 100, 1200)).toEqual(perchPoint(rect, 'top', 100, 1200))
  })

  it('centers on the element', () => {
    expect(perchPoint(rect, 'center', 100, 1200)).toEqual({ x: 200, y: 430 })
  })

  it('stands just above a button to press it', () => {
    expect(pressPoint(rect, 80)).toEqual({ x: 200, y: 376 })
  })

  it('stays inside the viewport and below the header', () => {
    expect(clampSpot({ x: -50, y: -50 }, 100, 1200, 800)).toEqual({ x: 56, y: 100 })
    expect(clampSpot({ x: 5000, y: 5000 }, 100, 1200, 800)).toEqual({ x: 1144, y: 755 })
    expect(clampSpot({ x: 600, y: 400 }, 100, 1200, 800)).toEqual({ x: 600, y: 400 })
  })

  it('sizes the mascot from the viewport', () => {
    expect(baseSize(400, 800)).toBe(74)
    expect(baseSize(1440, 500)).toBe(86)
    expect(baseSize(1440, 800)).toBeCloseTo(104)
    expect(baseSize(1440, 2000)).toBe(124)
  })
})

describe('speed stretch', () => {
  it('is zero at rest, taller when falling and wider when gliding', () => {
    expect(speedStretch(0, 0)).toBe(0)
    expect(speedStretch(0, 2600)).toBeCloseTo(0.16)
    expect(speedStretch(2600, 0)).toBeCloseTo(-0.16)
    expect(speedStretch(0, 260)).toBeCloseTo(0.1)
    // Neutral where |vy| is half the speed (60° off vertical).
    expect(speedStretch(Math.sqrt(3) * 500, 500)).toBeCloseTo(0)
  })
})
