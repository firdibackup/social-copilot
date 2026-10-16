import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getBrandVisual, loadLogoImage, loadReferenceImage, type BrandVisual } from './brand'
import { AiOutputError } from './ai'
import {
  buildImagePrompt,
  buildPlanMessages,
  createImage,
  imageErrorMessage,
  parseContent,
  parseImageInput,
  parsePlan,
} from './image-ai'
import type { ImageInput } from './image-options'
import { generateImage, RouterApiError } from './nine-router'

const database = vi.hoisted(() => ({ inserted: [] as unknown[] }))

vi.mock('./supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./supabase')>()),
  db: () => ({
    from: () => ({
      insert: async (row: unknown) => {
        database.inserted.push(row)
        return { data: null, error: null }
      },
    }),
  }),
}))

vi.mock('./brand', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./brand')>()),
  getBrandContext: vi.fn(async () => null),
  getBrandVisual: vi.fn(),
  loadReferenceImage: vi.fn(),
  loadLogoImage: vi.fn(),
}))

vi.mock('./billing', () => ({
  creditsUsed: async () => 0,
  getCurrentPeriod: async () => ({ start: new Date('2026-10-01'), end: new Date('2026-10-31'), activeUntil: new Date('2026-10-31') }),
}))
vi.mock('./nine-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./nine-router')>()),
  generateImage: vi.fn(),
}))

const REFERENCE_ID = '00000000-0000-4000-8000-000000000001'
const JPEG_B64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]).toString('base64')

const BRAND: BrandVisual = {
  name: 'Salah dulu English',
  category: 'Belajar bahasa Inggris',
  visualStyle: 'Foto realistis, cahaya hangat, headline sans-serif putih tebal.',
  colors: [
    { hex: '#181818', role: 'utama' },
    { hex: '#e8b04b', role: 'aksen' },
  ],
  headingFont: 'Inter',
  bodyFont: '',
}

const INPUT: ImageInput = {
  scene: 'Pria muda di kafe dengan laptop',
  headline: 'Aku cuma bisa bilang “thank you”',
  format: '4:5',
  referenceId: null,
  includeLogo: false,
  previousImage: null,
  slide: null,
}

describe('parseImageInput', () => {
  it('trims the text and fills the defaults', () => {
    expect(parseImageInput({ scene: '  Kafe  ', headline: ' ', format: '1:1' })).toEqual({
      input: { ...INPUT, scene: 'Kafe', headline: '', format: '1:1' },
    })
  })

  it.each([
    ['a non-object', 'kucing'],
    ['an empty scene', { scene: ' ', format: '4:5' }],
    ['an unknown format', { scene: 'Kafe', format: '9:16' }],
    ['a format inherited from Object.prototype', { scene: 'Kafe', format: 'toString' }],
    ['a headline over 150 characters', { scene: 'Kafe', format: '4:5', headline: 'a'.repeat(151) }],
    ['a malformed reference id', { scene: 'Kafe', format: '4:5', referenceId: 'ref-1' }],
    ['a slide past the count', { scene: 'Kafe', format: '4:5', slide: { index: 3, count: 2 } }],
    ['eleven slides', { scene: 'Kafe', format: '4:5', slide: { index: 1, count: 11 } }],
    ['a previous image that is not a data URL', { scene: 'Kafe', format: '4:5', previousImage: 'https://evil.example/x.jpg' }],
  ])('rejects %s', (_label, input) => {
    expect(parseImageInput(input)).toHaveProperty('error')
  })

  it('accepts slide 1 as a data URL', () => {
    const parsed = parseImageInput({ ...INPUT, previousImage: `data:image/jpeg;base64,${JPEG_B64}`, slide: { index: 2, count: 3 } })

    expect(parsed).toMatchObject({ input: { previousImage: `data:image/jpeg;base64,${JPEG_B64}`, slide: { index: 2, count: 3 } } })
  })
})

describe('buildImagePrompt', () => {
  it('quotes the headline and carries the brand style, colours by role and fonts', () => {
    const prompt = buildImagePrompt(INPUT, BRAND, [])

    expect(prompt).toContain('4:5 portrait')
    expect(prompt).toContain('Scene: Pria muda di kafe dengan laptop')
    expect(prompt).toContain('render exactly this text and no other words: "Aku cuma bisa bilang “thank you”"')
    expect(prompt).not.toContain('line breaks')
    expect(prompt).toContain('in Inter or a close match')
    expect(prompt).toContain('Brand colours: primary #181818, accent #e8b04b.')
    expect(prompt).toContain('Brand fonts: headings Inter.')
    expect(prompt).toContain('Visual style: Foto realistis')
  })

  it('keeps the line breaks of a multi-line text', () => {
    const prompt = buildImagePrompt({ ...INPUT, headline: 'Make vs Do\nI make coffee.\nI do my homework.' }, null, [])

    expect(prompt).toContain('"Make vs Do\nI make coffee.\nI do my homework."')
    expect(prompt).toContain('Keep its line breaks; the first line is the headline.')
  })

  it('forbids any text without a headline, except a logo that was sent', () => {
    expect(buildImagePrompt({ ...INPUT, headline: '' }, null, [])).toContain(
      'Text: none. No words, letters, numbers, captions or watermarks, and no logos.',
    )
    expect(buildImagePrompt({ ...INPUT, headline: '' }, null, [{ kind: 'logo' }])).toContain('watermarks other than the logo.')
  })

  it('names the input images in the order they are sent', () => {
    const prompt = buildImagePrompt({ ...INPUT, slide: { index: 2, count: 5 } }, null, [
      { kind: 'previous' },
      { kind: 'reference', note: 'ambil layout-nya saja' },
      { kind: 'logo' },
    ])

    expect(prompt).toContain('slide 2 of 5 of one carousel')
    expect(prompt).toContain('image1 is slide 1 of this carousel')
    expect(prompt).toContain('image2 is a design reference')
    expect(prompt).toContain('"ambil layout-nya saja"')
    expect(prompt).toContain('image3 is the brand logo')
  })
})

describe('parsePlan', () => {
  it('keeps slides with a scene, trimmed, at most ten', () => {
    const slides = Array.from({ length: 12 }, (_, index) => ({ headline: ` Slide ${index + 1} `, scene: `Adegan ${index + 1}` }))
    const plan = parsePlan(JSON.stringify({ slides: [{ headline: 'Tanpa adegan', scene: ' ' }, ...slides] }))

    expect(plan).toHaveLength(10)
    expect(plan[0]).toEqual({ headline: 'Slide 1', scene: 'Adegan 1' })
  })

  it('treats an answer without slides as unreadable', () => {
    expect(() => parsePlan('{"slides": []}')).toThrow(AiOutputError)
    expect(() => parsePlan('Maaf.')).toThrow(AiOutputError)
  })

  it('quotes the content after the task', () => {
    const [system, user] = buildPlanMessages('5 kesalahan grammar', null)

    expect(system.content).toContain('carousel 2–10 slide')
    expect(user.content).toContain('"""\n5 kesalahan grammar\n"""')
  })
})

describe('parseContent', () => {
  it('requires some content within 2,200 characters', () => {
    expect(parseContent('  Promo  ')).toBe('Promo')
    expect(parseContent(' ')).toHaveProperty('error')
    expect(parseContent('a'.repeat(2201))).toHaveProperty('error')
  })
})

describe('createImage', () => {
  beforeEach(() => {
    vi.stubEnv('ROUTER_MODEL', 'chat-model')
    database.inserted = []
    vi.mocked(getBrandVisual).mockResolvedValue(BRAND)
    vi.mocked(loadReferenceImage).mockResolvedValue({ dataUrl: `data:image/jpeg;base64,${'R'.repeat(400_000)}`, note: 'layout' })
    vi.mocked(loadLogoImage).mockResolvedValue(`data:image/png;base64,${'L'.repeat(600_000)}`)
    vi.mocked(generateImage).mockResolvedValue(JPEG_B64)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('sends slide 1 and the reference, skips a logo that no longer fits 1 MB, and logs no image data', async () => {
    const previousImage = `data:image/jpeg;base64,${'P'.repeat(300_000)}`

    const result = await createImage('user-1', { ...INPUT, previousImage, referenceId: REFERENCE_ID, includeLogo: true, slide: { index: 2, count: 3 } })

    expect(result).toEqual({
      image: `data:image/jpeg;base64,${JPEG_B64}`,
      skipped: ['logo (terlalu besar untuk batas 1 MB 9Router)'],
    })
    const request = vi.mocked(generateImage).mock.calls[0][0]
    expect(request.size).toBe('1088x1360')
    expect(request.images).toHaveLength(2)
    expect(request.prompt).toContain('image2 is a design reference')
    expect(database.inserted).toEqual([
      expect.objectContaining({ task: 'image', model: 'cx/gpt-image-2.5', output: { bytes: 8 }, status: 'ok' }),
    ])
    expect(JSON.stringify(database.inserted)).not.toContain('PPPP')
  })

  it('still draws without the brand when the kit cannot be read', async () => {
    vi.mocked(getBrandVisual).mockRejectedValue(new Error('relation "brand_kit" does not exist'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await createImage('user-1', INPUT)

    expect(vi.mocked(generateImage).mock.calls[0][0].prompt).not.toContain('Brand colours')
  })
})

describe('imageErrorMessage', () => {
  it('shows the provider message for stream errors and rejected models', () => {
    expect(imageErrorMessage(new RouterApiError('Codex did not return an image.', 200))).toBe(
      'Gambar gagal dibuat: Codex did not return an image.',
    )
    expect(imageErrorMessage(new RouterApiError('model is not supported', 400))).toBe(
      '9Router menolak permintaan gambar: model is not supported Periksa ROUTER_IMAGE_MODEL di .env.local.',
    )
  })

  it('falls back to the AI messages', () => {
    expect(imageErrorMessage(new RouterApiError('x', 413))).toContain('terlalu besar')
  })
})
