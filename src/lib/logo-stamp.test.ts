import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'
import { logoBox } from './logo-options'
import { stampLogo } from './logo-stamp'

vi.mock('server-only', () => ({}))

const SLIDE = { width: 1080, height: 1350 }

const slide = (color: string) =>
  sharp({ create: { width: 1088, height: 1360, channels: 3, background: color } }).png().toBuffer().then((buffer) => new Uint8Array(buffer))

/** A dark square mark on a see-through canvas, with empty space around it. */
const cutOutLogo = (color = '#14151f') =>
  sharp({ create: { width: 200, height: 200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: { create: { width: 100, height: 100, channels: 4, background: color } }, left: 50, top: 50 }])
    .png().toBuffer().then((buffer) => new Uint8Array(buffer))

const fullLogo = () =>
  sharp({ create: { width: 120, height: 120, channels: 3, background: '#14151f' } }).jpeg().toBuffer().then((buffer) => new Uint8Array(buffer))

async function pixel(image: Uint8Array, x: number, y: number): Promise<number[]> {
  const { data } = await sharp(image).extract({ left: x, top: y, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true })
  return [...data].slice(0, 3)
}

describe('stampLogo', () => {
  it('returns the slide at the format\'s size with the logo at its place and the rest untouched', async () => {
    const stamped = await stampLogo(await slide('#f4f1ea'), '4:5', await cutOutLogo(), { position: 'bottom-right', size: 'medium' })
    expect(await sharp(stamped).metadata()).toMatchObject({ width: 1080, height: 1350 })

    // The empty space around the mark is trimmed away, so the mark fills its box.
    const box = logoBox(SLIDE, { width: 100, height: 100 }, { position: 'bottom-right', size: 'medium' })
    expect(await pixel(stamped, box.left + 50, box.top + 50)).toEqual([20, 21, 31])
    expect(await pixel(stamped, box.left - 10, box.top - 10)).toEqual([244, 241, 234])
    expect(await pixel(stamped, 40, 40)).toEqual([244, 241, 234])
  })

  it('stamps a dark cut-out logo in white on a dark area', async () => {
    const stamped = await stampLogo(await slide('#101018'), '4:5', await cutOutLogo(), { position: 'top-left', size: 'large' })
    const box = logoBox(SLIDE, { width: 100, height: 100 }, { position: 'top-left', size: 'large' })
    expect(await pixel(stamped, box.left + 20, box.top + 20)).toEqual([255, 255, 255])
  })

  it('judges the area under the logo, not the whole slide', async () => {
    const box = logoBox(SLIDE, { width: 100, height: 100 }, { position: 'bottom-right', size: 'medium' })
    // A light slide whose bottom right corner is dark.
    const light = await sharp({ create: { width: 1080, height: 1350, channels: 3, background: '#f4f1ea' } })
      .composite([{ input: { create: { width: 300, height: 300, channels: 3, background: '#101018' } }, left: 780, top: 1050 }])
      .png().toBuffer()
    const stamped = await stampLogo(new Uint8Array(light), '4:5', await cutOutLogo(), { position: 'bottom-right', size: 'medium' })
    expect(await pixel(stamped, box.left + 20, box.top + 20)).toEqual([255, 255, 255])

    // And the other way round: a dark slide with a light corner keeps the dark logo.
    const darkSlide = await sharp({ create: { width: 1080, height: 1350, channels: 3, background: '#101018' } })
      .composite([{ input: { create: { width: 300, height: 300, channels: 3, background: '#f4f1ea' } }, left: 780, top: 1050 }])
      .png().toBuffer()
    const kept = await stampLogo(new Uint8Array(darkSlide), '4:5', await cutOutLogo(), { position: 'bottom-right', size: 'medium' })
    expect(await pixel(kept, box.left + 20, box.top + 20)).toEqual([20, 21, 31])
  })

  it('leaves a logo that already shows on the dark area, and never recolours a full picture', async () => {
    const box = logoBox(SLIDE, { width: 100, height: 100 }, { position: 'top-left', size: 'large' })
    const yellow = await stampLogo(await slide('#101018'), '4:5', await cutOutLogo('#ffd400'), { position: 'top-left', size: 'large' })
    expect(await pixel(yellow, box.left + 20, box.top + 20)).toEqual([255, 212, 0])

    const picture = await stampLogo(await slide('#101018'), '4:5', await fullLogo(), { position: 'top-left', size: 'large' })
    const [red, green, blue] = await pixel(picture, box.left + 20, box.top + 20)
    expect(red + green + blue).toBeLessThan(120)
  })

  it('keeps the background of a full picture: only a cut-out mark loses the empty space around it', async () => {
    // A white dot on an orange square, as a profile picture would be.
    const profile = await sharp({ create: { width: 300, height: 300, channels: 3, background: '#e0563a' } })
      .composite([{ input: { create: { width: 100, height: 100, channels: 3, background: '#ffffff' } }, left: 100, top: 100 }])
      .png().toBuffer()
    const stamped = await stampLogo(await slide('#f4f1ea'), '4:5', new Uint8Array(profile), { position: 'top-left', size: 'large' })
    const box = logoBox(SLIDE, { width: 300, height: 300 }, { position: 'top-left', size: 'large' })
    expect(await pixel(stamped, box.left + 4, box.top + 4)).toEqual([224, 86, 58])
    expect(await pixel(stamped, box.left + Math.round(box.width / 2), box.top + Math.round(box.height / 2))).toEqual([255, 255, 255])
  })
})
