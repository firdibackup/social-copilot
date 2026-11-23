/**
 * Where and how large the brand logo sits on a slide (Brand › Logo). The logo is stamped in code after the image is
 * made, the same on every slide; the image model never draws it. Shared by the brand form and the server.
 */
export const LOGO_POSITIONS = ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'] as const
export const LOGO_SIZES = ['small', 'medium', 'large'] as const
export type LogoPosition = (typeof LOGO_POSITIONS)[number]
export type LogoSize = (typeof LOGO_SIZES)[number]

export interface LogoPlacement {
  position: LogoPosition
  size: LogoSize
}

/** Bottom right: clear of the "1/5" counter Instagram shows over a carousel's top right corner. */
export const DEFAULT_LOGO_PLACEMENT: LogoPlacement = { position: 'bottom-right', size: 'medium' }

export const isLogoPosition = (value: unknown): value is LogoPosition =>
  typeof value === 'string' && (LOGO_POSITIONS as readonly string[]).includes(value)
export const isLogoSize = (value: unknown): value is LogoSize =>
  typeof value === 'string' && (LOGO_SIZES as readonly string[]).includes(value)

/** What the database or a form holds, with the default for anything else. */
export function readLogoPlacement(position: unknown, size: unknown): LogoPlacement {
  return {
    position: isLogoPosition(position) ? position : DEFAULT_LOGO_PLACEMENT.position,
    size: isLogoSize(size) ? size : DEFAULT_LOGO_PLACEMENT.size,
  }
}

/** The logo's share of the slide's width, for a square logo. */
const SIZE_SHARE: Record<LogoSize, number> = { small: 0.07, medium: 0.1, large: 0.14 }
/** The gap to the slide's edges, as a share of its width. */
const MARGIN_SHARE = 0.04
/** A wide wordmark may be this many times wider than a square logo, a tall mark this many times taller. */
const WIDE_STRETCH = 2.5
const TALL_STRETCH = 1.5

export interface Box {
  left: number
  top: number
  width: number
  height: number
}

/**
 * The logo's box on a slide, in pixels: the logo keeps its proportions, a square one is SIZE_SHARE of the slide's
 * width, and a wide or tall one gets more room along its long side so it reads as the same size.
 */
export function logoBox(slide: { width: number; height: number }, logo: { width: number; height: number }, placement: LogoPlacement): Box {
  const unit = slide.width * SIZE_SHARE[placement.size]
  const wide = logo.width > logo.height
  const scale = Math.min((unit * (wide ? WIDE_STRETCH : 1)) / logo.width, (unit * (wide ? 1 : TALL_STRETCH)) / logo.height)
  const width = Math.max(1, Math.round(logo.width * scale))
  const height = Math.max(1, Math.round(logo.height * scale))
  const margin = Math.round(slide.width * MARGIN_SHARE)
  const [vertical, horizontal] = placement.position.split('-')
  return {
    left: horizontal === 'left' ? margin : horizontal === 'right' ? slide.width - margin - width : Math.round((slide.width - width) / 2),
    top: vertical === 'top' ? margin : slide.height - margin - height,
    width,
    height,
  }
}

const AREA: Record<LogoPosition, string> = {
  'top-left': 'top left corner',
  'top-center': 'top edge, in the centre',
  'top-right': 'top right corner',
  'bottom-left': 'bottom left corner',
  'bottom-center': 'bottom edge, in the centre',
  'bottom-right': 'bottom right corner',
}

/** The line that keeps the image model out of the logo's place and from drawing a logo of its own. */
export function logoClearanceRule(placement: LogoPlacement): string {
  const share = Math.round(SIZE_SHARE[placement.size] * WIDE_STRETCH * 100) + Math.round(MARGIN_SHARE * 200)
  return `Logo: do not draw any logo, brand mark or watermark. Keep the ${AREA[placement.position]} calm and free of text, faces and important details (about ${share}% of the width and ${Math.round(share / 2)}% of the height): the brand logo is added there afterwards.`
}
