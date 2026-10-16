import { describe, expect, it } from 'vitest'
import { extractPalette } from './palette'

/** RGBA pixels: `count` copies of each colour. */
function pixels(...colours: [r: number, g: number, b: number, count: number, alpha?: number][]): number[] {
  return colours.flatMap(([r, g, b, count, alpha = 255]) => Array.from({ length: count }, () => [r, g, b, alpha]).flat())
}

describe('extractPalette', () => {
  it('returns the most common colours first', () => {
    const image = pixels([200, 30, 30, 50], [20, 20, 160, 30], [250, 250, 250, 10])

    expect(extractPalette(image)).toEqual(['#c81e1e', '#1414a0', '#fafafa'])
  })

  it('skips shades too close to a colour already taken', () => {
    const image = pixels([200, 30, 30, 50], [210, 40, 35, 40], [20, 20, 160, 10])

    expect(extractPalette(image)).toEqual(['#c81e1e', '#1414a0'])
  })

  it('ignores transparent pixels and stops at the requested count', () => {
    const image = pixels([0, 0, 0, 100, 0], [255, 0, 0, 3], [0, 255, 0, 2], [0, 0, 255, 1])

    expect(extractPalette(image, 2)).toEqual(['#ff0000', '#00ff00'])
  })

  it('returns nothing for an empty or fully transparent image', () => {
    expect(extractPalette([])).toEqual([])
    expect(extractPalette(pixels([10, 10, 10, 5, 0]))).toEqual([])
  })
})
