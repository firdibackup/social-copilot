/**
 * Gaya teks: the editorial text styles the layer editor offers beside a plain text layer. Sizes are fractions of the
 * canvas width, so a preset looks the same on a 1080 and a 1440 px slide. Pure, shared by the editor and its tests.
 */
import type { FontName } from './design-styles'
import { LAYER_LIMITS, newTextLayer, type LayerDoc, type TextAlign, type TextLayer, type TextWeight } from './layer-doc'

export const TEXT_PRESET_IDS = ['headline', 'subheading', 'body', 'kicker', 'quote', 'number'] as const
export type TextPresetId = (typeof TEXT_PRESET_IDS)[number]

interface PresetStyle {
  /** Which of the brand's two fonts it is set in. */
  font: 'heading' | 'body'
  /** Font size as a fraction of the canvas width. */
  size: number
  weight: TextWeight
  lineHeight: number
  /** Box width as a fraction of the canvas width. */
  width: number
  align: TextAlign
  italic?: boolean
  uppercase?: boolean
  /** In em. */
  letterSpacing?: number
  /** Set in the brand's accent colour instead of the ink colour. */
  accent?: boolean
}

export const TEXT_PRESETS: Record<TextPresetId, PresetStyle> = {
  headline: { font: 'heading', size: 0.085, weight: 800, lineHeight: 1.1, width: 0.84, align: 'left' },
  subheading: { font: 'heading', size: 0.05, weight: 600, lineHeight: 1.25, width: 0.8, align: 'left' },
  body: { font: 'body', size: 0.034, weight: 400, lineHeight: 1.45, width: 0.76, align: 'left' },
  kicker: { font: 'body', size: 0.026, weight: 700, lineHeight: 1.2, width: 0.6, align: 'left', uppercase: true, letterSpacing: 0.14, accent: true },
  quote: { font: 'heading', size: 0.05, weight: 500, lineHeight: 1.3, width: 0.76, align: 'center', italic: true },
  number: { font: 'heading', size: 0.2, weight: 800, lineHeight: 1, width: 0.34, align: 'left', accent: true },
}

export interface PresetFonts { heading: FontName; body: FontName }
export interface PresetColors { ink: string; accent: string }

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/**
 * A new text layer in the preset's style, centred on the canvas. `text` may hold line breaks; the box is as tall as
 * its lines (the editor refits it once the font has loaded).
 */
export function presetTextLayer(doc: LayerDoc, id: TextPresetId, text: string, fonts: PresetFonts, colors: PresetColors): TextLayer {
  const style = TEXT_PRESETS[id]
  const base = newTextLayer(doc, text, fonts[style.font], style.accent ? colors.accent : colors.ink)
  const size = clamp(Math.round(doc.width * style.size), LAYER_LIMITS.size.min, LAYER_LIMITS.size.max)
  const w = Math.round(doc.width * style.width)
  const h = Math.round(size * style.lineHeight * text.split('\n').length)
  return {
    ...base,
    size, weight: style.weight, lineHeight: style.lineHeight, align: style.align,
    w, h, x: Math.round((doc.width - w) / 2), y: Math.round((doc.height - h) / 2),
    ...(style.italic ? { italic: true } : {}),
    ...(style.uppercase ? { uppercase: true } : {}),
    ...(style.letterSpacing ? { letterSpacing: style.letterSpacing } : {}),
  }
}
