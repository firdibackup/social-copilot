import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { isHex } from './brand-options'
import { paletteFromBytes } from './image-palette'

describe('paletteFromBytes', () => {
  it('finds the colours of a picture on the server', async () => {
    const red = { r: 255, g: 0, b: 0 }
    const blue = { r: 0, g: 0, b: 255 }
    const png = await sharp({ create: { width: 2, height: 1, channels: 3, background: red } })
      .composite([{ input: { create: { width: 1, height: 1, channels: 3, background: blue } }, left: 1, top: 0 }])
      .png()
      .toBuffer()

    const palette = await paletteFromBytes(new Uint8Array(png))

    expect(palette.length).toBeGreaterThanOrEqual(2)
    expect(palette.every(isHex)).toBe(true)
    expect(palette).toEqual(expect.arrayContaining(['#ff0000', '#0000ff']))
  })
})
