/** Choices and limits of AI slides, shared by the editor and the server. */

/**
 * `size` is what 9Router is asked for; `width` × `height` is what gets stored and published, whatever size the
 * provider actually returns (src/lib/slide-image.ts crops to it). 1.91:1 is left out: its 1536 px would exceed
 * Instagram's 1440 px width for no use a carousel needs.
 */
export const IMAGE_FORMATS = {
  '4:5': { label: 'Portrait 4:5', size: '1088x1360', aspect: '4:5 portrait', width: 1080, height: 1350 },
  '1:1': { label: 'Persegi 1:1', size: '1024x1024', aspect: '1:1 square', width: 1080, height: 1080 },
} as const

export type ImageFormat = keyof typeof IMAGE_FORMATS

/** Own keys only: `'toString' in IMAGE_FORMATS` is true. */
export const isImageFormat = (value: unknown): value is ImageFormat =>
  typeof value === 'string' && Object.hasOwn(IMAGE_FORMATS, value)

export const MAX_SLIDES = 10
export const SCENE_MAX_LENGTH = 1000
export const HEADLINE_MAX_LENGTH = 150

export interface Slide {
  /** Written into the image exactly; empty means no text at all. */
  headline: string
  /** What the image shows. */
  scene: string
}

export interface ImageInput extends Slide {
  format: ImageFormat
  /** A brand reference whose style to follow. */
  referenceId: string | null
  includeLogo: boolean
  /** Slide 1 as a data URL, so later slides keep its look. */
  previousImage: string | null
  /** The slide's own image when the owner edits it: everything the edit doesn't ask for stays. */
  currentImage: string | null
  /** Position in a carousel, when there is one. */
  slide: { index: number; count: number } | null
}
