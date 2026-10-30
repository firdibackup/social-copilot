import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AiLimitError } from './ai'
import { loadProductImages } from './assets'
import { loadAttachment } from './attachments'
import { getBrandVisual, loadLogoImage, loadReferenceImage, VISUAL_BODY_BUDGET, type BrandVisual } from './brand'
import { buildImagePrompt, drawImage, imageErrorMessage, imageLog } from './image-ai'
import type { ImageInput } from './image-options'
import { generateImage, RouterApiError } from './nine-router'
import { SlideImageError } from './slide-image'
import { loadTemplateImage } from './templates'

vi.mock('./assets', () => ({ loadProductImages: vi.fn() }))
vi.mock('./attachments', () => ({ loadAttachment: vi.fn() }))
vi.mock('./templates', () => ({ loadTemplateImage: vi.fn() }))

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
const REFERENCE_IMAGE_ID = '00000000-0000-4000-8000-000000000001'
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
  designStyle: '',
}

const INPUT: ImageInput = {
  scene: 'Pria muda di kafe dengan laptop',
  headline: 'Aku cuma bisa bilang “thank you”',
  format: '4:5',
  referenceImageId: null,
  example: null,
  productGroupId: null,
  includeLogo: false,
  siblingImage: null,
  currentImage: null,
  attachment: null,
  slide: null,
}

const dataUrl = (fill: string, length: number) => `data:image/jpeg;base64,${fill.repeat(length)}`
const exampleFile = (key: string) => dataUrl(`T${key}`, 10)
const inner = { index: 2, count: 5, role: 'isi' as const }

describe('buildImagePrompt', () => {
  it('quotes the headline and carries the brand style, colours by role and fonts', () => {
    const prompt = buildImagePrompt(INPUT, BRAND, [])

    expect(prompt).toContain('4:5 portrait')
    expect(prompt).toContain('Scene: Pria muda di kafe dengan laptop')
    expect(prompt).toContain('render exactly this text and no other words: "Aku cuma bisa bilang “thank you”"')
    expect(prompt).not.toContain('line breaks')
    expect(prompt).toContain('Set it in Inter bold, or a close match.')
    expect(prompt).toContain('Brand: Salah dulu English (Belajar bahasa Inggris).')
    expect(prompt).toContain('Brand colours: primary #181818, accent #e8b04b.')
    expect(prompt).toContain('Brand fonts: headings Inter.')
    expect(prompt).toContain('Visual style: Foto realistis')
  })

  it('lets a long single post follow its own design instead of the band and colour rules', () => {
    const headline = Array.from({ length: 20 }, (_, index) => `${index + 1}. She works from home.`).join('\n')
    const single = buildImagePrompt({ ...INPUT, headline, scene: 'Latar krem muda, dua kolom.', slide: null }, BRAND, [])

    expect(single).toContain('text-led single post')
    expect(single).toContain('Follow the layout, sections, columns, boxes, colours, fonts and emphasis described in the scene')
    expect(single).not.toContain('full-width horizontal bands')
    expect(single).not.toContain('At most two font weights')

    const carousel = buildImagePrompt({ ...INPUT, headline: headline.slice(0, 300), slide: { index: 2, count: 3, role: 'isi' } }, BRAND, [])
    expect(carousel).not.toContain('text-led single post')
    expect(carousel).toContain('full-width horizontal bands')
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

  it('falls back to a clean default style and modern fonts without a brand', () => {
    const prompt = buildImagePrompt({ ...INPUT, format: '1:1' }, null, [])

    expect(prompt).toContain('1:1 square')
    expect(prompt).not.toContain('Brand')
    expect(prompt).toContain('Design style: Minimalis Modern.')
    expect(prompt).toContain('Set it in Plus Jakarta Sans bold, or a close match.')
  })

  it('always forbids squashed fonts, shadows and garish text colours when there is text', () => {
    const prompt = buildImagePrompt(INPUT, BRAND, [])

    expect(prompt).toContain('never condensed, compressed, squashed')
    expect(prompt).toContain('no drop shadows, outlines, strokes, glows')
    expect(prompt).toContain('no rainbow, neon or multi-coloured words')
    expect(buildImagePrompt({ ...INPUT, headline: '' }, BRAND, [])).not.toContain('drop shadows')
  })

  it('keeps the line breaks of a multi-line text', () => {
    const prompt = buildImagePrompt({ ...INPUT, headline: 'Make vs Do\nI make coffee.\nI do my homework.' }, null, [])

    expect(prompt).toContain('"Make vs Do\nI make coffee.\nI do my homework."')
    expect(prompt).toContain('Keep its line breaks; the first line is the headline.')
    expect(prompt).toContain('first line in Plus Jakarta Sans bold and the other lines in Inter regular')
  })

  it('forbids any text without a headline, except a logo that was sent', () => {
    expect(buildImagePrompt({ ...INPUT, headline: '' }, null, [])).toContain(
      'Text: none. No words, letters, numbers, captions or watermarks, and no logos.',
    )
    expect(buildImagePrompt({ ...INPUT, headline: '' }, null, [{ kind: 'logo' }])).toContain('watermarks other than the logo.')
  })

  it('names the input images in the order they are sent', () => {
    const prompt = buildImagePrompt({ ...INPUT, slide: { index: 2, count: 5, role: 'isi' } }, null, [
      { kind: 'current' },
      { kind: 'sibling' },
      { kind: 'reference', note: 'ambil layout-nya saja' },
      { kind: 'logo' },
    ])

    expect(prompt).toContain('slide 2 of 5 of one carousel')
    expect(prompt).toContain('image1 is the current version of this slide')
    expect(prompt).toContain('image2 is another inner content slide of this carousel')
    expect(prompt).toContain('image3 is a general style reference')
    expect(prompt).toContain('"ambil layout-nya saja"')
    expect(prompt).toContain('image4 is the brand logo')
  })

  it('stacks text and imagery in bands and keeps everything inside the frame, with or without text', () => {
    for (const headline of ['Judul', '']) {
      const prompt = buildImagePrompt({ ...INPUT, headline }, BRAND, [])

      expect(prompt).toContain('stack the text and the imagery in full-width horizontal bands')
      expect(prompt).toContain('never set the text in a column beside a photo')
      expect(prompt).toContain('fully inside the frame with clear margins')
    }
  })

  it('keeps every word of the text and lets the text lead an inner slide', () => {
    const cover = buildImagePrompt({ ...INPUT, slide: { ...inner, role: 'cover' } }, null, [])
    const isi = buildImagePrompt({ ...INPUT, slide: inner }, null, [])

    expect(isi).toContain('never abbreviate, shorten, paraphrase or leave out words')
    expect(isi).toContain('make the photo or graphic smaller, never the text')
    expect(isi).toContain('the text is the main element and takes the larger share of the slide')
    expect(cover).toContain('never abbreviate')
    expect(cover).not.toContain('the text is the main element')
    expect(buildImagePrompt({ ...INPUT, headline: '', slide: inner }, null, [])).not.toContain('never abbreviate')
  })

  it('follows an attached image the way the owner asked, over the other images and the layout', () => {
    const prompt = buildImagePrompt({ ...INPUT, slide: inner }, null, [{ kind: 'attachment', note: 'ikuti layout gambar ini' }])

    expect(prompt).toContain('image1 is an image the owner attached, with this instruction for this slide: "ikuti layout gambar ini".')
    expect(prompt).toContain('the instruction wins')
    expect(prompt).toContain('If the instruction doesn’t say how, decide from the image')
  })

  it('says nothing about a carousel or a role for a single image', () => {
    const prompt = buildImagePrompt({ ...INPUT, slide: { index: 1, count: 1, role: null } }, null, [])

    expect(prompt).not.toContain('carousel')
    expect(prompt).not.toContain('cover')
  })
})

describe('design styles in the prompt', () => {
  const minimal: BrandVisual = { ...BRAND, visualStyle: '', designStyle: 'minimalis', headingFont: '', bodyFont: '' }
  const carousel = (role: 'cover' | 'isi' | 'cta', images: Parameters<typeof buildImagePrompt>[2] = []) =>
    buildImagePrompt({ ...INPUT, slide: { index: 2, count: 5, role } }, minimal, images)

  it('gives the cover, the inner slides and the CTA their own layout from the chosen style', () => {
    expect(carousel('cover')).toContain('Cover layout: a small label above a large bold headline')
    expect(carousel('isi')).toContain('Inner slide layout: a small slide number top-left')
    expect(carousel('cta')).toContain('CTA layout: centred, one short bold line')
    expect(carousel('isi')).not.toContain('Cover layout')
    for (const role of ['cover', 'isi', 'cta'] as const) expect(carousel(role)).toContain('Design style: Minimalis Modern.')
  })

  it('takes the style’s fonts when the owner picked none', () => {
    expect(carousel('cover')).toContain('Set it in Plus Jakarta Sans bold')
    const bold = buildImagePrompt(INPUT, { ...minimal, designStyle: 'bold' }, [])
    expect(bold).toContain('Set it in Poppins bold')
    expect(buildImagePrompt(INPUT, { ...minimal, designStyle: 'bold', headingFont: 'Montserrat' }, [])).toContain(
      'Set it in Montserrat bold',
    )
  })

  it('lets the owner reference fully replace the admin design style', () => {
    const prompt = carousel('isi', [{ kind: 'reference', label: 'isi' }])

    expect(prompt).toContain('copy its visual design for this slide: layout, colours, typography, graphic elements, framing and composition')
    expect(prompt).not.toContain('Design style: Minimalis Modern.')
    expect(prompt).not.toContain('Inner slide layout: a small slide number top-left')
    expect(prompt).not.toContain('Brand colours:')
    expect(prompt).not.toContain('Brand fonts:')
  })

  it('leaves how a photo meets the text to the reference or example, with no fade of its own', () => {
    expect(carousel('cover', [{ kind: 'reference', label: 'cover' }])).not.toMatch(/fade|blend|gentle gradient/i)
    expect(carousel('cover', [{ kind: 'example' }])).not.toMatch(/fade|blend|gentle gradient/i)
  })

  it('lets a later inner slide follow its sibling rather than the recipe', () => {
    expect(carousel('isi', [{ kind: 'sibling' }])).not.toContain('Inner slide layout')
  })

  it('copies the layout of a style example, never its brand, and takes the brand colours when there are some', () => {
    const prompt = carousel('isi', [{ kind: 'example' }])

    expect(prompt).toContain('image1 is an example inner content slide in this design style: follow its layout')
    expect(prompt).toContain('do not copy its words, logo, brand name, people or products')
    expect(prompt).toContain('use the brand colours below instead of its colours')
    expect(prompt).not.toContain('Inner slide layout')
    expect(prompt).not.toContain('The reference decides the layout')
    const colourless = buildImagePrompt({ ...INPUT, slide: inner }, null, [{ kind: 'example' }])
    expect(colourless).toContain('image1 is an example inner content slide')
    expect(colourless).not.toContain('use the brand colours')
  })

  it('calls a style example of a one-image post an example post', () => {
    expect(buildImagePrompt(INPUT, null, [{ kind: 'example' }])).toContain('image1 is an example post in this design style')
  })

  it('takes only the style of an Umum reference on an inner slide, which keeps its own layout', () => {
    const prompt = carousel('isi', [{ kind: 'reference', label: 'single' }])

    expect(prompt).toContain('image1 is a general style reference: take its colours, type feel and mood')
    expect(prompt).toContain('Inner slide layout: a small slide number top-left')
    expect(prompt).not.toContain('The reference decides the layout')
  })

  it('follows the composition of an Umum reference on the cover', () => {
    const prompt = carousel('cover', [{ kind: 'reference', label: 'single' }])

    expect(prompt).toContain('image1 is a design reference: follow its style, composition and mood')
    expect(prompt).not.toContain('Design style: Minimalis Modern.')
    expect(prompt).toContain('Match the typography, weights and hierarchy of the owner reference.')
    expect(prompt).not.toContain('Cover layout:')
  })

  it('keeps the owner’s own visual style in charge when no style was picked, with plain role layouts', () => {
    const prompt = buildImagePrompt({ ...INPUT, slide: { index: 1, count: 3, role: 'cover' } }, BRAND, [])

    expect(prompt).not.toContain('Design style:')
    expect(prompt).toContain('Visual style: Foto realistis')
    expect(prompt).toContain('Cover layout: the hook as a large headline')
  })

  it('marks the past posts’ style as mood only when a style was picked too', () => {
    const prompt = buildImagePrompt(INPUT, { ...BRAND, designStyle: 'elegan' }, [])

    expect(prompt).toContain('Design style: Elegan Premium.')
    expect(prompt).toContain("Visual style of the owner's past posts (take its mood and imagery; the design style above decides the typography)")
  })
})

describe('drawImage', () => {
  beforeEach(() => {
    vi.mocked(getBrandVisual).mockReset().mockResolvedValue(BRAND)
    vi.mocked(loadProductImages).mockReset().mockResolvedValue([])
    vi.mocked(loadReferenceImage).mockReset().mockResolvedValue({ dataUrl: dataUrl('R', 400_000), note: 'layout', label: 'single' })
    vi.mocked(loadLogoImage).mockReset().mockResolvedValue(dataUrl('L', 600_000))
    vi.mocked(loadAttachment).mockReset()
    vi.mocked(loadTemplateImage)
      .mockReset()
      .mockImplementation(async (key) => (key === 'hilang' ? null : exampleFile(key)))
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

  it('puts product images before the design reference and preserves their identity in the prompt', async () => {
    const product = dataUrl('P', 200_000)
    vi.mocked(loadProductImages).mockResolvedValue([{ dataUrl: product, title: 'Kopi Botol' }])

    const drawn = await drawImage(USER, {
      ...INPUT,
      productGroupId: '00000000-0000-4000-8000-000000000099',
      referenceImageId: REFERENCE_IMAGE_ID,
    })

    expect(vi.mocked(generateImage).mock.calls[0][0].images).toEqual([product, dataUrl('R', 400_000)])
    expect(drawn.sent).toEqual(['product', 'reference'])
    expect(drawn.prompt).toContain('preserve its shape, colour, packaging, label and visible branding exactly')
  })

  it('sends the current slide and the reference, and skips a logo that no longer fits 1 MB', async () => {
    const currentImage = dataUrl('C', 100_000)

    const drawn = await drawImage(USER, { ...INPUT, currentImage, referenceImageId: REFERENCE_IMAGE_ID, includeLogo: true })

    expect(vi.mocked(generateImage).mock.calls[0][0].images).toEqual([currentImage, dataUrl('R', 400_000)])
    expect(drawn.sent).toEqual(['current', 'reference'])
    expect(drawn.skipped).toEqual(['logo (terlalu besar untuk batas 1 MB 9Router)'])
    expect(drawn.prompt).toContain('image2 is a design reference')
    expect(drawn.prompt).not.toContain('brand logo')
  })

  it('lets an inner slide follow its reference, not the first inner slide made', async () => {
    vi.mocked(loadReferenceImage).mockResolvedValue({ dataUrl: dataUrl('R', 100_000), note: '', label: 'isi' })

    const drawn = await drawImage(USER, {
      ...INPUT,
      siblingImage: dataUrl('S', 100_000),
      referenceImageId: REFERENCE_IMAGE_ID,
      slide: { index: 3, count: 5, role: 'isi' },
    })

    expect(drawn.sent).toEqual(['reference'])
    expect(drawn.skipped).toEqual([])
    expect(drawn.prompt).toContain('image1 is an inner content slide')
  })

  it('lets an inner slide follow its style example, not the first inner slide made', async () => {
    const drawn = await drawImage(USER, { ...INPUT, siblingImage: dataUrl('S', 100), example: 'langkah-bernomor', slide: inner })

    expect(vi.mocked(generateImage).mock.calls[0][0].images).toEqual([exampleFile('langkah-bernomor')])
    expect(loadTemplateImage).toHaveBeenCalledWith('langkah-bernomor')
    expect(drawn.sent).toEqual(['example'])
  })

  it('lets an inner slide without a reference or example follow the first inner slide made', async () => {
    const siblingImage = dataUrl('S', 100)

    const drawn = await drawImage(USER, { ...INPUT, siblingImage, slide: inner })

    expect(vi.mocked(generateImage).mock.calls[0][0].images).toEqual([siblingImage])
    expect(drawn.sent).toEqual(['sibling'])
  })

  it('sends an attached image right after the current slide, before products and the style example', async () => {
    const currentImage = dataUrl('C', 100)
    const attached = dataUrl('A', 100)
    const product = dataUrl('P', 100)
    vi.mocked(loadProductImages).mockResolvedValue([{ dataUrl: product, title: 'Kopi Botol' }])

    const drawn = await drawImage(USER, {
      ...INPUT,
      currentImage,
      attachment: { dataUrl: attached, note: 'pakai foto ini' },
      productGroupId: '00000000-0000-4000-8000-000000000099',
      example: 'bento-produk',
    })

    expect(vi.mocked(generateImage).mock.calls[0][0].images).toEqual([currentImage, attached, product, exampleFile('bento-produk')])
    expect(drawn.sent).toEqual(['current', 'attachment', 'product', 'example'])
    expect(drawn.prompt).toContain('image2 is an image the owner attached, with this instruction for this slide: "pakai foto ini".')
  })

  it('loads a stored attachment by its path', async () => {
    const stored = dataUrl('A', 100)
    vi.mocked(loadAttachment).mockResolvedValue(stored)
    const path = `${USER}/lampiran/00000000-0000-4000-8000-000000000005.jpg`

    const drawn = await drawImage(USER, { ...INPUT, attachment: { path, note: 'Follow its layout.' } })

    expect(loadAttachment).toHaveBeenCalledWith(USER, path)
    expect(vi.mocked(generateImage).mock.calls[0][0].images).toEqual([stored])
    expect(drawn.sent).toEqual(['attachment'])
  })

  it('reports a stored attachment and a style example that are gone', async () => {
    vi.mocked(loadAttachment).mockResolvedValue(null)

    const drawn = await drawImage(USER, { ...INPUT, attachment: { path: 'x', note: '' }, example: 'hilang' })

    expect(drawn.sent).toEqual([])
    expect(drawn.skipped).toEqual(['lampiran (tidak ditemukan)', 'template desain (tidak ditemukan)'])
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

    const drawn = await drawImage(USER, { ...INPUT, referenceImageId: REFERENCE_IMAGE_ID, includeLogo: true })

    expect(loadReferenceImage).toHaveBeenCalledWith(USER, REFERENCE_IMAGE_ID)
    expect(drawn.skipped).toEqual(['referensi (tidak ditemukan)', 'logo (tidak ditemukan)'])
    expect(drawn.sent).toEqual([])
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
    const drawn = { bytes: new Uint8Array(1234), prompt: 'Kafe', sent: ['sibling' as const], skipped: ['logo (tidak ditemukan)'] }

    expect(imageLog(drawn)).toEqual({ bytes: 1234, prompt: 'Kafe', sent: ['sibling'], skipped: ['logo (tidak ditemukan)'] })
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
      '9Router menolak permintaan gambar: model is not supported Periksa model gambar di Admin › Pengaturan.',
    )
    expect(imageErrorMessage(new RouterApiError('model not found', 404))).toContain('Admin › Pengaturan')
  })

  it('shortens a long provider message', () => {
    expect(imageErrorMessage(new RouterApiError('e'.repeat(300), 200))).toBe(`Gambar gagal dibuat: ${'e'.repeat(120)}…`)
  })

  it('falls back to the AI messages', () => {
    expect(imageErrorMessage(new RouterApiError('x', 413))).toContain('terlalu besar')
    expect(imageErrorMessage(new AiLimitError('Langganan tidak aktif.'))).toBe('Langganan tidak aktif.')
  })
})

describe('slide roles in the prompt', () => {
  it('tells the model which slide it makes and which slide of the reference to follow', () => {
    const prompt = buildImagePrompt({ ...INPUT, slide: { index: 5, count: 5, role: 'cta' } }, null, [
      { kind: 'reference', label: 'cta' },
    ])

    expect(prompt).toContain('This is the closing call-to-action slide.')
    expect(prompt).toContain("image1 is the CTA slide of the owner's reference carousel: copy its visual design for this slide")
  })

  it('takes the role the plan gave the slide, not its place', () => {
    const prompt = buildImagePrompt({ ...INPUT, slide: { index: 3, count: 3, role: 'isi' } }, null, [])

    expect(prompt).toContain('This is an inner content slide')
    expect(prompt).not.toContain('call-to-action')
  })

  it('keeps inner and CTA slides apart from the cover’s look', () => {
    const prompt = (role: 'cover' | 'isi' | 'cta') => buildImagePrompt({ ...INPUT, slide: { index: 2, count: 5, role } }, null, [])

    expect(prompt('cover')).toContain('This is the cover slide')
    expect(prompt('cover')).not.toContain('Do not make it look like a cover')
    expect(prompt('isi')).toContain('Do not make it look like a cover')
    expect(prompt('cta')).toContain('Do not make it look like a cover')
    expect(prompt('isi')).toContain('All slides share one design system')
    expect(prompt('isi')).toContain('each have their own layout for their role')
  })

  it('describes the inner slide of a reference', () => {
    expect(
      buildImagePrompt({ ...INPUT, slide: { index: 3, count: 5, role: 'isi' } }, null, [{ kind: 'reference', label: 'isi' }]),
    ).toContain("image1 is an inner content slide of the owner's reference carousel")
  })

  it('keeps the neutral reference wording for a single photo', () => {
    const prompt = buildImagePrompt(INPUT, null, [{ kind: 'reference', label: 'single' }])

    expect(prompt).toContain('image1 is a design reference: follow its style, composition and mood')
  })
})
