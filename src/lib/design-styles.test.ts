import { describe, expect, it } from 'vitest'
import { DESIGN_STYLES, styleForBrand, styleIdForBrand, type DesignStyle } from './design-styles'

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
