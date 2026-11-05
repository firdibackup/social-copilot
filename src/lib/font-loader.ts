/**
 * Runtime loading of catalogue fonts from fonts.googleapis.com. The curated fonts are self-hosted by next/font and
 * skipped here. Safe to import anywhere: every DOM touch is guarded, so on the server each call is a no-op.
 */
import { useEffect } from 'react'
import { isCuratedFont } from './design-styles'
import { cssFamily, googleFontOf, type GoogleFont } from './google-fonts'

const API = 'https://fonts.googleapis.com/css2'

/** One <link> per URL, so a font is only ever requested once. */
const links = new Map<string, Promise<void>>()
const loads = new Map<string, Promise<void>>()

/** The available weight closest to target; ties go to the heavier one. */
function nearest(weights: readonly number[], target: number): number {
  let best = weights[0] ?? 400
  for (const weight of weights) {
    const gap = Math.abs(weight - target)
    const bestGap = Math.abs(best - target)
    if (gap < bestGap || (gap === bestGap && weight > best)) best = weight
  }
  return best
}

const familyParam = (name: string) => encodeURIComponent(name).replace(/%20/g, '+')

function axis(font: GoogleFont, weights: readonly number[]): string {
  return font.italicOnly ? `ital,wght@${weights.map((weight) => `1,${weight}`).join(';')}` : `wght@${weights.join(';')}`
}

/** The css2 URL of a font at the given weights (each must exist, or the API answers 400). */
export function fontUrl(font: GoogleFont, weights: readonly number[], text?: string): string {
  const query = `family=${familyParam(font.name)}:${axis(font, weights)}${text ? `&text=${encodeURIComponent(text)}` : ''}`
  return `${API}?${query}&display=swap`
}

function inject(url: string): Promise<void> {
  const existing = links.get(url)
  if (existing) return existing
  const loaded = new Promise<void>((resolve) => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = url
    link.onload = () => resolve()
    link.onerror = () => resolve()
    document.head.appendChild(link)
  })
  links.set(url, loaded)
  return loaded
}

/** A catalogue font the browser should fetch, or undefined for curated, unknown or server-side. */
function runtimeFont(name: string): GoogleFont | undefined {
  if (typeof document === 'undefined' || isCuratedFont(name)) return undefined
  return googleFontOf(name)
}

/** Just the glyphs of the font's own name at its regular weight: cheap enough for every row of a list. */
export function loadFontPreview(name: string): void {
  const font = runtimeFont(name)
  if (font) void inject(fontUrl(font, [nearest(font.weights, 400)], name))
}

/** The regular and bold faces (nearest available), resolved once they can be drawn. Never rejects. */
export function loadFont(name: string): Promise<void> {
  const font = runtimeFont(name)
  if (!font) return Promise.resolve()
  const existing = loads.get(name)
  if (existing) return existing
  const regular = nearest(font.weights, 400)
  const bold = nearest(font.weights, 700)
  const weights = [...new Set([regular, bold])].sort((a, b) => a - b)
  const family = cssFamily(name)
  // Unstyled requests, as the canvas makes them; an italic-only family's italic face still matches.
  const loaded = inject(fontUrl(font, weights))
    .then(() => Promise.all([document.fonts.load(`400 32px ${family}`), document.fonts.load(`700 32px ${family}`)]))
    .then(
      () => undefined,
      () => undefined,
    )
  loads.set(name, loaded)
  return loaded
}

/** Loads a font for the component showing it. */
export function useFont(name: string | undefined): void {
  useEffect(() => {
    if (name) void loadFont(name)
  }, [name])
}
