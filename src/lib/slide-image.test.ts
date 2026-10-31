import sharp from 'sharp'
import { randomFillSync } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { TARGET_STORED_BYTES } from './image'
import { SlideImageError, toReferenceDataUrl, toSlideJpeg, toWebsiteJpeg } from './slide-image'

const RED = { r: 255, g: 0, b: 0 }
const BLUE = { r: 0, g: 0, b: 255 }

/** A PNG whose left half is red and right half blue. */
async function halves(width: number, height: number): Promise<Uint8Array> {
  const half = Math.floor(width / 2)
  const red = await sharp({ create: { width: half, height, channels: 3, background: RED } }).png().toBuffer()
  const png = await sharp({ create: { width, height, channels: 3, background: BLUE } })
    .composite([{ input: red, left: 0, top: 0 }])
    .png()
    .toBuffer()
  return new Uint8Array(png)
}

async function pixel(bytes: Uint8Array, x: number, y: number) {
  const { data, info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true })
  const offset = (y * info.width + x) * info.channels
  return { r: data[offset], g: data[offset + 1], b: data[offset + 2] }
}

const isJpeg = (bytes: Uint8Array) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff

async function noise(width: number, height: number): Promise<Uint8Array> {
  const data = Buffer.allocUnsafe(width * height * 3)
  randomFillSync(data)
  return new Uint8Array(await sharp(data, { raw: { width, height, channels: 3 } }).jpeg({ quality: 100 }).toBuffer())
}

describe('toSlideJpeg', () => {
  it.each([
    ['4:5', 1088, 1360, 1080, 1350],
    ['1:1', 1024, 1024, 1080, 1080],
  ] as const)('makes a %s JPEG of the exact size from whatever size came back', async (format, width, height, outWidth, outHeight) => {
    const slide = await toSlideJpeg(await halves(width, height), format)

    expect(slide).toMatchObject({ width: outWidth, height: outHeight })
    expect(isJpeg(slide.bytes)).toBe(true)
    expect(await sharp(slide.bytes).metadata()).toMatchObject({ width: outWidth, height: outHeight, format: 'jpeg' })
  })

  it('compresses a noisy slide below the stored-file target and reports final dimensions', async () => {
    const slide = await toSlideJpeg(await noise(1080, 1350), '4:5')
    const metadata = await sharp(slide.bytes).metadata()

    expect(slide.bytes.byteLength).toBeLessThanOrEqual(TARGET_STORED_BYTES)
    expect(slide).toMatchObject({ width: metadata.width, height: metadata.height })
  })

  it('crops the centre instead of squashing a landscape image', async () => {
    const slide = await toSlideJpeg(await halves(2000, 1000), '1:1')

    const left = await pixel(slide.bytes, 10, 540)
    const right = await pixel(slide.bytes, 1070, 540)
    expect(left.r).toBeGreaterThan(200)
    expect(left.b).toBeLessThan(60)
    expect(right.b).toBeGreaterThan(200)
    expect(right.r).toBeLessThan(60)
  })

  it('puts white behind transparency', async () => {
    const transparent = await sharp({ create: { width: 100, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .png()
      .toBuffer()

    const slide = await toSlideJpeg(new Uint8Array(transparent), '1:1')

    const corner = await pixel(slide.bytes, 5, 5)
    expect(Math.min(corner.r, corner.g, corner.b)).toBeGreaterThan(245)
  })

  it('turns an image upright from its EXIF orientation', async () => {
    const sideways = await sharp(await halves(200, 100)).withMetadata({ orientation: 6 }).jpeg().toBuffer()

    const slide = await toSlideJpeg(new Uint8Array(sideways), '1:1')

    const top = await pixel(slide.bytes, 540, 10)
    const bottom = await pixel(slide.bytes, 540, 1070)
    expect(top.r).toBeGreaterThan(200)
    expect(bottom.b).toBeGreaterThan(200)
  })

  it.each([
    ['bytes that are not an image', new TextEncoder().encode('not an image')],
    ['no bytes, as base64 that decodes to nothing gives', new Uint8Array(Buffer.from('!!!!', 'base64'))],
  ])('throws a SlideImageError for %s', async (_label, bytes) => {
    await expect(toSlideJpeg(bytes, '4:5')).rejects.toBeInstanceOf(SlideImageError)
  })
})

describe('toWebsiteJpeg', () => {
  it('converts a remote image to an Instagram-safe JPEG', async () => {
    const image = await toWebsiteJpeg(await halves(2000, 1000))
    expect(image).toMatchObject({ width: 1440, height: 754 })
    expect(await sharp(image.bytes).metadata()).toMatchObject({ format: 'jpeg', width: 1440, height: 754 })
  })

  it('compresses noisy website images below the stored-file target and reports final dimensions', async () => {
    const image = await toWebsiteJpeg(await noise(2000, 1200))
    const metadata = await sharp(image.bytes).metadata()

    expect(image.bytes.byteLength).toBeLessThanOrEqual(TARGET_STORED_BYTES)
    expect(image).toMatchObject({ width: metadata.width, height: metadata.height })
  })

  it('rejects tiny images', async () => {
    await expect(toWebsiteJpeg(await halves(100, 100))).rejects.toThrow('terlalu kecil')
  })
})

describe('toReferenceDataUrl', () => {
  it('makes a JPEG data URL at most 640 px wide', async () => {
    const url = await toReferenceDataUrl(await halves(1080, 1350))

    expect(url.startsWith('data:image/jpeg;base64,')).toBe(true)
    const bytes = Buffer.from(url.slice('data:image/jpeg;base64,'.length), 'base64')
    expect(await sharp(bytes).metadata()).toMatchObject({ width: 640, height: 800, format: 'jpeg' })
  })

  it('does not enlarge a small image', async () => {
    const url = await toReferenceDataUrl(await halves(200, 250))

    const bytes = Buffer.from(url.slice('data:image/jpeg;base64,'.length), 'base64')
    expect(await sharp(bytes).metadata()).toMatchObject({ width: 200, height: 250 })
  })

  it.each([
    ['bytes that are not an image', new TextEncoder().encode('not an image')],
    ['no bytes', new Uint8Array(0)],
  ])('throws a SlideImageError for %s', async (_label, bytes) => {
    await expect(toReferenceDataUrl(bytes)).rejects.toBeInstanceOf(SlideImageError)
  })
})
