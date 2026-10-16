import 'server-only'
import { aiErrorMessage, AiOutputError, describeBrand, quote, readJson, runLogged, snippetOf } from './ai'
import {
  getBrandContext,
  getBrandVisual,
  loadLogoImage,
  loadReferenceImage,
  VISUAL_BODY_BUDGET,
  type BrandVisual,
} from './brand'
import { lengthOf, truncate, type BrandContext, type ColorRole } from './brand-options'
import { describeError } from './errors'
import { imageType } from './image'
import {
  CONTENT_MAX_LENGTH,
  HEADLINE_MAX_LENGTH,
  IMAGE_FORMATS,
  MAX_SLIDES,
  PREVIOUS_IMAGE_MAX_LENGTH,
  SCENE_MAX_LENGTH,
  type ImageFormat,
  type ImageInput,
  type Slide,
} from './image-options'
import { chatCompletion, generateImage, imageModel, RouterApiError, type ChatMessage } from './nine-router'
import { isUuid } from './params'

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null
/** Trimmed, with textarea CRLF as LF. */
const text = (value: unknown) => (typeof value === 'string' ? value.replace(/\r\n/g, '\n').trim() : '')
const DATA_URL = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/

function parseSlidePosition(value: unknown): ImageInput['slide'] | undefined {
  if (value === null || value === undefined) return null
  if (!isObject(value)) return undefined
  const { index, count } = value
  const valid = [index, count].every((n) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= MAX_SLIDES)
  return valid && (index as number) <= (count as number) ? { index: index as number, count: count as number } : undefined
}

/** Validates what the generator sent. The server action's parameter type is only a hint. */
export function parseImageInput(value: unknown): { input: ImageInput } | { error: string } {
  if (!isObject(value)) return { error: 'Permintaan tidak valid.' }
  const scene = text(value.scene)
  const headline = text(value.headline)
  const { format, referenceId, previousImage } = value
  const slide = parseSlidePosition(value.slide)

  if (!scene) return { error: 'Tulis deskripsi gambar dulu.' }
  if (lengthOf(scene) > SCENE_MAX_LENGTH) return { error: `Deskripsi gambar maksimal ${SCENE_MAX_LENGTH} karakter.` }
  if (lengthOf(headline) > HEADLINE_MAX_LENGTH) return { error: `Teks di gambar maksimal ${HEADLINE_MAX_LENGTH} karakter.` }
  if (typeof format !== 'string' || !Object.hasOwn(IMAGE_FORMATS, format)) return { error: 'Format gambar tidak dikenal.' }
  if (referenceId !== null && referenceId !== undefined && !isUuid(referenceId)) return { error: 'Referensi tidak ditemukan.' }
  if (slide === undefined) return { error: 'Posisi slide tidak valid.' }
  if (
    previousImage !== null &&
    previousImage !== undefined &&
    (typeof previousImage !== 'string' || previousImage.length > PREVIOUS_IMAGE_MAX_LENGTH || !DATA_URL.test(previousImage))
  ) {
    return { error: 'Gambar slide 1 tidak valid. Buat ulang slide 1.' }
  }
  return {
    input: {
      scene,
      headline,
      format: format as ImageFormat,
      referenceId: typeof referenceId === 'string' ? referenceId : null,
      includeLogo: value.includeLogo === true,
      previousImage: typeof previousImage === 'string' ? previousImage : null,
      slide,
    },
  }
}

export type InputImageKind = 'previous' | 'reference' | 'logo'

/** An input image as the prompt describes it; the n-th one is named `image<n>` by 9Router. */
export interface PromptImage {
  kind: InputImageKind
  note?: string
}

const ROLE_NAMES: Record<ColorRole, string> = {
  utama: 'primary',
  sekunder: 'secondary',
  aksen: 'accent',
  latar: 'background',
  teks: 'text',
}

function describeInputImage(image: PromptImage, index: number): string {
  const name = `image${index + 1}`
  switch (image.kind) {
    case 'previous':
      return `${name} is slide 1 of this carousel: keep the same people, colours, lighting, typography and layout, with this slide's own scene.`
    case 'reference':
      return `${name} is a design reference: follow its style, composition and mood, not its content.${image.note ? ` The owner's note about it: "${image.note}".` : ''}`
    case 'logo':
      return `${name} is the brand logo: place it small and unaltered in one corner.`
  }
}

function describeBrandVisual(brand: BrandVisual): string[] {
  const lines: string[] = []
  if (brand.name) lines.push(`Brand: ${brand.name}${brand.category ? ` (${brand.category})` : ''}.`)
  if (brand.visualStyle) lines.push(`Visual style: ${brand.visualStyle}`)
  if (brand.colors.length > 0) {
    const colors = brand.colors.map((color) => `${ROLE_NAMES[color.role]} ${color.hex}`).join(', ')
    lines.push(`Brand colours: ${colors}. Use them for backgrounds, graphic elements and text.`)
  }
  const fonts = [brand.headingFont && `headings ${brand.headingFont}`, brand.bodyFont && `body ${brand.bodyFont}`].filter(Boolean)
  if (fonts.length > 0) lines.push(`Brand fonts: ${fonts.join(', ')}.`)
  return lines
}

/**
 * The image prompt, in English because image models follow it best. The headline goes in quotes so the model writes
 * exactly that; without one the model is told to write nothing, since otherwise it adds words of its own.
 */
export function buildImagePrompt(
  input: Pick<ImageInput, 'scene' | 'headline' | 'format' | 'slide'>,
  brand: BrandVisual | null,
  images: PromptImage[],
): string {
  const lines = [`An Instagram post image, ${IMAGE_FORMATS[input.format].aspect}.`]
  if (input.slide && input.slide.count > 1) {
    lines.push(`It is slide ${input.slide.index} of ${input.slide.count} of one carousel; all slides share one consistent design.`)
  }
  lines.push(`Scene: ${input.scene}`)
  lines.push(...images.map(describeInputImage))
  if (input.headline) {
    const font = brand?.headingFont ? `, in ${brand.headingFont} or a close match` : ''
    const breaks = input.headline.includes('\n') ? ' Keep its line breaks; the first line is the headline.' : ''
    lines.push(
      `Text: render exactly this text and no other words: "${input.headline}".${breaks} Make it large, legible and fully inside the frame${font}.`,
    )
  } else {
    const logo = images.some((image) => image.kind === 'logo')
    lines.push(`Text: none. No words, letters, numbers, captions or watermarks${logo ? ' other than the logo' : ', and no logos'}.`)
  }
  if (brand) lines.push(...describeBrandVisual(brand))
  return lines.join('\n')
}

const SKIPPED_LABELS: Record<InputImageKind, string> = { previous: 'slide 1', reference: 'referensi', logo: 'logo' }

interface PackedImages {
  images: string[]
  described: PromptImage[]
  /** Owner-facing reasons, e.g. "logo (belum ada)". */
  skipped: string[]
}

/**
 * Input images in priority order (slide 1, the reference, the logo), as long as they fit the 1 MB request limit
 * of the nginx in front of 9Router together.
 */
async function packImages(userId: string, input: ImageInput): Promise<PackedImages> {
  const packed: PackedImages = { images: [], described: [], skipped: [] }
  const { previousImage, referenceId } = input
  const candidates: { kind: InputImageKind; load: () => Promise<{ dataUrl: string; note?: string } | null> }[] = []
  if (previousImage) candidates.push({ kind: 'previous', load: async () => ({ dataUrl: previousImage }) })
  if (referenceId) candidates.push({ kind: 'reference', load: () => loadReferenceImage(userId, referenceId) })
  if (input.includeLogo) {
    candidates.push({
      kind: 'logo',
      load: async () => {
        const dataUrl = await loadLogoImage(userId)
        return dataUrl ? { dataUrl } : null
      },
    })
  }

  let used = 0
  for (const candidate of candidates) {
    const loaded = await candidate.load()
    if (!loaded) {
      packed.skipped.push(`${SKIPPED_LABELS[candidate.kind]} (tidak ditemukan)`)
      continue
    }
    if (used + loaded.dataUrl.length > VISUAL_BODY_BUDGET) {
      packed.skipped.push(`${SKIPPED_LABELS[candidate.kind]} (terlalu besar untuk batas 1 MB 9Router)`)
      continue
    }
    used += loaded.dataUrl.length
    packed.images.push(loaded.dataUrl)
    packed.described.push({ kind: candidate.kind, note: loaded.note })
  }
  return packed
}

/** Images still come out without the brand when the kit can't be read; they are just not on-brand. */
async function orNull<T>(load: () => Promise<T | null>, what: string): Promise<T | null> {
  try {
    return await load()
  } catch (error) {
    console.error(`[gambar] ${what} gagal dimuat, lanjut tanpa itu:`, describeError(error))
    return null
  }
}

export interface CreatedImage {
  /** Data URL. */
  image: string
  skipped: string[]
}

/** One image request. The log keeps the prompt and the choices, never image data. */
export async function createImage(userId: string, input: ImageInput): Promise<CreatedImage> {
  const [brand, packed] = await Promise.all([orNull(() => getBrandVisual(userId), 'brand kit'), packImages(userId, input)])
  const prompt = buildImagePrompt(input, brand, packed.described)
  const { size } = IMAGE_FORMATS[input.format]
  const logInput = {
    format: input.format,
    size,
    slide: input.slide,
    headline: input.headline,
    scene: input.scene,
    referenceId: input.referenceId,
    includeLogo: input.includeLogo,
    sent: packed.described.map((image) => image.kind),
    prompt,
  }
  const b64 = await runLogged(userId, 'image', logInput, () => generateImage({ prompt, size, images: packed.images }), {
    model: imageModel(),
    logOutput: (result) => ({ bytes: Buffer.byteLength(result, 'base64') }),
  })
  // JPEG is asked for; the bytes decide in case a provider answers otherwise.
  const type = imageType(Buffer.from(b64.slice(0, 32), 'base64')) ?? 'image/jpeg'
  return { image: `data:${type};base64,${b64}`, skipped: packed.skipped }
}

const PLAN_SYSTEM = [
  'Kamu perancang konten visual Instagram untuk satu brand di Indonesia.',
  'Aturan:',
  '- Tentukan jumlah gambar dari isi konten: 1 gambar untuk pesan tunggal seperti promo, pengumuman, atau kutipan; carousel 2–10 slide untuk daftar, tips, langkah, perbandingan, atau cerita.',
  '- headline: SEMUA teks yang tertulis di gambar, dalam bahasa konten: judul, poin, atau contoh kalimat. Boleh 1–4 baris pendek dipisah \\n, maksimal 150 karakter. Kosongkan hanya kalau gambar memang lebih kuat tanpa teks.',
  '- scene: 1–2 kalimat tentang visualnya saja (subjek, tempat, komposisi, suasana). Jangan tulis kata atau kalimat yang harus tampil di gambar di sini; itu tempatnya di headline.',
  '- Slide pertama harus menarik perhatian. Slide terakhir boleh berisi ajakan bertindak kalau sesuai.',
  '- Jangan mengarang fakta, harga, atau klaim yang tidak ada di konten atau fakta brand.',
  '- Jangan pakai Markdown.',
  '- Balas HANYA dengan satu objek JSON sesuai format yang diminta, tanpa teks lain.',
].join('\n')

export function buildPlanMessages(content: string, brand: BrandContext | null): ChatMessage[] {
  return [
    { role: 'system', content: PLAN_SYSTEM },
    {
      role: 'user',
      content: [
        `${brand ? describeBrand(brand) : ''}Tugas: rencanakan gambar Instagram untuk konten di bawah.`,
        'Format JSON: {"slides": [{"headline": "…", "scene": "…"}]}',
        '',
        `Konten:\n${quote(content)}`,
      ].join('\n'),
    },
  ]
}

/** Slides with a scene, at most MAX_SLIDES. An answer with none is an AiOutputError. */
export function parsePlan(content: string): Slide[] {
  const json = readJson(content)
  const listed: unknown[] = Array.isArray(json?.slides) ? json.slides : []
  const slides = listed
    .filter(isObject)
    .map((slide) => ({
      headline: truncate(text(slide.headline), HEADLINE_MAX_LENGTH),
      scene: truncate(text(slide.scene), SCENE_MAX_LENGTH),
    }))
    .filter((slide) => slide.scene)
    .slice(0, MAX_SLIDES)
  if (slides.length === 0) throw new AiOutputError(snippetOf(content))
  return slides
}

export function parseContent(value: unknown): string | { error: string } {
  const content = text(value)
  if (!content) return { error: 'Tulis isi konten dulu, mis. topik atau caption post.' }
  return lengthOf(content) > CONTENT_MAX_LENGTH ? { error: `Isi konten maksimal ${CONTENT_MAX_LENGTH} karakter.` } : content
}

/** One chat request: the slide plan the generator shows as an editable draft. */
export async function planSlides(userId: string, content: string): Promise<Slide[]> {
  return runLogged(userId, 'image_plan', { content }, async () => {
    const brand = await orNull(() => getBrandContext(userId), 'brand kit')
    return parsePlan(await chatCompletion(buildPlanMessages(content, brand)))
  })
}

/** Owner-facing text for anything createImage or planSlides throws. */
export function imageErrorMessage(error: unknown): string {
  if (error instanceof RouterApiError) {
    const detail = snippetOf(error.message)
    if (error.status === 200) return `Gambar gagal dibuat: ${detail}`
    if (error.status === 400 || error.status === 404) {
      return `9Router menolak permintaan gambar: ${detail} Periksa ROUTER_IMAGE_MODEL di .env.local.`
    }
  }
  return aiErrorMessage(error)
}
