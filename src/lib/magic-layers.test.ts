import sharp from 'sharp'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AiOutputError } from './ai'
import { parseLayerDoc } from './layer-doc'
import {
  buildDoc,
  chromaKey,
  compositeRaw,
  DETECT_PROMPT,
  fitLayers,
  imageSize,
  mergeBlocks,
  NoTextError,
  parseBlocks,
  parseImages,
  parseShapes,
  parseSubject,
  removePrompt,
  REMOVE_TEXT_PROMPT,
  splitSlide,
  splitSubject,
  textMask,
  withAlpha,
  type ShapeBox,
  type TextBlock,
} from './magic-layers'
import { chatCompletion, generateImage } from './nine-router'

vi.mock('./nine-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./nine-router')>()),
  chatCompletion: vi.fn(),
  generateImage: vi.fn(),
}))

const block = (overrides: Partial<TextBlock> = {}): TextBlock => ({
  text: 'Halo', x: 100, y: 100, w: 400, h: 60, color: '#FFFFFF', size: 50, weight: 700, align: 'left', ...overrides,
})

const solid = (width: number, height: number, r: number, g: number, b: number) =>
  sharp({ create: { width, height, channels: 3, background: { r, g, b } } }).jpeg().toBuffer()

describe('parseBlocks', () => {
  it('converts fractions to px and clamps them into the image and the layer limits', () => {
    const [first, second] = parseBlocks({
      blocks: [
        { text: '  Judul  ', x: 0.1, y: 0.2, w: 0.5, h: 0.1, color: '#ff0000', size: 0.06, weight: 800, align: 'center' },
        { text: 'Kecil', x: -0.2, y: 0.95, w: 0.5, h: 0.2, color: 'red', size: 0.001, weight: 400, align: 'justify' },
      ],
    }, 1000, 1250)
    expect(first).toEqual({ text: 'Judul', x: 100, y: 250, w: 500, h: 125, color: '#FF0000', size: 60, weight: 700, align: 'center' })
    expect(second).toMatchObject({ x: 0, w: 300, y: 1187.5, color: '#FFFFFF', size: 12, weight: 400, align: 'left' })
    expect(second.y + second.h).toBeCloseTo(1250)
  })

  it('drops invalid blocks, caps the text and the number of blocks', () => {
    const valid = { text: 'a', x: 0, y: 0, w: 0.1, h: 0.1, size: 0.05 }
    expect(parseBlocks({ blocks: [
      { ...valid, text: '   ' },
      { ...valid, x: Number.NaN },
      { ...valid, w: 0 },
      { ...valid, x: 1.5 },
      { ...valid, size: 'besar' },
      'teks',
      { ...valid, text: 5 },
    ] }, 1000, 1000)).toEqual([])
    expect(parseBlocks({ blocks: [{ ...valid, text: '😀'.repeat(600) }] }, 1000, 1000)[0].text).toBe('😀'.repeat(500))
    expect(parseBlocks({ blocks: Array.from({ length: 40 }, () => valid) }, 1000, 1000)).toHaveLength(30)
    expect(parseBlocks({ blocks: [{ ...valid, size: 2 }] }, 1000, 1000)[0].size).toBe(400)
    expect(parseBlocks(null, 1000, 1000)).toEqual([])
  })
})

describe('parseImages', () => {
  it('reads graphics in px, defaults an unknown kind to photo, and drops invalid, tiny and background-sized ones', () => {
    expect(parseImages({ images: [
      { x: 0.5, y: 0.25, w: 0.25, h: 0.5, kind: 'icon' },
      { x: 0.1, y: 0.1, w: 0.3, h: 0.3, kind: 'sticker' },
      { x: 0, y: 0, w: 1, h: 1, kind: 'photo' },
      { x: 0.02, y: 0.02, w: 0.95, h: 0.95, kind: 'photo' },
      { x: 0.1, y: 0.1, w: 0.001, h: 0.2, kind: 'logo' },
      { x: 'a', y: 0, w: 0.1, h: 0.1 },
      'logo',
    ] }, 1000, 1000)).toEqual([
      { x: 500, y: 250, w: 250, h: 500, kind: 'icon' },
      { x: 100, y: 100, w: 300, h: 300, kind: 'photo' },
    ])
    expect(parseImages({ blocks: [] }, 1000, 1000)).toEqual([])
    expect(parseImages({ images: Array.from({ length: 20 }, () => ({ x: 0, y: 0, w: 0.1, h: 0.1 })) }, 1000, 1000)).toHaveLength(12)
  })
})

describe('parseShapes', () => {
  it('reads flat shapes with their colour, a px radius for rects only, and opacity when see-through', () => {
    expect(parseShapes({ shapes: [
      { x: 0.1, y: 0.8, w: 0.4, h: 0.1, shape: 'rect', color: '#ff5a36', radius: 0.5 },
      { x: 0.1, y: 0.1, w: 0.2, h: 0.2, shape: 'ellipse', color: '#000000', radius: 0.5, opacity: 0.4 },
      { x: 0.5, y: 0.5, w: 0.1, h: 0.1, shape: 'hexagon', color: '#00FF00', radius: 3, opacity: 1 },
    ] }, 1000, 1000)).toEqual([
      { x: 100, y: 800, w: 400, h: 100, shape: 'rect', color: '#FF5A36', radius: 50 },
      { x: 100, y: 100, w: 200, h: 200, shape: 'ellipse', color: '#000000', radius: 0, opacity: 0.4 },
      { x: 500, y: 500, w: 100, h: 100, shape: 'rect', color: '#00FF00', radius: 50 },
    ])
  })

  it('drops colourless, invisible, invalid and background-sized shapes', () => {
    expect(parseShapes({ shapes: [
      { x: 0, y: 0, w: 1, h: 1, shape: 'rect', color: '#FFFFFF' },
      { x: 0.1, y: 0.1, w: 0.2, h: 0.2, shape: 'rect', color: 'red' },
      { x: 0.1, y: 0.1, w: 0.2, h: 0.2, shape: 'rect' },
      { x: 0.1, y: 0.1, w: 0.2, h: 0.2, shape: 'rect', color: '#FFFFFF', opacity: 0 },
      { x: 0.1, y: 0.1, w: 0, h: 0.2, shape: 'rect', color: '#FFFFFF' },
    ] }, 1000, 1000)).toEqual([])
    expect(parseShapes(null, 1000, 1000)).toEqual([])
  })
})

describe('fitLayers', () => {
  it('keeps text first, then graphics, then shapes within the budget', () => {
    const fit = fitLayers({ blocks: [1, 2], images: [1, 2, 3], shapes: [1, 2] }, 4)
    expect(fit).toEqual({ blocks: [1, 2], images: [1, 2], shapes: [] })
    expect(fitLayers({ blocks: [1], images: [1], shapes: [1] }, 0)).toEqual({ blocks: [], images: [], shapes: [] })
  })
})

describe('prompts', () => {
  it('asks for text, graphics and shapes in one answer, and names every element to remove', () => {
    expect(DETECT_PROMPT).toContain('"images":[')
    expect(DETECT_PROMPT).toContain('"shapes":[')
    expect(DETECT_PROMPT).toMatch(/background/i)
    expect(removePrompt([], [], 1000, 1000)).toBe(REMOVE_TEXT_PROMPT)
    const prompt = removePrompt([{ x: 500, y: 0, w: 250, h: 500, kind: 'logo' }],
      [{ x: 0, y: 800, w: 400, h: 100, shape: 'rect', color: '#000000', radius: 50 }], 1000, 1000)
    expect(prompt).toContain('the logo at left 50–75%, top 0–50%')
    expect(prompt).toContain('the rounded box at left 0–40%, top 80–90%')
  })
})

describe('mergeBlocks', () => {
  it('joins the lines of one paragraph into one block', () => {
    const merged = mergeBlocks([
      block({ text: 'baris dua', y: 170, x: 120, w: 300 }),
      block({ text: 'baris satu', y: 100 }),
    ])
    expect(merged).toEqual([block({ text: 'baris satu\nbaris dua', x: 100, y: 100, w: 400, h: 130 })])
  })

  it('keeps apart lines that differ or are far apart', () => {
    const lines = [
      block(),
      block({ y: 170, color: '#000000' }),
      block({ y: 340 }),
      block({ y: 410, size: 30 }),
      block({ y: 480, x: 600, w: 200 }),
      block({ y: 550, align: 'center' }),
    ]
    expect(mergeBlocks(lines)).toHaveLength(6)
  })

  it('does not merge overlapping columns, different weights, or truncate a long paragraph', () => {
    expect(mergeBlocks([block(), block({ x: 300, y: 100, text: 'Autre colonne' })])).toHaveLength(2)
    expect(mergeBlocks([block(), block({ y: 170, weight: 400 })])).toHaveLength(2)
    const long = mergeBlocks([block({ text: 'x'.repeat(300) }), block({ y: 170, text: 'y'.repeat(300) })])
    expect(long).toHaveLength(2)
    expect(long.map((item) => item.text).join('').length).toBe(600)
  })
})

describe('textMask', () => {
  it('is 255 inside the padded boxes, feathered, and exactly 0 farther away', () => {
    const width = 200
    const height = 100
    const mask = textMask(width, height, [{ x: 50, y: 40, w: 20, h: 10 }], 0.02, 8)
    const at = (x: number, y: number) => mask[y * width + x]
    expect(mask).toHaveLength(width * height)
    expect(at(60, 45)).toBe(255)
    expect(at(47, 45)).toBe(255) // inside the 4 px pad
    expect(at(41, 45)).toBeGreaterThan(0)
    expect(at(41, 45)).toBeLessThan(255)
    // pad 4 + feather 8 = 12 px around the box
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (x < 38 || x > 82 || y < 28 || y > 62) expect(at(x, y)).toBe(0)
      }
    }
  })
})

describe('compositeRaw', () => {
  it('copies the original exactly where the mask is 0 and the edit where it is 255', () => {
    const width = 64
    const height = 48
    const original = Uint8Array.from({ length: width * height * 3 }, (_, index) => (index * 7) % 256)
    const edited = new Uint8Array(width * height * 3).fill(13)
    const mask = textMask(width, height, [{ x: 20, y: 10, w: 10, h: 10 }], 0.02, 6)
    const out = compositeRaw(original, edited, mask)
    for (let pixel = 0; pixel < width * height; pixel++) {
      for (let channel = 0; channel < 3; channel++) {
        const index = pixel * 3 + channel
        if (mask[pixel] === 0) expect(out[index]).toBe(original[index])
        if (mask[pixel] === 255) expect(out[index]).toBe(13)
      }
    }
    expect(mask.some((value) => value > 0 && value < 255)).toBe(true)
  })
})

describe('chromaKey', () => {
  it('keys pure green out, keeps other colours, and removes green spill on edges', () => {
    const raw = Uint8Array.from([0, 255, 0, 255, 0, 0, 60, 200, 60, 255, 0, 0])
    const out = chromaKey(raw, 4, 1)
    expect(out[3]).toBe(0)
    expect([...out.slice(4, 8)]).toEqual([255, 0, 0, 255])
    expect(out[11]).toBeGreaterThan(0)
    expect(out[9]).toBe(60) // green cut to max(red, blue)
    expect([...out.slice(12, 16)]).toEqual([255, 0, 0, 255])
  })

  it('keeps the alpha of RGBA input', () => {
    expect([...chromaKey(Uint8Array.from([10, 20, 30, 128]), 1, 1)]).toEqual([10, 20, 30, 128])
  })
})

describe('parseSubject and imageSize', () => {
  it('reads the subject box, or null', () => {
    expect(parseSubject({ subject: { x: 0.25, y: 0.5, w: 0.5, h: 0.5 } }, 1000, 1000)).toEqual({ x: 250, y: 500, w: 500, h: 500 })
    expect(parseSubject({ subject: null }, 1000, 1000)).toBeNull()
    expect(parseSubject({ subject: { x: 0, y: 0, w: 0.01, h: 0.01 } }, 1000, 1000)).toBeNull()
  })

  it('asks 9Router for the size of the slide shape', () => {
    expect(imageSize(1080, 1350)).toBe('1088x1360')
    expect(imageSize(1080, 1080)).toBe('1024x1024')
  })
})

describe('splitSlide', () => {
  const width = 120
  const height = 150

  beforeEach(() => {
    vi.mocked(chatCompletion).mockReset()
    vi.mocked(generateImage).mockReset()
  })

  it('throws NoTextError without generating an image when there is no text', async () => {
    vi.mocked(chatCompletion).mockResolvedValue('{"blocks":[]}')
    const bytes = await solid(width, height, 200, 50, 50)
    await expect(splitSlide({ bytes, width, height, splitObject: true })).rejects.toBeInstanceOf(NoTextError)
    expect(generateImage).not.toHaveBeenCalled()
  })

  it('throws NoTextError when graphics and shapes are all background-sized', async () => {
    vi.mocked(chatCompletion).mockResolvedValue(
      '{"blocks":[],"images":[{"x":0,"y":0,"w":1,"h":1,"kind":"photo"}],"shapes":[{"x":0,"y":0,"w":1,"h":0.9,"shape":"rect","color":"#FFFFFF"}]}',
    )
    const bytes = await solid(width, height, 200, 50, 50)
    await expect(splitSlide({ bytes, width, height, splitObject: false })).rejects.toBeInstanceOf(NoTextError)
    expect(generateImage).not.toHaveBeenCalled()
  })

  it('crops graphics from the original, keeps shapes, and repaints only inside their boxes', async () => {
    vi.mocked(chatCompletion).mockResolvedValue(JSON.stringify({
      images: [{ x: 0.5, y: 0.5, w: 0.3, h: 0.3, kind: 'icon' }],
      shapes: [{ x: 0.1, y: 0.1, w: 0.2, h: 0.1, shape: 'rect', color: '#00ff00', radius: 0.5 }],
    }))
    vi.mocked(generateImage).mockResolvedValue((await solid(1088, 1360, 10, 200, 30)).toString('base64'))
    // Red slide with a blue square where the icon sits.
    const bytes = await sharp({ create: { width, height, channels: 3, background: { r: 200, g: 50, b: 50 } } })
      .composite([{ input: await solid(36, 45, 20, 40, 220), left: 60, top: 75 }]).jpeg({ quality: 100 }).toBuffer()
    const result = await splitSlide({ bytes, width, height, splitObject: false })

    expect(result.blocks).toEqual([])
    expect(result.shapes).toEqual([{ x: 12, y: 15, w: 24, h: 15, shape: 'rect', color: '#00FF00', radius: 7.5 }])
    expect(result.images).toHaveLength(1)
    const [icon] = result.images
    expect(icon).toMatchObject({ kind: 'icon', x: 58, y: 73, w: 40, h: 49 })
    const crop = await sharp(icon.bytes).raw().toBuffer({ resolveWithObject: true })
    expect([crop.info.width, crop.info.height]).toEqual([40, 49])
    const centre = (20 + 24 * 40) * crop.info.channels
    expect(crop.data[centre + 2]).toBeGreaterThan(180) // the original's blue, not the edit's green
    expect((await sharp(icon.bytes).metadata()).format).toBe('png')

    const background = await sharp(result.background).raw().toBuffer()
    const pixel = (x: number, y: number) => [...background.subarray((y * width + x) * 3, (y * width + x) * 3 + 3)]
    const near = (actual: number[], expected: number[]) => actual.every((value, index) => Math.abs(value - expected[index]) <= 12)
    expect(near(pixel(5, 145), [200, 50, 50])).toBe(true) // far from every box: the original
    expect(near(pixel(115, 5), [200, 50, 50])).toBe(true)
    expect(near(pixel(78, 97), [10, 200, 30])).toBe(true) // inside the icon's box: the edit
    expect(near(pixel(24, 22), [10, 200, 30])).toBe(true) // inside the shape's box: the edit

    const prompt = vi.mocked(generateImage).mock.calls[0][0].prompt
    expect(prompt).toContain('the icon at')
    expect(prompt).toContain('the rounded box at')
    expect(generateImage).toHaveBeenCalledTimes(1)
    expect(result.log).toMatchObject({ blocks: 0, images: 1, shapes: 1, removeTextPrompt: prompt })
  })

  it('throws AiOutputError when the answer is not JSON', async () => {
    vi.mocked(chatCompletion).mockResolvedValue('Maaf, saya tidak bisa.')
    const bytes = await solid(width, height, 200, 50, 50)
    await expect(splitSlide({ bytes, width, height, splitObject: false })).rejects.toBeInstanceOf(AiOutputError)
  })

  it('returns a JPEG background of exactly the slide size and the merged blocks', async () => {
    vi.mocked(chatCompletion).mockResolvedValue(
      '```json\n{"blocks":[{"text":"Promo","x":0.1,"y":0.1,"w":0.5,"h":0.1,"color":"#000000","size":0.1,"weight":700,"align":"left"}]}\n```',
    )
    vi.mocked(generateImage).mockResolvedValue((await solid(1088, 1360, 10, 200, 30)).toString('base64'))
    const bytes = await solid(width, height, 200, 50, 50)
    const result = await splitSlide({ bytes, width, height, splitObject: false })
    const metadata = await sharp(result.background).metadata()
    expect([metadata.format, metadata.width, metadata.height]).toEqual(['jpeg', width, height])
    expect(result.blocks).toHaveLength(1)
    expect(result.object).toBeNull()
    expect(vi.mocked(generateImage).mock.calls[0][0]).toMatchObject({ size: '1088x1360' })
    expect(vi.mocked(chatCompletion).mock.calls[0][1]).toBe('cc/claude-opus-5-5')
    expect(JSON.stringify(result.log)).not.toContain('base64')
  })

  it('cuts the subject out as a PNG and removes it from the background', async () => {
    vi.mocked(chatCompletion)
      .mockResolvedValueOnce('{"blocks":[{"text":"Promo","x":0.1,"y":0.05,"w":0.5,"h":0.1,"size":0.1}]}')
      .mockResolvedValueOnce('{"subject":{"x":0.3,"y":0.4,"w":0.4,"h":0.4}}')
    const green = (await solid(1088, 1360, 0, 255, 0)).toString('base64')
    vi.mocked(generateImage).mockResolvedValue(green)
    const bytes = await solid(width, height, 200, 50, 50)
    const result = await splitSlide({ bytes, width, height, splitObject: true })
    expect(generateImage).toHaveBeenCalledTimes(3)
    expect(result.object).not.toBeNull()
    const metadata = await sharp(result.object!.png).metadata()
    expect([metadata.format, metadata.width, metadata.height, metadata.hasAlpha]).toEqual(['png', result.object!.w, result.object!.h, true])
    expect(result.log.objectFound).toBe(true)
  })

  it('asks the stronger reader for the subject', async () => {
    vi.mocked(chatCompletion)
      .mockResolvedValueOnce('{"blocks":[{"text":"Promo","x":0.1,"y":0.05,"w":0.5,"h":0.1,"size":0.1}]}')
      .mockResolvedValueOnce('{"subject":null}')
    vi.mocked(generateImage).mockResolvedValue((await solid(1088, 1360, 0, 0, 0)).toString('base64'))
    await splitSlide({ bytes: await solid(width, height, 200, 50, 50), width, height, splitObject: true })
    expect(vi.mocked(chatCompletion).mock.calls[1][1]).toBe('cc/claude-opus-5-5')
  })

  it('leaves the object out when no subject is found', async () => {
    vi.mocked(chatCompletion)
      .mockResolvedValueOnce('{"blocks":[{"text":"Promo","x":0.1,"y":0.05,"w":0.5,"h":0.1,"size":0.1}]}')
      .mockResolvedValueOnce('{"subject":null}')
    vi.mocked(generateImage).mockResolvedValue((await solid(1024, 1024, 0, 0, 0)).toString('base64'))
    const result = await splitSlide({ bytes: await solid(width, height, 200, 50, 50), width, height, splitObject: true })
    expect(result.object).toBeNull()
    expect(generateImage).toHaveBeenCalledTimes(1)
  })
})

describe('splitSubject', () => {
  const width = 120
  const height = 150
  const SUBJECT = '{"subject":{"x":0.3,"y":0.4,"w":0.4,"h":0.4}}'
  const near = (actual: number[], expected: number[]) => actual.every((value, index) => Math.abs(value - expected[index]) <= 12)
  /** Green with a blue square in the middle third: what the green-screen edit answers. */
  const greenScreen = async (w: number, h: number) => (await sharp({ create: { width: w, height: h, channels: 3, background: { r: 0, g: 255, b: 0 } } })
    .composite([{ input: await solid(Math.round(w / 3), Math.round(h / 3), 20, 40, 220), left: Math.round(w / 3), top: Math.round(h / 3) }])
    .png().toBuffer()).toString('base64')

  beforeEach(() => {
    vi.mocked(chatCompletion).mockReset()
    vi.mocked(generateImage).mockReset()
  })

  it('finds no subject without generating an image, and leaves the source as it is', async () => {
    vi.mocked(chatCompletion).mockResolvedValue('{"subject":null}')
    const bytes = await solid(width, height, 200, 50, 50)
    const result = await splitSubject({ bytes, width, height })
    expect(result.object).toBeNull()
    expect(result.cleaned).toBe(bytes)
    expect(generateImage).not.toHaveBeenCalled()
    expect(vi.mocked(chatCompletion).mock.calls[0][1]).toBe('cc/claude-opus-5-5')
    expect(result.log).toMatchObject({ objectFound: false })
  })

  it('cuts the subject out at its box in source px and repaints only inside the subject mask', async () => {
    vi.mocked(chatCompletion).mockResolvedValue(SUBJECT)
    vi.mocked(generateImage)
      .mockResolvedValueOnce(await greenScreen(1088, 1360))
      .mockResolvedValueOnce((await solid(1088, 1360, 0, 0, 0)).toString('base64'))
    const result = await splitSubject({ bytes: await solid(width, height, 200, 50, 50), width, height })

    expect(vi.mocked(generateImage).mock.calls.map((call) => call[0].size)).toEqual(['1088x1360', '1088x1360'])
    // The subject box (36, 60, 48 × 60) grown by 5% of the longer side.
    expect(result.object?.box).toEqual({ x: 28, y: 52, w: 64, h: 76 })
    const object = await sharp(result.object!.png).raw().toBuffer({ resolveWithObject: true })
    expect([object.info.width, object.info.height, object.info.channels]).toEqual([64, 76, 4])
    const alphaAt = (x: number, y: number) => object.data[(y * 64 + x) * 4 + 3]
    expect(alphaAt(1, 1)).toBe(0) // green: keyed out
    expect(alphaAt(32, 23)).toBe(255) // the blue square at the image's centre (60, 75)

    const meta = await sharp(result.cleaned).metadata()
    expect([meta.format, meta.width, meta.height]).toEqual(['jpeg', width, height])
    const cleaned = await sharp(result.cleaned).raw().toBuffer()
    const pixel = (x: number, y: number) => [...cleaned.subarray((y * width + x) * 3, (y * width + x) * 3 + 3)]
    expect(near(pixel(60, 90), [0, 0, 0])).toBe(true) // inside the subject: the removal edit
    expect(near(pixel(3, 3), [200, 50, 50])).toBe(true) // far from it: the source
    expect(near(pixel(115, 145), [200, 50, 50])).toBe(true)
    expect(result.log).toMatchObject({ objectFound: true, transparent: false })
    expect(JSON.stringify(result.log)).not.toContain('base64')
  })

  it("keeps a transparent layer image's alpha, and pads an odd shape instead of stretching it", async () => {
    // 200 × 100: its left half transparent, the right half opaque red.
    const [w, h] = [200, 100]
    const bytes = await sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: await sharp({ create: { width: 100, height: 100, channels: 4, background: { r: 200, g: 50, b: 50, alpha: 1 } } }).png().toBuffer(), left: 100, top: 0 }])
      .png().toBuffer()
    vi.mocked(chatCompletion).mockResolvedValue('{"subject":{"x":0.25,"y":0.2,"w":0.5,"h":0.6}}')
    // 1:1 edits of the 200 × 200 frame: the image is its middle band (rows 256–768 of 1024), black; the padding white.
    const framed = async () => (await sharp({ create: { width: 1024, height: 1024, channels: 3, background: '#ffffff' } })
      .composite([{ input: await solid(1024, 512, 0, 0, 0), left: 0, top: 256 }]).png().toBuffer()).toString('base64')
    vi.mocked(generateImage).mockResolvedValueOnce(await greenScreen(1024, 1024)).mockResolvedValueOnce(await framed())
    const result = await splitSubject({ bytes: new Uint8Array(bytes), width: w, height: h })

    expect(vi.mocked(generateImage).mock.calls[0][0].size).toBe('1024x1024')
    const meta = await sharp(result.cleaned).metadata()
    expect([meta.format, meta.width, meta.height, meta.hasAlpha]).toEqual(['png', w, h, true])
    const cleaned = await sharp(result.cleaned).ensureAlpha().raw().toBuffer()
    const rgba = (x: number, y: number) => [...cleaned.subarray((y * w + x) * 4, (y * w + x) * 4 + 4)]
    expect(rgba(40, 50)[3]).toBe(0) // the source's transparent half stays transparent
    expect(rgba(90, 50)[3]).toBe(0)
    expect(near(rgba(120, 50), [0, 0, 0, 255])).toBe(true) // inside the subject: the edit's band, not its white padding
    expect(near(rgba(195, 95), [200, 50, 50, 255])).toBe(true) // outside: the source
    // The cut-out is never visible where the source was transparent.
    const object = await sharp(result.object!.png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const { box } = result.object!
    const objectAlpha = (x: number, y: number) => object.data[((y - box.y) * object.info.width + (x - box.x)) * 4 + 3]
    expect(objectAlpha(95, 50)).toBe(0)
    expect(result.log).toMatchObject({ transparent: true })
  })
})

describe('withAlpha', () => {
  it('joins raw RGB and an alpha channel into RGBA', () => {
    expect([...withAlpha(new Uint8Array([1, 2, 3, 4, 5, 6]), new Uint8Array([0, 255]))]).toEqual([1, 2, 3, 0, 4, 5, 6, 255])
  })
})

describe('buildDoc', () => {
  it('makes a valid doc: the object behind, the largest text in the heading font', () => {
    const blocks = [block({ text: 'kecil', size: 20.4, h: 50.6 }), block({ text: 'besar\nsekali', size: 80, h: 200, y: 400.4 })]
    const doc = buildDoc(1080, 1350, blocks, { heading: 'Plus Jakarta Sans', body: 'Inter' }, {
      assetId: '0b6f3a52-2c1e-4e8a-9d7b-6a1f0e2c3d4b', x: 300.2, y: 500, w: 400, h: 600.7,
    })
    expect(parseLayerDoc(doc)).toEqual({ doc })
    expect(doc.layers.map((layer) => layer.id)).toEqual(['o1', 't1', 't2'])
    expect(doc.layers[0]).toMatchObject({ kind: 'image', role: 'object', x: 300, h: 601 })
    expect(doc.layers[1]).toMatchObject({ font: 'Inter', size: 20, lineHeight: 2, h: 51 })
    expect(doc.layers[2]).toMatchObject({ font: 'Plus Jakarta Sans', lineHeight: 1.25, y: 400 })
  })

  const ICON = '1b6f3a52-2c1e-4e8a-9d7b-6a1f0e2c3d4b'
  const PHOTO = '2b6f3a52-2c1e-4e8a-9d7b-6a1f0e2c3d4b'
  const OBJECT = '0b6f3a52-2c1e-4e8a-9d7b-6a1f0e2c3d4b'
  const pill: ShapeBox = { x: 80.4, y: 1000, w: 400, h: 100.2, shape: 'rect', color: '#FF5A36', radius: 50.1, opacity: 0.8 }
  const labels = { photo: 'Foto', icon: 'Ikon', logo: 'Logo', illustration: 'Ilustrasi' }

  it('orders the object, shapes, graphics, then text on top, as a valid doc', () => {
    const doc = buildDoc(1080, 1350, [block()], { heading: 'Plus Jakarta Sans', body: 'Inter' },
      { assetId: OBJECT, x: 0, y: 0, w: 500, h: 500 },
      {
        images: [{ assetId: ICON, kind: 'icon', x: 10, y: 20, w: 30, h: 40 }, { assetId: PHOTO, kind: 'photo', x: 600, y: 600, w: 300, h: 300 }],
        shapes: [pill, { x: 0, y: 0, w: 50, h: 50, shape: 'ellipse', color: '#000000', radius: 0 }],
        labels,
      })
    expect(parseLayerDoc(doc)).toEqual({ doc })
    expect(doc.layers.map((layer) => layer.id)).toEqual(['o1', 's1', 's2', 'i1', 'i2', 't1'])
    expect(doc.layers[1]).toEqual({ id: 's1', kind: 'shape', shape: 'rect', color: '#FF5A36', radius: 50, strokeColor: '#FF5A36',
      strokeWidth: 0, opacity: 0.8, x: 80, y: 1000, w: 400, h: 100 })
    expect(doc.layers[3]).toEqual({ id: 'i1', kind: 'image', role: 'object', assetId: ICON, name: 'Ikon 1', x: 10, y: 20, w: 30, h: 40 })
    expect(doc.layers[4]).toMatchObject({ name: 'Foto 1', assetId: PHOTO })
  })

  it('keeps text first when the layer limit cuts', () => {
    const shapes = Array.from({ length: 10 }, () => pill)
    const images = Array.from({ length: 10 }, () => ({ assetId: ICON, kind: 'logo' as const, x: 0, y: 0, w: 10, h: 10 }))
    const doc = buildDoc(1080, 1350, Array.from({ length: 15 }, () => block()), { heading: 'Inter', body: 'Inter' }, null, { images, shapes })
    expect(doc.layers).toHaveLength(30)
    expect(doc.layers.filter((layer) => layer.kind === 'text')).toHaveLength(15)
    expect(doc.layers.filter((layer) => layer.kind === 'image')).toHaveLength(10)
    expect(doc.layers.filter((layer) => layer.kind === 'shape')).toHaveLength(5)
    expect(doc.layers.at(-1)?.kind).toBe('text')
    expect(parseLayerDoc(doc)).toEqual({ doc })
  })
})
