import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { pickFirst, type Picker } from './brand-options'
import { DESIGN_STYLES, isStyleExample, planStyleExamples, styleForBrand, type DesignStyle } from './design-styles'

const STYLES: DesignStyle[] = Object.values(DESIGN_STYLES)
const FILES = readdirSync(join(process.cwd(), 'assets', 'contoh-desain'))

describe('style examples', () => {
  it('has a file for every example key, and accepts only those keys', () => {
    const keys = STYLES.flatMap((style) => style.examples.flatMap((set) => Object.values(set)))

    expect(keys.length).toBeGreaterThan(0)
    for (const key of keys) {
      expect(FILES).toContain(`${key}.jpg`)
      // post_slides.example only stores keys of this shape.
      expect(key).toMatch(/^[a-z0-9-]{1,60}$/)
    }
    expect(isStyleExample('bento-produk')).toBe(true)
    expect(isStyleExample('../brand')).toBe(false)
    expect(isStyleExample('toString')).toBe(false)
    expect(isStyleExample(5)).toBe(false)
  })

  it('never lays text out beside a photo in a recipe', () => {
    for (const style of STYLES) {
      for (const layout of Object.values(style.layouts)) {
        expect(layout).not.toMatch(/beside|left half|right half|on the right|one side|two-column|in one column/i)
      }
    }
  })
})

describe('planStyleExamples', () => {
  const second: Picker = (items) => items[1]

  it('gives every slide its role’s example from one set, so a post keeps one family', () => {
    expect(planStyleExamples(DESIGN_STYLES.profesional, ['cover', 'isi', 'isi', 'cta'], second)).toEqual([
      'lingkaran-pertanyaan',
      'tim-kartu',
      'tim-kartu',
      'cta-avatar',
    ])
  })

  it('leaves a role the set has no example for empty', () => {
    expect(planStyleExamples(DESIGN_STYLES.ceria, ['cover', 'isi', 'cta'], pickFirst)).toEqual(['tipografi-ilustrasi', null, null])
  })

  it('gives a one-image post the set’s cover', () => {
    expect(planStyleExamples(DESIGN_STYLES.bold, [null], pickFirst)).toEqual(['bento-produk'])
  })

  it('gives nothing without a style or for a style without examples', () => {
    expect(planStyleExamples(null, ['cover', 'isi'], pickFirst)).toEqual([null, null])
    expect(planStyleExamples(DESIGN_STYLES.natural, ['cover'], pickFirst)).toEqual([null])
  })
})

describe('styleForBrand', () => {
  it('takes the chosen style, else Minimalis when the owner has no visual style of their own, else none', () => {
    expect(styleForBrand({ designStyle: 'tech', visualStyle: 'Foto hangat' })).toBe(DESIGN_STYLES.tech)
    expect(styleForBrand(null)).toBe(DESIGN_STYLES.minimalis)
    expect(styleForBrand({ designStyle: '', visualStyle: '' })).toBe(DESIGN_STYLES.minimalis)
    expect(styleForBrand({ designStyle: 'hilang', visualStyle: 'Foto hangat' })).toBeNull()
  })
})
