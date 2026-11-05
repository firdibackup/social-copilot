import { describe, expect, it } from 'vitest'
import { FONT_CHOICES } from './design-styles'
import { fontUrl } from './font-loader'
import { cssFamily, GOOGLE_FONTS, googleFontOf, isGoogleFont, searchFonts } from './google-fonts'
import { isFontName } from './layer-doc'

describe('google fonts catalogue', () => {
  it('holds the whole latin catalogue, curated fonts included', () => {
    expect(GOOGLE_FONTS.length).toBeGreaterThan(1500)
    for (const { name } of FONT_CHOICES) expect(isGoogleFont(name)).toBe(true)
    expect(new Set(GOOGLE_FONTS.map((font) => font.category))).toEqual(new Set(['sans', 'serif', 'display', 'handwriting', 'mono']))
  })

  it('keeps weights ascending and marks italic-only families', () => {
    for (const font of GOOGLE_FONTS) {
      expect(font.weights.length).toBeGreaterThan(0)
      expect([...font.weights].sort((a, b) => a - b)).toEqual(font.weights)
    }
    expect(googleFontOf('Molle')).toMatchObject({ category: 'handwriting', italicOnly: true })
    expect(googleFontOf('Inter')?.italicOnly).toBeUndefined()
  })

  it('looks up own names only', () => {
    for (const key of ['__proto__', 'constructor', 'toString', 'inter', '']) {
      expect(googleFontOf(key)).toBeUndefined()
      expect(isGoogleFont(key)).toBe(false)
    }
    expect(isGoogleFont(42)).toBe(false)
    expect(googleFontOf('Lobster')?.category).toBe('display')
  })

  it('lets layers use any catalogue font', () => {
    expect(isFontName('Lobster')).toBe(true)
    expect(isFontName('Plus Jakarta Sans')).toBe(true)
    expect(isFontName('Comic Sans MS')).toBe(false)
    expect(isFontName('__proto__')).toBe(false)
  })
})

describe('searchFonts', () => {
  it('ranks prefix matches before substring ones, each in popularity order', () => {
    const results = searchFonts('sans')
    const firstInner = results.findIndex((font) => !font.name.toLowerCase().startsWith('sans'))
    expect(firstInner).toBeGreaterThan(0)
    expect(results.slice(0, firstInner).every((font) => font.name.toLowerCase().startsWith('sans'))).toBe(true)
    expect(results.slice(firstInner).every((font) => !font.name.toLowerCase().startsWith('sans'))).toBe(true)
    const order = new Map(GOOGLE_FONTS.map((font, index) => [font.name, index]))
    const inner = results.slice(firstInner).map((font) => order.get(font.name)!)
    expect(inner).toEqual([...inner].sort((a, b) => a - b))
  })

  it('is case-insensitive and honours category and limit', () => {
    expect(searchFonts('PLAYFAIR')[0]?.name).toMatch(/^Playfair/)
    expect(searchFonts('', { limit: 5 }).map((font) => font.name)).toEqual(GOOGLE_FONTS.slice(0, 5).map((font) => font.name))
    const mono = searchFonts('', { category: 'mono', limit: 10 })
    expect(mono).toHaveLength(10)
    expect(mono.every((font) => font.category === 'mono')).toBe(true)
    expect(searchFonts('zzzz-no-such-font')).toEqual([])
  })
})

describe('cssFamily', () => {
  it('quotes the name with a generic fallback by category', () => {
    expect(cssFamily('Inter')).toBe("'Inter', sans-serif")
    expect(cssFamily('Lora')).toBe("'Lora', serif")
    expect(cssFamily('Lobster')).toBe("'Lobster', sans-serif")
    expect(cssFamily('Pacifico')).toBe("'Pacifico', cursive")
    expect(cssFamily('Roboto Mono')).toBe("'Roboto Mono', monospace")
  })

  it('escapes quotes and backslashes', () => {
    expect(cssFamily("It's\\")).toBe("'It\\'s\\\\', sans-serif")
  })
})

describe('fontUrl', () => {
  it('builds css2 URLs, with the italic axis for italic-only families', () => {
    expect(fontUrl(googleFontOf('Open Sans')!, [400, 700])).toBe(
      'https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;700&display=swap',
    )
    expect(fontUrl(googleFontOf('Molle')!, [400], 'Molle')).toBe(
      'https://fonts.googleapis.com/css2?family=Molle:ital,wght@1,400&text=Molle&display=swap',
    )
  })
})
