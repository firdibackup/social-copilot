import sharp from 'sharp'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { drawElement, elementPrompt, NoElementError, visibleBounds } from './element-ai'
import { cleanElementPrompt, ELEMENT_PROMPT_MAX } from './element-options'
import { generateImage } from './nine-router'

vi.mock('server-only', () => ({}))
vi.mock('./nine-router', () => ({ generateImage: vi.fn(), chatCompletion: vi.fn() }))

/** A size×size JPEG of `background` with an optional red square at (left, top), as generateImage returns it. */
async function picture(size: number, background: string, square?: { left: number; top: number; side: number }): Promise<string> {
  const base = sharp({ create: { width: size, height: size, channels: 3, background } })
  const image = square
    ? base.composite([{ input: await sharp({ create: { width: square.side, height: square.side, channels: 3, background: '#E11D48' } }).png().toBuffer(), left: square.left, top: square.top }])
    : base
  return (await image.jpeg({ quality: 95 }).toBuffer()).toString('base64')
}

beforeEach(() => vi.mocked(generateImage).mockReset())

describe('cleanElementPrompt', () => {
  it('keeps a one-line description and refuses one too short, too long or not text', () => {
    expect(cleanElementPrompt('  stiker   kopi\n3D ')).toBe('stiker kopi 3D')
    expect(cleanElementPrompt('ab')).toBeNull()
    expect(cleanElementPrompt('x'.repeat(ELEMENT_PROMPT_MAX + 1))).toBeNull()
    expect(cleanElementPrompt(42)).toBeNull()
  })
})

describe('elementPrompt', () => {
  it('asks for one object on a flat green screen, quoting the owner’s words', () => {
    const prompt = elementPrompt('stiker kopi 3D')
    expect(prompt).toContain('"stiker kopi 3D"')
    expect(prompt).toContain('#00FF00')
    expect(prompt).toContain('no text')
  })
})

describe('visibleBounds', () => {
  it('boxes the visible pixels with padding, inside the image', () => {
    const rgba = new Uint8Array(20 * 20 * 4)
    for (let y = 5; y < 10; y++) for (let x = 8; x < 14; x++) rgba[(y * 20 + x) * 4 + 3] = 255

    expect(visibleBounds(rgba, 20, 20, 2)).toEqual({ x: 6, y: 3, w: 10, h: 9 })
    expect(visibleBounds(rgba, 20, 20, 50)).toEqual({ x: 0, y: 0, w: 20, h: 20 })
  })

  it('finds nothing in an image that is almost entirely transparent', () => {
    const rgba = new Uint8Array(100 * 100 * 4)
    rgba[3] = 255
    expect(visibleBounds(rgba, 100, 100)).toBeNull()
  })
})

describe('drawElement', () => {
  it('keys out the green screen and trims the PNG to the object', async () => {
    vi.mocked(generateImage).mockResolvedValue(await picture(256, '#00FF00', { left: 96, top: 64, side: 80 }))

    const element = await drawElement('kotak merah')

    expect(vi.mocked(generateImage).mock.calls[0][0]).toMatchObject({ size: '1024x1024', images: [] })
    // The 80 px square plus the trim padding, not the 256 px frame.
    expect(element.width).toBeGreaterThanOrEqual(80)
    expect(element.width).toBeLessThanOrEqual(104)
    expect(element.height).toBeLessThanOrEqual(104)
    const { data, info } = await sharp(Buffer.from(element.png)).raw().toBuffer({ resolveWithObject: true })
    expect(info.channels).toBe(4)
    // A corner is transparent, the centre is the opaque red object.
    expect(data[3]).toBe(0)
    const centre = (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * 4
    expect(data[centre + 3]).toBe(255)
    expect(data[centre]).toBeGreaterThan(180)
    expect(element.log).toMatchObject({ width: element.width, height: element.height, bytes: element.png.length })
    expect(element.log.prompt).toContain('kotak merah')
  })

  it('refuses a picture without a green screen, and one with nothing on it', async () => {
    vi.mocked(generateImage).mockResolvedValue(await picture(128, '#3344AA'))
    await expect(drawElement('langit')).rejects.toBeInstanceOf(NoElementError)

    vi.mocked(generateImage).mockResolvedValue(await picture(128, '#00FF00'))
    await expect(drawElement('kosong')).rejects.toBeInstanceOf(NoElementError)
  })
})
