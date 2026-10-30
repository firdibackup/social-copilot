/** Choices and limits of AI slides, shared by the editor and the server. */
import type { SlideRole } from './brand-options'

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
/** Room for an inner slide's subheading and two or three complete sentences. */
export const HEADLINE_MAX_LENGTH = 300
/**
 * A single post (one image, no carousel) has no practical text limit: it can be a whole text-led design such as a
 * cheat sheet of 20 examples, with the owner's own visual spec as its scene. Matches the topic limit.
 */
export const SINGLE_HEADLINE_MAX_LENGTH = 5000
export const SINGLE_SCENE_MAX_LENGTH = 3000

/** The text limit of a post's image: a single post's is far larger than a carousel slide's. */
export const headlineLimit = (single: boolean) => (single ? SINGLE_HEADLINE_MAX_LENGTH : HEADLINE_MAX_LENGTH)
export const sceneLimit = (single: boolean) => (single ? SINGLE_SCENE_MAX_LENGTH : SCENE_MAX_LENGTH)

export interface Slide {
  /** Written into the image exactly; empty means no text at all. */
  headline: string
  /** What the image shows. */
  scene: string
}

/** An image the owner attached, with what it should do on this slide: sent with an edit, or stored for a new post. */
export type ImageAttachment = { note: string } & ({ dataUrl: string } | { path: string })

export interface ImageInput extends Slide {
  format: ImageFormat
  /** The one brand reference image this slide follows, chosen for its role when the post was made. */
  referenceImageId: string | null
  /**
   * The design template it follows when the account has no references: a design_templates id, or the source_key of
   * a file imported from assets/contoh-desain for a slide planned before the import.
   */
  example: string | null
  /** Product identity to preserve, separate from the design reference. */
  productGroupId: string | null
  includeLogo: boolean
  /**
   * Another inner slide as a data URL, so inner slides keep one look; sent only when the slide has no reference or
   * example image of its own. Never the cover.
   */
  siblingImage: string | null
  /** The slide's own image when the owner edits it: everything the edit doesn't ask for stays. */
  currentImage: string | null
  attachment: ImageAttachment | null
  /** Position in a carousel and the role the plan gave it, when there is one. */
  slide: { index: number; count: number; role: SlideRole | null } | null
}
