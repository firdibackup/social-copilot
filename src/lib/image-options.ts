/** Choices and limits of Gambar AI, shared by the generator and the server. */

export const IMAGE_FORMATS = {
  '4:5': { label: 'Portrait 4:5', size: '1088x1360', aspect: '4:5 portrait' },
  '1:1': { label: 'Persegi 1:1', size: '1024x1024', aspect: '1:1 square' },
  '1.91:1': { label: 'Landscape 1.91:1', size: '1536x800', aspect: '1.91:1 landscape' },
} as const

export type ImageFormat = keyof typeof IMAGE_FORMATS

export const MAX_SLIDES = 10
export const SCENE_MAX_LENGTH = 1000
export const HEADLINE_MAX_LENGTH = 150
/** The planner reads a topic or a whole caption. */
export const CONTENT_MAX_LENGTH = 2200
/** A generated JPEG sent back as the slide 1 reference is a few hundred KB; this leaves room and stops abuse. */
export const PREVIOUS_IMAGE_MAX_LENGTH = 1_500_000

export interface Slide {
  /** Written into the image exactly; empty means no text at all. */
  headline: string
  /** What the image shows, in the owner's words. */
  scene: string
}

export interface ImageInput extends Slide {
  format: ImageFormat
  /** A brand reference whose style to follow. */
  referenceId: string | null
  includeLogo: boolean
  /** Slide 1 as a data URL, so later slides keep its look. */
  previousImage: string | null
  /** Position in a carousel, when there is one. */
  slide: { index: number; count: number } | null
}

export type GenerateResult = { image: string; skipped: string[] } | { error: string }
/** `warning` when the credits left can't pay for every slide's image. */
export type PlanResult = { slides: Slide[]; warning?: string } | { error: string }

/** What the generator needs from the brand kit to offer references. */
export interface GeneratorOptions {
  references: { id: string; url: string; label: string }[]
  hasLogo: boolean
  brandName: string
}
