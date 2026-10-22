import 'server-only'
import { aiErrorMessage, snippetOf } from './ai'
import { loadProductImages } from './assets'
import { loadAttachment } from './attachments'
import { getBrandVisual, loadLogoImage, loadReferenceImage, VISUAL_BODY_BUDGET, type BrandVisual } from './brand'
import type { ColorRole, ReferenceLabel, SlideRole } from './brand-options'
import { DEFAULT_BODY_FONT, DEFAULT_HEADING_FONT, styleForBrand, type LayoutRole } from './design-styles'
import { describeError } from './errors'
import { IMAGE_FORMATS, type ImageInput } from './image-options'
import { generateImage, RouterApiError } from './nine-router'
import { SlideImageError } from './slide-image'
import { loadTemplateImage } from './templates'

export type InputImageKind = 'current' | 'attachment' | 'product' | 'reference' | 'example' | 'sibling' | 'logo'

/** An input image as the prompt describes it; the n-th one is named `image<n>` by 9Router. */
export interface PromptImage {
  kind: InputImageKind
  note?: string
  /** For a reference: which slide of its group it is. */
  label?: ReferenceLabel
}

const ROLE_LINES: Record<SlideRole, string> = {
  cover: 'This is the cover slide: a hook that makes people stop and swipe.',
  isi: 'This is an inner content slide: it explains one point.',
  cta: 'This is the closing call-to-action slide.',
}

const NOT_COVER = 'Do not make it look like a cover: no big hook title layout; follow this slide’s own role.'

const REFERENCE_SLIDES: Record<SlideRole, string> = {
  cover: 'the cover slide',
  isi: 'an inner content slide',
  cta: 'the CTA slide',
}

const EXAMPLE_SLIDES: Record<SlideRole, string> = {
  cover: 'cover slide',
  isi: 'inner content slide',
  cta: 'closing CTA slide',
}

/** What a line about an input image depends on besides the image. */
interface ImageContext {
  /** The slide's role; null for a one-image post. */
  role: SlideRole | null
  /** The brand has colours, which replace a style example's own. */
  colors: boolean
}

/**
 * A reference gives its layout to the role it is labelled for. An Umum one (`single`, or unlabelled) gives it only
 * to a cover or a one-image post; other slides take just its style, so they don't come out looking like covers.
 */
const givesLayout = (image: PromptImage, role: SlideRole | null) =>
  image.kind === 'reference' &&
  ((image.label !== undefined && image.label !== 'single') || role === null || role === 'cover')

const ROLE_NAMES: Record<ColorRole, string> = {
  utama: 'primary',
  sekunder: 'secondary',
  aksen: 'accent',
  latar: 'background',
  teks: 'text',
}

function describeInputImage(image: PromptImage, index: number, context: ImageContext): string {
  const name = `image${index + 1}`
  switch (image.kind) {
    case 'current':
      return `${name} is the current version of this slide: keep its people, layout, colours, typography and overall style, and change only what the scene and text below ask for.`
    case 'attachment':
      return `${name} is an image the owner attached, with this instruction for this slide: "${image.note ?? ''}". Follow it; where it conflicts with the other images or the layout described below, the instruction wins. If the instruction doesn’t say how, decide from the image: a finished design or post means follow its layout and style; a photo of a product, place or person means show it in this slide.`
    case 'example': {
      const slide = context.role ? EXAMPLE_SLIDES[context.role] : 'post'
      const colours = context.colors ? ', and use the brand colours below instead of its colours' : ''
      return `${name} is an example ${slide} in this design style: follow its layout: where the text sits, text size and hierarchy, panels, cards and graphic elements, framing and composition. It belongs to another brand: do not copy its words, logo, brand name, people or products${colours}.`
    }
    case 'product':
      return `${name} shows the exact product${image.note ? ` "${image.note}"` : ''}: preserve its shape, colour, packaging, label and visible branding exactly. Place this product naturally in the requested scene; do not redesign or replace it.`
    case 'sibling':
      return `${name} is another inner content slide of this carousel: keep its layout, text placement, colours, typography and lighting, with this slide's own scene and text.`
    case 'reference': {
      const note = image.note ? ` The owner's note about it: "${image.note}".` : ''
      if (image.label && image.label !== 'single') {
        return `${name} is ${REFERENCE_SLIDES[image.label]} of the owner's reference carousel: copy its layout for this slide: where text sits, text size and hierarchy, graphic elements, framing and composition. Do not copy its words, people or products.${note}`
      }
      if (givesLayout(image, context.role)) {
        return `${name} is a design reference: follow its style, composition and mood, not its content.${note}`
      }
      return `${name} is a general style reference: take its colours, type feel and mood, but use this slide’s own layout for its role. Do not copy its words, people or products.${note}`
    }
    case 'logo':
      return `${name} is the brand logo: place it small and unaltered in one corner.`
  }
}

function describeBrandVisual(brand: BrandVisual, styled: boolean): string[] {
  const lines: string[] = []
  if (brand.name) lines.push(`Brand: ${brand.name}${brand.category ? ` (${brand.category})` : ''}.`)
  if (brand.visualStyle) {
    lines.push(
      styled
        ? `Visual style of the owner's past posts (take its mood and imagery; the design style above decides the typography): ${brand.visualStyle}`
        : `Visual style: ${brand.visualStyle}`,
    )
  }
  if (brand.colors.length > 0) {
    const colors = brand.colors.map((color) => `${ROLE_NAMES[color.role]} ${color.hex}`).join(', ')
    lines.push(`Brand colours: ${colors}. Use them for backgrounds, graphic elements and text.`)
  }
  const fonts = [brand.headingFont && `headings ${brand.headingFont}`, brand.bodyFont && `body ${brand.bodyFont}`].filter(Boolean)
  if (fonts.length > 0) lines.push(`Brand fonts: ${fonts.join(', ')}.`)
  return lines
}

/**
 * What every image with text keeps to, whatever the brand: the model otherwise squeezes fonts, adds drop shadows
 * and outlines, and colours words in ways that look dated.
 */
export const TYPOGRAPHY_RULES = [
  'Typography: crisp, modern and professional, like a well-designed, current Instagram post by a professional designer.',
  'Draw the fonts at their normal proportions: never condensed, compressed, squashed, stretched or distorted letters.',
  'Flat text only: no drop shadows, outlines, strokes, glows, bevels, 3D effects or gradient fills on letters.',
  'Strong contrast: dark text on light areas or light text on dark areas; set text on a plain area or a solid panel, never directly over a busy part of a photo.',
  'At most two font weights and one accent colour for text; no rainbow, neon or multi-coloured words.',
  'Clear hierarchy with generous line spacing, and at least 8% margin from every edge.',
].join(' ')

/**
 * Every layout keeps to these, whatever the reference or style: text in a column beside a photo got cut off in the
 * feed, and photos ran off the edges.
 */
export const LAYOUT_RULES = [
  'Layout: stack the text and the imagery in full-width horizontal bands, one above the other; never set the text in a column beside a photo, card or object, even when an input image does.',
  'Keep every photo, card, panel and text block fully inside the frame with clear margins: nothing cut off at the edges, except a background photo that fills the whole frame.',
].join(' ')

/** The image model otherwise shortens text to fit the space a big photo leaves. */
const TEXT_IN_FULL =
  'Every word of the text must appear in full and spelled exactly as given: never abbreviate, shorten, paraphrase or leave out words. Give the text the room it needs; when space is tight, make the photo or graphic smaller, never the text.'

const TEXT_LEADS =
  'On this inner slide the text is the main element and takes the larger share of the slide; any photo or product is smaller and supports it.'

const MODERN_LOOK =
  'Overall: contemporary and uncluttered; no clip-art, stock-template look, lens flares, glossy effects, heavy vignettes or busy borders.'

const MIX_LINE =
  'The reference decides the layout and composition; the design style below decides the fonts, text treatment, graphic elements and overall feel. Where they conflict, keep the reference’s layout and the style’s typography.'

/** Role layouts when the owner's own visual style leads and no reference was sent for the role. */
const PLAIN_LAYOUTS: Record<LayoutRole, string> = {
  cover: 'Cover layout: the hook as a large headline in the upper part, one clear focal image or graphic below it, plenty of breathing room.',
  isi: 'Inner slide layout: a small slide number, a short subheading and the remaining lines as calm body text in a clear column; smaller type than a cover, no big hero title.',
  cta: 'CTA layout: one short line and the action as a simple button or pill shape, the brand handle small at the bottom.',
  single: 'Layout: one clear focal point with the text in a calm area and generous margins.',
}

/**
 * The image prompt, in English because image models follow it best. The headline goes in quotes so the model writes
 * exactly that; without one the model is told to write nothing, since otherwise it adds words of its own.
 *
 * A carousel's slides share one design system (style, fonts, colours, motifs) but each role has its own layout:
 * from the owner's reference for that role or the style's example when one was sent, else from the design style's
 * recipe for the role. The cover is never sent to the other slides, so they don't copy it.
 */
export function buildImagePrompt(
  input: Pick<ImageInput, 'scene' | 'headline' | 'format' | 'slide'>,
  brand: BrandVisual | null,
  images: PromptImage[],
): string {
  const lines = [`An Instagram post image, ${IMAGE_FORMATS[input.format].aspect}.`]
  const carousel = input.slide !== null && input.slide.count > 1
  if (input.slide && carousel) {
    lines.push(
      `It is slide ${input.slide.index} of ${input.slide.count} of one carousel. All slides share one design system: the same background treatment, margins, fonts, text colours and graphic motifs, so they read as one set when swiped. The cover, the inner slides and the closing slide each have their own layout for their role.`,
    )
  }
  const role = carousel ? (input.slide?.role ?? null) : null
  if (role) lines.push(ROLE_LINES[role])
  if (role && role !== 'cover') lines.push(NOT_COVER)
  lines.push(`Scene: ${input.scene}`)
  const context: ImageContext = { role, colors: (brand?.colors.length ?? 0) > 0 }
  lines.push(...images.map((image, index) => describeInputImage(image, index, context)))

  const style = styleForBrand(brand)
  const reference = images.some((image) => givesLayout(image, role))
  // A slide being edited keeps its own layout, an example shows one, and a later inner slide follows its sibling's;
  // the recipe would only compete.
  const ownLayout =
    reference || images.some((image) => image.kind === 'current' || image.kind === 'example' || image.kind === 'sibling')
  const layoutRole: LayoutRole = role ?? 'single'
  if (style) {
    if (reference) lines.push(MIX_LINE)
    lines.push(`Design style: ${style.label}. ${style.look}`)
    if (!ownLayout) lines.push(style.layouts[layoutRole])
  } else if (!ownLayout) {
    lines.push(PLAIN_LAYOUTS[layoutRole])
  }
  lines.push(LAYOUT_RULES)

  const headingFont = brand?.headingFont || style?.headingFont || DEFAULT_HEADING_FONT
  const bodyFont = brand?.bodyFont || style?.bodyFont || DEFAULT_BODY_FONT
  if (input.headline) {
    const multiline = input.headline.includes('\n')
    const breaks = multiline ? ' Keep its line breaks; the first line is the headline.' : ''
    const fonts = multiline
      ? ` Set the first line in ${headingFont} bold and the other lines in ${bodyFont} regular, clearly smaller (or close matches).`
      : ` Set it in ${headingFont} bold, or a close match.`
    lines.push(
      `Text: render exactly this text and no other words: "${input.headline}".${breaks} Make it large, legible and fully inside the frame.${fonts}`,
    )
    lines.push(TEXT_IN_FULL)
    if (role === 'isi') lines.push(TEXT_LEADS)
    lines.push(TYPOGRAPHY_RULES)
  } else {
    const logo = images.some((image) => image.kind === 'logo')
    lines.push(`Text: none. No words, letters, numbers, captions or watermarks${logo ? ' other than the logo' : ', and no logos'}.`)
  }
  lines.push(MODERN_LOOK)
  if (brand) lines.push(...describeBrandVisual(brand, style !== null))
  return lines.join('\n')
}

const SKIPPED_LABELS: Record<InputImageKind, string> = {
  current: 'gambar slide ini',
  attachment: 'lampiran',
  product: 'gambar produk',
  reference: 'referensi',
  example: 'template desain',
  sibling: 'slide isi lain',
  logo: 'logo',
}

interface PackedImages {
  images: string[]
  described: PromptImage[]
  /** Owner-facing reasons, e.g. "logo (belum ada)". */
  skipped: string[]
}

/**
 * Input images in priority order: current slide, the owner's attachment, product identity, design reference or style
 * example, sibling inner slide, logo. They are packed only while they fit the 1 MB request limit in front of 9Router.
 */
async function packImages(userId: string, input: ImageInput): Promise<PackedImages> {
  const packed: PackedImages = { images: [], described: [], skipped: [] }
  const { currentImage, attachment, siblingImage, referenceImageId, example, productGroupId } = input
  const candidates: {
    kind: InputImageKind
    load: () => Promise<{ dataUrl: string; note?: string; label?: ReferenceLabel } | null>
  }[] = []
  if (currentImage) candidates.push({ kind: 'current', load: async () => ({ dataUrl: currentImage }) })
  if (attachment) {
    candidates.push({
      kind: 'attachment',
      load: async () => {
        const dataUrl = 'dataUrl' in attachment ? attachment.dataUrl : await loadAttachment(userId, attachment.path)
        return dataUrl ? { dataUrl, note: attachment.note } : null
      },
    })
  }
  if (productGroupId) {
    const products = await loadProductImages(userId, productGroupId)
    for (const product of products) {
      candidates.push({ kind: 'product', load: async () => ({ dataUrl: product.dataUrl, note: product.title }) })
    }
    if (products.length === 0) packed.skipped.push('gambar produk (tidak ditemukan)')
  }
  if (referenceImageId) candidates.push({ kind: 'reference', load: () => loadReferenceImage(userId, referenceImageId) })
  if (example) {
    candidates.push({
      kind: 'example',
      load: async () => {
        const dataUrl = await loadTemplateImage(example)
        return dataUrl ? { dataUrl } : null
      },
    })
  }
  if (siblingImage) candidates.push({ kind: 'sibling', load: async () => ({ dataUrl: siblingImage }) })
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
  const followsDesign = () => packed.described.some((image) => image.kind === 'reference' || image.kind === 'example')
  for (const candidate of candidates) {
    // A slide with a reference or example of its own follows that, never another slide the AI made.
    if (candidate.kind === 'sibling' && followsDesign()) continue
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
    packed.described.push({ kind: candidate.kind, note: loaded.note, label: loaded.label })
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
export async function drawImage(userId: string, input: ImageInput, signal?: AbortSignal): Promise<DrawnImage> {
  signal?.throwIfAborted()
  const [brand, packed] = await Promise.all([orNull(() => getBrandVisual(userId), 'brand kit'), packImages(userId, input)])
  const prompt = buildImagePrompt(input, brand, packed.described)
  signal?.throwIfAborted()
  const b64 = await generateImage({ prompt, size: IMAGE_FORMATS[input.format].size, images: packed.images }, undefined, signal)
  return {
    bytes: new Uint8Array(Buffer.from(b64, 'base64')),
    prompt,
    sent: packed.described.map((image) => image.kind),
    skipped: packed.skipped,
  }
}

/** What the log keeps of an image: its prompt and size, and which input images went along or were left out. */
export const imageLog = (image: DrawnImage) => ({
  bytes: image.bytes.length,
  prompt: image.prompt,
  sent: image.sent,
  skipped: image.skipped,
})

/** Owner-facing text for anything an image request throws. */
export function imageErrorMessage(error: unknown): string {
  if (error instanceof SlideImageError) return 'Gambar dari layanan AI tidak bisa dibaca. Coba lagi.'
  if (error instanceof RouterApiError) {
    const detail = snippetOf(error.message)
    if (error.status === 200) return `Gambar gagal dibuat: ${detail}`
    if (error.status === 400 || error.status === 404) {
      return `9Router menolak permintaan gambar: ${detail} Periksa model gambar di Admin › Pengaturan.`
    }
  }
  return aiErrorMessage(error)
}
