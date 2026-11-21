/**
 * Gradient fills for shapes, paths and text, shared by the layer canvas, the design renderer (via migrateLayerDoc)
 * and the editor's swatches. Pure: no DOM; the canvas helper only calls the two gradient factories it is given.
 *
 * Angles follow CSS `linear-gradient`: 0° paints towards the top, 90° towards the right, 180° towards the bottom, and
 * the gradient line spans the box exactly like CSS (its length is |w·sin a| + |h·cos a|). Radial gradients are a
 * circle from the box centre to its farthest corner (CSS `circle farthest-corner`); `angle` is ignored for them.
 */

export type GradientKind = 'linear' | 'radial'

export interface GradientStop {
  /** 0..1 along the gradient line; stops are in non-decreasing order. */
  offset: number
  /** '#RRGGBB'. */
  color: string
  /** 0 (transparent) .. 1 (opaque). */
  alpha: number
}

export interface Gradient {
  kind: GradientKind
  /** Degrees, CSS convention (0 = towards the top). Linear only; kept but unused for radial. */
  angle: number
  /** 2–10 stops. */
  stops: GradientStop[]
}

export const GRADIENT_LIMITS = { stops: { min: 2, max: 10 }, angle: { min: -360, max: 360 } } as const

const HEX = /^#[0-9a-fA-F]{6}$/
type Json = Record<string, unknown>
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value)
const finite = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
const GRADIENT_KEYS: ReadonlySet<string> = new Set(['kind', 'angle', 'stops'])
const STOP_KEYS: ReadonlySet<string> = new Set(['offset', 'color', 'alpha'])
const onlyKeys = (value: Json, keys: ReadonlySet<string>) => Object.keys(value).every((key) => keys.has(key))

/** A gradient from the browser or the database, checked field by field (unknown keys refused); a fresh copy, or null. */
export function parseGradient(value: unknown): Gradient | null {
  if (!isObject(value) || !onlyKeys(value, GRADIENT_KEYS)) return null
  if (value.kind !== 'linear' && value.kind !== 'radial') return null
  if (!finite(value.angle, GRADIENT_LIMITS.angle.min, GRADIENT_LIMITS.angle.max)) return null
  const { stops } = value
  if (!Array.isArray(stops) || stops.length < GRADIENT_LIMITS.stops.min || stops.length > GRADIENT_LIMITS.stops.max) return null
  const parsed: GradientStop[] = []
  let last = 0
  for (const stop of stops) {
    if (!isObject(stop) || !onlyKeys(stop, STOP_KEYS)) return null
    if (!finite(stop.offset, last, 1) || !finite(stop.alpha, 0, 1)) return null
    if (typeof stop.color !== 'string' || !HEX.test(stop.color)) return null
    last = stop.offset
    parsed.push({ offset: stop.offset, color: stop.color.toUpperCase(), alpha: stop.alpha })
  }
  return { kind: value.kind, angle: value.angle, stops: parsed }
}

export const isGradient = (value: unknown): value is Gradient => parseGradient(value) !== null

/** `rgba(r,g,b,a)` of a stop. */
export function stopCss(stop: Pick<GradientStop, 'color' | 'alpha'>): string {
  const channel = (index: number) => parseInt(stop.color.slice(index, index + 2), 16)
  return `rgba(${channel(1)},${channel(3)},${channel(5)},${stop.alpha})`
}

export interface GradientBox { x: number; y: number; w: number; h: number }

export type GradientGeometry =
  | { kind: 'linear'; x0: number; y0: number; x1: number; y1: number }
  | { kind: 'radial'; cx: number; cy: number; r: number }

/** Where the gradient runs over `box` (canvas px), as CSS lays it out. */
export function gradientGeometry(gradient: Pick<Gradient, 'kind' | 'angle'>, box: GradientBox): GradientGeometry {
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  if (gradient.kind === 'radial') return { kind: 'radial', cx, cy, r: Math.hypot(box.w, box.h) / 2 }
  const angle = gradient.angle * Math.PI / 180
  const dirX = Math.sin(angle)
  const dirY = -Math.cos(angle)
  const half = (Math.abs(box.w * dirX) + Math.abs(box.h * dirY)) / 2
  return { kind: 'linear', x0: cx - dirX * half, y0: cy - dirY * half, x1: cx + dirX * half, y1: cy + dirY * half }
}

/** The part of CanvasRenderingContext2D a gradient needs. */
export interface GradientContext {
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): CanvasGradient
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): CanvasGradient
}

/** A CanvasGradient painting `gradient` across `box` (canvas px), for fillStyle. */
export function gradientStyle(ctx: GradientContext, gradient: Gradient, box: GradientBox): CanvasGradient {
  const geometry = gradientGeometry(gradient, box)
  const style = geometry.kind === 'radial'
    ? ctx.createRadialGradient(geometry.cx, geometry.cy, 0, geometry.cx, geometry.cy, geometry.r)
    : ctx.createLinearGradient(geometry.x0, geometry.y0, geometry.x1, geometry.y1)
  for (const stop of gradient.stops) style.addColorStop(stop.offset, stopCss(stop))
  return style
}

const percent = (offset: number) => `${Math.round(offset * 10000) / 100}%`

/** The CSS `background-image` of a gradient, for swatches and previews; matches gradientStyle. */
export function gradientCss(gradient: Gradient): string {
  const stops = gradient.stops.map((stop) => `${stopCss(stop)} ${percent(stop.offset)}`).join(', ')
  return gradient.kind === 'radial'
    ? `radial-gradient(circle farthest-corner at 50% 50%, ${stops})`
    : `linear-gradient(${gradient.angle}deg, ${stops})`
}

/**
 * The design-doc Paint angle of a CSS-convention angle: design-canvas measures from the +x axis (0 = towards the
 * right, 90 = towards the bottom), so it is the CSS angle less 90°, in 0..360.
 */
export const designGradientAngle = (angle: number): number => (((angle - 90) % 360) + 360) % 360

/** A copy of a gradient (presets stay untouched when a layer's copy is edited). */
export const copyGradient = (gradient: Gradient): Gradient =>
  ({ kind: gradient.kind, angle: gradient.angle, stops: gradient.stops.map((stop) => ({ ...stop })) })

// ---------- Presets ----------

export interface GradientPreset {
  /** Stable id; the UI translates it into a label. */
  id: string
  gradient: Gradient
}

/** Evenly spaced opaque-by-default stops: '#RRGGBB' or '#RRGGBB/alpha'. */
function preset(id: string, angle: number, colors: string[], kind: GradientKind = 'linear'): GradientPreset {
  return { id, gradient: { kind, angle, stops: colors.map((value, index) => {
    const [color, alpha = '1'] = value.split('/')
    return { offset: index / (colors.length - 1), color, alpha: Number(alpha) }
  }) } }
}

/** Stops at explicit offsets: [offset, '#RRGGBB', alpha]. */
function stepped(id: string, angle: number, stops: [number, string, number][], kind: GradientKind = 'linear'): GradientPreset {
  return { id, gradient: { kind, angle, stops: stops.map(([offset, color, alpha]) => ({ offset, color, alpha })) } }
}

/** Fills for shapes, paths and text. */
export const GRADIENT_PRESETS: readonly GradientPreset[] = [
  // Brand-like duotones
  preset('brand', 135, ['#6558F5', '#4F7BFF']),
  preset('aurora', 135, ['#6558F5', '#38C6E6', '#7EE3B8']),
  preset('grape', 135, ['#7F00FF', '#E100FF']),
  preset('ocean', 135, ['#2193B0', '#6DD5ED']),
  preset('emerald', 135, ['#11998E', '#38EF7D']),
  preset('royal', 180, ['#141E30', '#243B55']),
  // Sunsets
  preset('sunset', 135, ['#FF512F', '#F09819']),
  preset('sunsetPink', 135, ['#FF5F6D', '#FFC371']),
  preset('dusk', 180, ['#2C3E50', '#FD746C']),
  preset('peach', 135, ['#ED4264', '#FFEDBC']),
  preset('mango', 90, ['#F7971E', '#FFD200']),
  preset('instagram', 45, ['#FEDA75', '#FA7E1E', '#D62976', '#962FBF', '#4F5BD5']),
  // Pastels
  preset('cottonCandy', 135, ['#FBC2EB', '#A6C1EE']),
  preset('mint', 135, ['#D4FC79', '#96E6A1']),
  preset('lavender', 135, ['#E0C3FC', '#8EC5FC']),
  preset('blush', 180, ['#FFDDE1', '#EE9CA7']),
  // Neon
  preset('neonPink', 135, ['#FF00CC', '#333399']),
  preset('cyber', 90, ['#00F5A0', '#00D9F5']),
  preset('electric', 90, ['#4776E6', '#8E54E9']),
  preset('glow', 0, ['#8E7CFF', '#2A1F7A'], 'radial'),
  // Mono fades
  preset('charcoal', 180, ['#434343', '#000000']),
  preset('silver', 180, ['#FFFFFF', '#D7D2CC']),
  // Transparent fades
  preset('fadeBlackBottom', 180, ['#000000/0', '#000000/0.85']),
  preset('fadeBlackTop', 180, ['#000000/0.85', '#000000/0']),
  preset('fadeWhiteBottom', 180, ['#FFFFFF/0', '#FFFFFF/0.9']),
  preset('fadeWhiteTop', 180, ['#FFFFFF/0.9', '#FFFFFF/0']),
  preset('fadeBrand', 180, ['#6558F5/0', '#6558F5/0.9']),
]

/** See-through gradients laid over the whole slide (newOverlayLayer) to lift text off a photo. */
export const OVERLAY_PRESETS: readonly GradientPreset[] = [
  stepped('shadeBottom', 180, [[0, '#000000', 0], [0.45, '#000000', 0], [1, '#000000', 0.75]]),
  stepped('shadeTop', 0, [[0, '#000000', 0], [0.55, '#000000', 0], [1, '#000000', 0.7]]),
  stepped('shadeLeft', 270, [[0, '#000000', 0], [0.5, '#000000', 0], [1, '#000000', 0.7]]),
  stepped('vignette', 0, [[0, '#000000', 0], [0.6, '#000000', 0], [1, '#000000', 0.65]], 'radial'),
  preset('dim', 180, ['#000000/0.4', '#000000/0.4']),
  stepped('lightTop', 180, [[0, '#FFFFFF', 0.85], [0.5, '#FFFFFF', 0]]),
  preset('brandTint', 135, ['#6558F5/0.55', '#38C6E6/0.35']),
  preset('warmTint', 135, ['#FF5F6D/0.45', '#FFC371/0.25']),
  stepped('nightBottom', 180, [[0, '#241C45', 0], [0.4, '#241C45', 0.2], [1, '#241C45', 0.9]]),
]

const PRESETS = new Map([...GRADIENT_PRESETS, ...OVERLAY_PRESETS].map((item) => [item.id, item]))

/** A fill or overlay preset by id. */
export const gradientPreset = (id: string): GradientPreset | undefined => PRESETS.get(id)
