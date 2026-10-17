import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AiLimitError } from './ai'
import { getBrandVisual, loadLogoImage, loadReferenceImage, VISUAL_BODY_BUDGET, type BrandVisual } from './brand'
import { buildImagePrompt, drawImage, imageErrorMessage, imageLog } from './image-ai'
import type { ImageInput } from './image-options'
import { generateImage, RouterApiError } from './nine-router'
import { SlideImageError } from './slide-image'

vi.mock('./brand', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./brand')>()),
  getBrandVisual: vi.fn(),
  loadReferenceImage: vi.fn(),
  loadLogoImage: vi.fn(),
}))

vi.mock('./nine-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./nine-router')>()),
  generateImage: vi.fn(),
}))

const USER = 'user-1'
const REFERENCE_ID = '00000000-0000-4000-8000-000000000001'
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4])

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
  currentImage: null,
  slide: null,
}

const dataUrl = (fill: string, length: number) => `data:image/jpeg;base64,${fill.repeat(length)}`

describe('buildImagePrompt', () => {
  it('quotes the headline and carries the brand style, colours by role and fonts', () => {
    const prompt = buildImagePrompt(INPUT, BRAND, [])

    expect(prompt).toContain('4:5 portrait')
    expect(prompt).toContain('Scene: Pria muda di kafe dengan laptop')
    expect(prompt).toContain('render exactly this text and no other words: "Aku cuma bisa bilang “thank you”"')
    expect(prompt).not.toContain('line breaks')
    expect(prompt).toContain('in Inter or a close match')
    expect(prompt).toContain('Brand: Salah dulu English (Belajar bahasa Inggris).')
    expect(prompt).toContain('Brand colours: primary #181818, accent #e8b04b.')
    expect(prompt).toContain('Brand fonts: headings Inter.')
    expect(prompt).toContain('Visual style: Foto realistis')
  })

  it('names every colour role and both fonts', () => {
    const brand: BrandVisual = {
      ...BRAND,
      colors: [
        { hex: '#000001', role: 'utama' },
        { hex: '#000002', role: 'sekunder' },
        { hex: '#000003', role: 'aksen' },
        { hex: '#000004', role: 'latar' },
        { hex: '#000005', role: 'teks' },
      ],
      bodyFont: 'Lora',
    }

    const prompt = buildImagePrompt(INPUT, brand, [])

    expect(prompt).toContain(
      'Brand colours: primary #000001, secondary #000002, accent #000003, background #000004, text #000005.',
    )
    expect(prompt).toContain('Brand fonts: headings Inter, body Lora.')
  })

  it('leaves out the brand lines and the font hint without a brand', () => {
    const prompt = buildImagePrompt({ ...INPUT, format: '1:1' }, null, [])

    expect(prompt).toContain('1:1 square')
    expect(prompt).not.toContain('Brand')
    expect(prompt).not.toContain('close match')
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
      { kind: 'current' },
      { kind: 'previous' },
      { kind: 'reference', note: 'ambil layout-nya saja' },
      { kind: 'logo' },
    ])

    expect(prompt).toContain('slide 2 of 5 of one carousel')
    expect(prompt).toContain('image1 is the current version of this slide')
    expect(prompt).toContain('image2 is slide 1 of this carousel')
    expect(prompt).toContain('image3 is a design reference')
    expect(prompt).toContain('"ambil layout-nya saja"')
    expect(prompt).toContain('image4 is the brand logo')
  })

  it('says nothing about a carousel for a single image', () => {
    expect(buildImagePrompt({ ...INPUT, slide: { index: 1, count: 1 } }, null, [])).not.toContain('carousel')
  })
})

describe('drawImage', () => {
  beforeEach(() => {
    vi.mocked(getBrandVisual).mockReset().mockResolvedValue(BRAND)
    vi.mocked(loadReferenceImage).mockReset().mockResolvedValue({ dataUrl: dataUrl('R', 400_000), note: 'layout' })
    vi.mocked(loadLogoImage).mockReset().mockResolvedValue(dataUrl('L', 600_000))
    vi.mocked(generateImage).mockReset().mockResolvedValue(JPEG.toString('base64'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the decoded bytes, the prompt and what was sent', async () => {
    const drawn = await drawImage(USER, INPUT)

    expect(Buffer.from(drawn.bytes)).toEqual(JPEG)
    expect(drawn).toMatchObject({ sent: [], skipped: [] })
    expect(vi.mocked(generateImage).mock.calls[0][0]).toEqual({ prompt: drawn.prompt, size: '1088x1360', images: [] })
  })

  it('asks for the square size', async () => {
    await drawImage(USER, { ...INPUT, format: '1:1' })

    expect(vi.mocked(generateImage).mock.calls[0][0].size).toBe('1024x1024')
  })

  it('sends the current slide, slide 1 and the reference in that order, and skips a logo that no longer fits 1 MB', async () => {
    const currentImage = dataUrl('C', 100_000)
    const previousImage = dataUrl('P', 300_000)

    const drawn = await drawImage(USER, { ...INPUT, currentImage, previousImage, referenceId: REFERENCE_ID, includeLogo: true })

    expect(vi.mocked(generateImage).mock.calls[0][0].images).toEqual([currentImage, previousImage, dataUrl('R', 400_000)])
    expect(drawn.sent).toEqual(['current', 'previous', 'reference'])
    expect(drawn.skipped).toEqual(['logo (terlalu besar untuk batas 1 MB 9Router)'])
    expect(drawn.prompt).toContain('image3 is a design reference')
    expect(drawn.prompt).not.toContain('brand logo')
  })

  it('fills the budget exactly, and numbers the next images from image1 after one too big to send', async () => {
    const tooBig = 'x'.repeat(VISUAL_BODY_BUDGET + 1)
    const logo = 'y'.repeat(VISUAL_BODY_BUDGET)
    vi.mocked(loadLogoImage).mockResolvedValue(logo)

    const drawn = await drawImage(USER, { ...INPUT, currentImage: tooBig, includeLogo: true })

    expect(vi.mocked(generateImage).mock.calls[0][0].images).toEqual([logo])
    expect(drawn.skipped).toEqual(['gambar slide ini (terlalu besar untuk batas 1 MB 9Router)'])
    expect(drawn.prompt).toContain('image1 is the brand logo')
  })

  it('reports a reference and a logo that are gone', async () => {
    vi.mocked(loadReferenceImage).mockResolvedValue(null)
    vi.mocked(loadLogoImage).mockResolvedValue(null)

    const drawn = await drawImage(USER, { ...INPUT, referenceId: REFERENCE_ID, includeLogo: true })

    expect(loadReferenceImage).toHaveBeenCalledWith(USER, REFERENCE_ID, null)
    expect(drawn.skipped).toEqual(['referensi (tidak ditemukan)', 'logo (tidak ditemukan)'])
    expect(drawn.sent).toEqual([])
  })

  it('asks for the reference image that matches the slide’s place in the carousel', async () => {
    await drawImage(USER, { ...INPUT, referenceId: REFERENCE_ID, slide: { index: 5, count: 5 } })

    expect(loadReferenceImage).toHaveBeenCalledWith(USER, REFERENCE_ID, { index: 5, count: 5 })
  })

  it('loads only the images the input asks for', async () => {
    await drawImage(USER, INPUT)

    expect(loadReferenceImage).not.toHaveBeenCalled()
    expect(loadLogoImage).not.toHaveBeenCalled()
  })

  it('still draws without the brand when the kit cannot be read', async () => {
    vi.mocked(getBrandVisual).mockRejectedValue(new Error('relation "brand_kit" does not exist'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const drawn = await drawImage(USER, INPUT)

    expect(drawn.prompt).not.toContain('Brand colours')
    expect(console.error).toHaveBeenCalled()
  })

  it('passes a provider error on', async () => {
    const rejected = new RouterApiError('Codex did not return an image.', 200)
    vi.mocked(generateImage).mockRejectedValue(rejected)

    await expect(drawImage(USER, INPUT)).rejects.toBe(rejected)
  })
})

describe('imageLog', () => {
  it('keeps the byte count, the prompt and what was sent, never image data', () => {
    const drawn = { bytes: new Uint8Array(1234), prompt: 'Kafe', sent: ['previous' as const], skipped: ['logo (tidak ditemukan)'] }

    expect(imageLog(drawn)).toEqual({ bytes: 1234, prompt: 'Kafe', sent: ['previous'] })
  })
})

describe('imageErrorMessage', () => {
  it('names an unreadable image', () => {
    expect(imageErrorMessage(new SlideImageError('Input buffer contains unsupported image format'))).toBe(
      'Gambar dari layanan AI tidak bisa dibaca. Coba lagi.',
    )
  })

  it('shows the provider message for stream errors and rejected models', () => {
    expect(imageErrorMessage(new RouterApiError('Codex did not return an image.', 200))).toBe(
      'Gambar gagal dibuat: Codex did not return an image.',
    )
    expect(imageErrorMessage(new RouterApiError('model is not supported', 400))).toBe(
      '9Router menolak permintaan gambar: model is not supported Periksa ROUTER_IMAGE_MODEL di .env.local.',
    )
    expect(imageErrorMessage(new RouterApiError('model not found', 404))).toContain('ROUTER_IMAGE_MODEL')
  })

  it('shortens a long provider message', () => {
    expect(imageErrorMessage(new RouterApiError('e'.repeat(300), 200))).toBe(`Gambar gagal dibuat: ${'e'.repeat(120)}…`)
  })

  it('falls back to the AI messages', () => {
    expect(imageErrorMessage(new RouterApiError('x', 413))).toContain('terlalu besar')
    expect(imageErrorMessage(new AiLimitError('Langganan tidak aktif.'))).toBe('Langganan tidak aktif.')
  })
})
