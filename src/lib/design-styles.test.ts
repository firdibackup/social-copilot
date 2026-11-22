import { describe, expect, it } from 'vitest'
import { DESIGN_STYLE_IDS, DESIGN_STYLES, inferDesignStyle, STYLE_FALLBACKS, styleChain, styleForBrand, styleIdForBrand, templateStyleForBrand, type DesignStyle } from './design-styles'

const STYLES: DesignStyle[] = Object.values(DESIGN_STYLES)

describe('style recipes', () => {
  it('never lays text out beside a photo in a recipe', () => {
    for (const style of STYLES) {
      for (const layout of Object.values(style.layouts)) {
        expect(layout).not.toMatch(/beside|left half|right half|on the right|one side|two-column|in one column/i)
      }
    }
  })

  it('shows one distinct cover example for every style', () => {
    const images = STYLES.map((style) => style.sample.image)
    expect(STYLES.every((style) => style.sample.label && style.sample.title && style.sample.copy)).toBe(true)
    expect(images).toHaveLength(8)
    expect(new Set(images).size).toBe(8)
    expect(images.every((image) => image.endsWith('-cover.webp'))).toBe(true)
  })
})

describe('styleForBrand', () => {
  it('takes the chosen style, else Minimalis when the owner has no visual style of their own, else none', () => {
    expect(styleForBrand({ designStyle: 'tech', visualStyle: 'Foto hangat' })).toBe(DESIGN_STYLES.tech)
    expect(styleForBrand(null)).toBe(DESIGN_STYLES.minimalis)
    expect(styleForBrand({ designStyle: '', visualStyle: '' })).toBe(DESIGN_STYLES.minimalis)
    expect(styleForBrand({ designStyle: 'hilang', visualStyle: 'Foto hangat' })).toBeNull()
    expect(styleIdForBrand({ designStyle: 'tech', visualStyle: '' })).toBe('tech')
    expect(styleIdForBrand(null)).toBe('minimalis')
    expect(styleIdForBrand({ designStyle: 'toString', visualStyle: 'Foto hangat' })).toBeNull()
  })
})

describe('style fallbacks and the guessed style', () => {
  it('gives every style a chain of other, known styles that starts with itself', () => {
    for (const id of DESIGN_STYLE_IDS) {
      const chain = styleChain(id)
      expect(chain[0]).toBe(id)
      expect(new Set(chain).size).toBe(chain.length)
      expect(STYLE_FALLBACKS[id].length).toBeGreaterThan(0)
    }
    expect(styleChain('elegan')).toEqual(['elegan', 'editorial', 'minimalis', 'profesional'])
  })

  it('guesses from the category first, then the description, then the visual style', () => {
    expect(inferDesignStyle({ category: 'Perumahan tapak modern', description: 'Japanese Tropical untuk keluarga dan anak' })).toBe('profesional')
    expect(inferDesignStyle({ category: 'Edukasi teknik sipil' })).toBe('profesional')
    expect(inferDesignStyle({ category: 'playground', description: 'Playground anak di Mega Bekasi' })).toBe('ceria')
    expect(inferDesignStyle({ category: 'Fitness dan gaya hidup pria' })).toBe('bold')
    expect(inferDesignStyle({ category: 'Startup aplikasi kasir' })).toBe('tech')
    expect(inferDesignStyle({ category: 'Toko online', description: 'Skincare lokal untuk kulit berminyak' })).toBe('elegan')
    expect(inferDesignStyle({ category: 'Usaha', visualStyle: 'Nuansa organik, warna tanah' })).toBe('natural')
  })

  it('gives education and anything unmatched Minimalis, matching whole words only', () => {
    expect(inferDesignStyle({ category: 'Belajar bahasa Inggris', description: 'Kesalahan grammar sehari-hari' })).toBe('minimalis')
    expect(inferDesignStyle(null)).toBe('minimalis')
    // "said" contains "ai" but is not the word
    expect(inferDesignStyle({ category: 'Kursus', description: 'what she said' })).toBe('minimalis')
  })

  it('lets the owner’s chosen style win and never needs the kit to guess it', () => {
    expect(templateStyleForBrand({ designStyle: 'elegan', category: 'Perumahan' })).toBe('elegan')
    expect(templateStyleForBrand({ designStyle: 'hilang', category: 'Perumahan' })).toBe('profesional')
    expect(styleIdForBrand({ designStyle: '', visualStyle: '', category: 'Perumahan tapak modern' })).toBe('profesional')
    expect(styleIdForBrand({ designStyle: '', visualStyle: 'Foto dokumentatif', category: 'Perumahan' })).toBeNull()
  })
})
