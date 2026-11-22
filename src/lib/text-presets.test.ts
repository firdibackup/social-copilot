import { describe, expect, it } from 'vitest'
import { emptyDoc, LAYER_LIMITS, parseLayerDoc } from './layer-doc'
import { presetTextLayer, TEXT_PRESET_IDS, TEXT_PRESETS } from './text-presets'

const FONTS = { heading: 'Playfair Display', body: 'Inter' }
const COLORS = { ink: '#171827', accent: '#F05A28' }

describe('presetTextLayer', () => {
  it('sets a headline in the heading font and body text in the body font, sized to the canvas', () => {
    const doc = emptyDoc(1080, 1350)
    const headline = presetTextLayer(doc, 'headline', 'Judul', FONTS, COLORS)
    const body = presetTextLayer(doc, 'body', 'Isi', FONTS, COLORS)

    expect(headline).toMatchObject({ kind: 'text', font: 'Playfair Display', size: 92, weight: 800, color: '#171827', align: 'left' })
    expect(body).toMatchObject({ font: 'Inter', size: 37, weight: 400 })
    expect(presetTextLayer(emptyDoc(1440, 1800), 'headline', 'Judul', FONTS, COLORS).size).toBe(122)
  })

  it('uses the accent colour and letter case only where the style asks for them', () => {
    const doc = emptyDoc(1080, 1350)
    expect(presetTextLayer(doc, 'kicker', 'Tips', FONTS, COLORS)).toMatchObject({ color: '#F05A28', uppercase: true, letterSpacing: 0.14 })
    expect(presetTextLayer(doc, 'quote', 'Kutipan', FONTS, COLORS)).toMatchObject({ italic: true, align: 'center', color: '#171827' })
    expect(presetTextLayer(doc, 'headline', 'Judul', FONTS, COLORS)).not.toHaveProperty('uppercase')
  })

  it('centres the box on the canvas and makes it as tall as its lines', () => {
    const doc = emptyDoc(1080, 1350)
    const layer = presetTextLayer(doc, 'body', 'Baris satu\nBaris dua', FONTS, COLORS)

    expect(layer.h).toBe(Math.round(37 * 1.45 * 2))
    expect(layer.x).toBe(Math.round((1080 - layer.w) / 2))
    expect(layer.y).toBe(Math.round((1350 - layer.h) / 2))
  })

  it('gives every preset a layer the document accepts, inside the size limits', () => {
    for (const side of [LAYER_LIMITS.side.min, 1080, LAYER_LIMITS.side.max]) {
      const doc = emptyDoc(side, side)
      for (const id of TEXT_PRESET_IDS) {
        const layer = presetTextLayer(doc, id, 'Teks', FONTS, COLORS)
        expect(layer.size, id).toBeGreaterThanOrEqual(LAYER_LIMITS.size.min)
        expect(layer.size, id).toBeLessThanOrEqual(LAYER_LIMITS.size.max)
        expect(parseLayerDoc({ ...doc, layers: [layer] }), `${id} at ${side}`).not.toHaveProperty('error')
        expect(TEXT_PRESETS[id].width).toBeLessThanOrEqual(1)
      }
    }
  })
})
