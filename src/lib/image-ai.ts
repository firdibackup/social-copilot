import 'server-only'
import { aiErrorMessage, snippetOf } from './ai'
import { getBrandVisual, loadLogoImage, loadReferenceImage, VISUAL_BODY_BUDGET, type BrandVisual } from './brand'
import type { ColorRole } from './brand-options'
import { describeError } from './errors'
import { IMAGE_FORMATS, type ImageInput } from './image-options'
import { generateImage, RouterApiError } from './nine-router'
import { SlideImageError } from './slide-image'

export type InputImageKind = 'current' | 'previous' | 'reference' | 'logo'

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
    case 'current':
      return `${name} is the current version of this slide: keep its people, layout, colours, typography and overall style, and change only what the scene and text below ask for.`
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

const SKIPPED_LABELS: Record<InputImageKind, string> = {
  current: 'gambar slide ini',
  previous: 'slide 1',
  reference: 'referensi',
  logo: 'logo',
}

interface PackedImages {
  images: string[]
  described: PromptImage[]
  /** Owner-facing reasons, e.g. "logo (belum ada)". */
  skipped: string[]
}

/**
 * Input images in priority order (the slide being edited, slide 1, the reference, the logo), as long as they fit
 * the 1 MB request limit of the nginx in front of 9Router together.
 */
async function packImages(userId: string, input: ImageInput): Promise<PackedImages> {
  const packed: PackedImages = { images: [], described: [], skipped: [] }
  const { currentImage, previousImage, referenceId } = input
  const candidates: { kind: InputImageKind; load: () => Promise<{ dataUrl: string; note?: string } | null> }[] = []
  if (currentImage) candidates.push({ kind: 'current', load: async () => ({ dataUrl: currentImage }) })
  if (previousImage) candidates.push({ kind: 'previous', load: async () => ({ dataUrl: previousImage }) })
  if (referenceId) candidates.push({ kind: 'reference', load: () => loadReferenceImage(userId, referenceId, input.slide) })
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

export interface DrawnImage {
  /** As the provider sent them; src/lib/slide-image.ts makes them Instagram-ready. */
  bytes: Uint8Array
  prompt: string
  sent: InputImageKind[]
  skipped: string[]
}

/**
 * One image from 9Router. Not logged or charged here: callers wrap it in runLogged with their own task and cost,
 * and log the prompt and byte count, never image data.
 */
export async function drawImage(userId: string, input: ImageInput): Promise<DrawnImage> {
  const [brand, packed] = await Promise.all([orNull(() => getBrandVisual(userId), 'brand kit'), packImages(userId, input)])
  const prompt = buildImagePrompt(input, brand, packed.described)
  const b64 = await generateImage({ prompt, size: IMAGE_FORMATS[input.format].size, images: packed.images })
  return {
    bytes: new Uint8Array(Buffer.from(b64, 'base64')),
    prompt,
    sent: packed.described.map((image) => image.kind),
    skipped: packed.skipped,
  }
}

/** What the log keeps of an image: its prompt and size. */
export const imageLog = (image: DrawnImage) => ({ bytes: image.bytes.length, prompt: image.prompt, sent: image.sent })

/** Owner-facing text for anything an image request throws. */
export function imageErrorMessage(error: unknown): string {
  if (error instanceof SlideImageError) return 'Gambar dari layanan AI tidak bisa dibaca. Coba lagi.'
  if (error instanceof RouterApiError) {
    const detail = snippetOf(error.message)
    if (error.status === 200) return `Gambar gagal dibuat: ${detail}`
    if (error.status === 400 || error.status === 404) {
      return `9Router menolak permintaan gambar: ${detail} Periksa ROUTER_IMAGE_MODEL di .env.local.`
    }
  }
  return aiErrorMessage(error)
}
