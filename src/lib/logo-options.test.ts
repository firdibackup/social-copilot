import { describe, expect, it } from 'vitest'
import { DEFAULT_LOGO_PLACEMENT, LOGO_POSITIONS, logoBox, logoClearanceRule, readLogoPlacement } from './logo-options'

const SLIDE = { width: 1080, height: 1350 }

describe('logoBox', () => {
  it('puts a square logo of medium size in the bottom right, a margin from both edges', () => {
    expect(logoBox(SLIDE, { width: 500, height: 500 }, DEFAULT_LOGO_PLACEMENT)).toEqual({ left: 929, top: 1199, width: 108, height: 108 })
  })

  it('keeps the logo inside the slide at every position and size', () => {
    for (const position of LOGO_POSITIONS) {
      for (const size of ['small', 'medium', 'large'] as const) {
        for (const logo of [{ width: 800, height: 200 }, { width: 200, height: 800 }, { width: 300, height: 300 }]) {
          const box = logoBox(SLIDE, logo, { position, size })
          expect(box.left).toBeGreaterThanOrEqual(0)
          expect(box.top).toBeGreaterThanOrEqual(0)
          expect(box.left + box.width).toBeLessThanOrEqual(SLIDE.width)
          expect(box.top + box.height).toBeLessThanOrEqual(SLIDE.height)
        }
      }
    }
  })

  it('centres the middle positions and mirrors left and right', () => {
    const logo = { width: 400, height: 400 }
    const left = logoBox(SLIDE, logo, { position: 'top-left', size: 'small' })
    const centre = logoBox(SLIDE, logo, { position: 'top-center', size: 'small' })
    const right = logoBox(SLIDE, logo, { position: 'top-right', size: 'small' })
    expect(left).toMatchObject({ left: 43, top: 43, width: 76, height: 76 })
    expect(centre.left).toBe(502)
    expect(right.left).toBe(SLIDE.width - 43 - 76)
  })

  it('gives a wide wordmark the height of a square logo, and keeps its proportions', () => {
    const box = logoBox(SLIDE, { width: 800, height: 400 }, { position: 'bottom-left', size: 'medium' })
    expect(box).toMatchObject({ width: 216, height: 108 })
    // A very wide one stops at the width limit instead.
    expect(logoBox(SLIDE, { width: 1000, height: 100 }, { position: 'bottom-left', size: 'medium' })).toMatchObject({ width: 270, height: 27 })
  })

  it('grows with the size', () => {
    const widths = (['small', 'medium', 'large'] as const).map((size) => logoBox(SLIDE, { width: 100, height: 100 }, { position: 'top-left', size }).width)
    expect(widths).toEqual([76, 108, 151])
  })
})

describe('readLogoPlacement', () => {
  it('keeps known values and falls back to the default', () => {
    expect(readLogoPlacement('top-left', 'large')).toEqual({ position: 'top-left', size: 'large' })
    expect(readLogoPlacement('constructor', undefined)).toEqual(DEFAULT_LOGO_PLACEMENT)
  })
})

describe('logoClearanceRule', () => {
  it('names the logo\'s place and forbids a drawn logo', () => {
    const rule = logoClearanceRule({ position: 'top-center', size: 'small' })
    expect(rule).toContain('do not draw any logo')
    expect(rule).toContain('top edge, in the centre')
  })
})
