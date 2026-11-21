/** The fill control's pure steps on a gradient: its stops kept ordered, 2–10 of them. */
import { copyGradient, GRADIENT_LIMITS, type Gradient, type GradientStop } from '@/lib/gradients'

const round = (value: number, places = 4) => Math.round(value * 10 ** places) / 10 ** places
const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

const channels = (color: string) => [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16))
const hex = (values: number[]) => `#${values.map((value) => Math.round(value).toString(16).padStart(2, '0')).join('')}`.toUpperCase()

/** The colour and transparency at `offset` along the stops, as the canvas blends them. */
export function sampleGradient(gradient: Gradient, offset: number): Omit<GradientStop, 'offset'> {
  const { stops } = gradient
  const after = stops.findIndex((stop) => stop.offset >= offset)
  if (after <= 0) return { color: stops[after === 0 ? 0 : stops.length - 1].color, alpha: stops[after === 0 ? 0 : stops.length - 1].alpha }
  const a = stops[after - 1]
  const b = stops[after]
  const t = b.offset === a.offset ? 0 : (offset - a.offset) / (b.offset - a.offset)
  const [ca, cb] = [channels(a.color), channels(b.color)]
  return { color: hex(ca.map((value, index) => value + (cb[index] - value) * t)), alpha: round(a.alpha + (b.alpha - a.alpha) * t, 2) }
}

/** Stops sorted by offset; `focus` (an index before sorting) tells where that stop went. */
function ordered(gradient: Gradient, stops: GradientStop[], focus: number): { gradient: Gradient; index: number } {
  const tagged = stops.map((stop, index) => ({ stop, index }))
  tagged.sort((a, b) => a.stop.offset - b.stop.offset || a.index - b.index)
  return { gradient: { ...gradient, stops: tagged.map((item) => item.stop) }, index: tagged.findIndex((item) => item.index === focus) }
}

/** One stop changed (colour, transparency or offset); the stops re-sorted, the edited stop's new index returned. */
export function updateStop(gradient: Gradient, index: number, change: Partial<GradientStop>): { gradient: Gradient; index: number } {
  const stops = gradient.stops.map((stop) => ({ ...stop }))
  if (!stops[index]) return { gradient, index }
  const next = { ...stops[index], ...change }
  stops[index] = { ...next, offset: round(clamp01(next.offset)), alpha: round(clamp01(next.alpha), 2), color: next.color.toUpperCase() }
  return ordered(gradient, stops, index)
}

/**
 * A new stop in the middle of the widest gap, coloured as the gradient already is there (so nothing changes until it
 * is edited). The same gradient at the limit.
 */
export function addStop(gradient: Gradient, at?: number): { gradient: Gradient; index: number } {
  const { stops } = gradient
  if (stops.length >= GRADIENT_LIMITS.stops.max) return { gradient, index: -1 }
  if (at === undefined) {
    let gap = 0
    at = 0
    const edges = [0, ...stops.map((stop) => stop.offset), 1]
    for (let index = 1; index < edges.length; index++) {
      if (edges[index] - edges[index - 1] > gap) {
        gap = edges[index] - edges[index - 1]
        at = (edges[index] + edges[index - 1]) / 2
      }
    }
  }
  const offset = round(clamp01(at))
  const stop = { offset, ...sampleGradient(gradient, offset) }
  const copy = [...stops.map((item) => ({ ...item })), stop]
  return ordered(gradient, copy, copy.length - 1)
}

/** One stop fewer, never under two. */
export function removeStop(gradient: Gradient, index: number): Gradient {
  if (gradient.stops.length <= GRADIENT_LIMITS.stops.min || !gradient.stops[index]) return gradient
  return { ...gradient, stops: gradient.stops.filter((_, at) => at !== index).map((stop) => ({ ...stop })) }
}

/** The angle kept within 0..359 whole degrees. */
export const normalAngle = (angle: number) => ((Math.round(angle) % 360) + 360) % 360

/** A two-stop gradient from a single colour to transparent: the start when "Gradien" is picked on a plain fill. */
export const gradientFrom = (color: string): Gradient =>
  copyGradient({ kind: 'linear', angle: 180, stops: [{ offset: 0, color: color.toUpperCase(), alpha: 1 }, { offset: 1, color: color.toUpperCase(), alpha: 0 }] })
