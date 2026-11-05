import sharp from 'sharp'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AiOutputError } from './ai'
import { parseLayerDoc } from './layer-doc'
import {
  buildDoc,
  chromaKey,
  compositeRaw,
  imageSize,
  mergeBlocks,
  NoTextError,
  parseBlocks,
  parseSubject,
  splitSlide,
  textMask,
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
})
