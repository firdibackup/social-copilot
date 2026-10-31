import { randomFillSync } from 'node:crypto'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { TARGET_STORED_BYTES } from './image'
import { renderStory, storyCaption, STORY_HEIGHT, STORY_WIDTH } from './story-image'

const slide = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 200, g: 120, b: 40 } } })
    .jpeg()
    .toBuffer()

describe('storyCaption', () => {
  it('names the account once, with one @', () => {
    expect(storyCaption('toko_kopi')).toBe('Post baru di @toko_kopi')
    expect(storyCaption('@toko_kopi')).toBe('Post baru di @toko_kopi')
  })
})

describe('renderStory', () => {
  it.each([
    [1080, 1080],
    [1080, 1350],
  ])(
    'makes a 1080x1920 JPEG from a %ix%i slide',
    async (width, height) => {
      const story = await renderStory(await slide(width, height), 'toko_kopi')
      const meta = await sharp(story).metadata()
      expect(meta.format).toBe('jpeg')
      expect(meta.width).toBe(STORY_WIDTH)
      expect(meta.height).toBe(STORY_HEIGHT)
    },
    // Sharp work is slow when the whole suite runs in parallel.
    30_000,
  )

  it('compresses a noisy story below the stored-file target', async () => {
    const data = Buffer.allocUnsafe(1080 * 1350 * 3)
    randomFillSync(data)
    const noisySlide = await sharp(data, { raw: { width: 1080, height: 1350, channels: 3 } }).jpeg({ quality: 100 }).toBuffer()
    const story = await renderStory(noisySlide, 'toko_kopi')

    expect(story.byteLength).toBeLessThanOrEqual(TARGET_STORED_BYTES)
    const metadata = await sharp(story).metadata()
    expect(metadata).toMatchObject({ format: 'jpeg' })
    expect(metadata.width).toBeGreaterThan(0)
    expect(metadata.height).toBeGreaterThan(0)
  })

  it('keeps markup in the username from breaking the text', async () => {
    const story = await renderStory(await slide(800, 800), 'a<b>&"c')
    expect((await sharp(story).metadata()).height).toBe(STORY_HEIGHT)
  })
})
