import { describe, expect, it } from 'vitest'
import { DESIGN_STYLE_IDS, DESIGN_STYLES, FONT_CHOICES, designStyleOf, isAccountKind, isDesignStyle } from './design-styles'
import { EMPTY_ANSWERS, parseAnswers, parseWebsite } from './onboarding-options'

describe('parseAnswers', () => {
  it('accepts an empty object: every step can be skipped', () => {
    expect(parseAnswers({})).toEqual({ answers: EMPTY_ANSWERS })
  })

  it('trims text and keeps known choices', () => {
    const result = parseAnswers({
      accountKind: 'jasa',
      name: '  Klinik Sehat ',
      designStyle: 'elegan',
      headingFont: 'Fraunces',
      colors: [{ hex: '#0f766e', role: 'utama' }],
    })
    expect(result).toEqual({
      answers: {
        ...EMPTY_ANSWERS,
        accountKind: 'jasa',
        name: 'Klinik Sehat',
        designStyle: 'elegan',
        headingFont: 'Fraunces',
        colors: [{ hex: '#0f766e', role: 'utama' }],
      },
    })
  })

  it('rejects unknown choices and bad input', () => {
    expect(parseAnswers(null)).toEqual({ error: 'Jawaban tidak valid.' })
    expect(parseAnswers({ name: 5 })).toEqual({ error: 'Jawaban tidak valid.' })
    expect(parseAnswers({ accountKind: 'toString' })).toEqual({ error: 'Jenis akun tidak dikenal.' })
    expect(parseAnswers({ designStyle: 'constructor' })).toEqual({ error: 'Gaya desain tidak dikenal.' })
    expect(parseAnswers({ colors: [{ hex: 'merah', role: 'utama' }] })).toEqual({ error: 'Warna tidak valid.' })
  })

  it('takes a posts-per-week choice and a referral source', () => {
    expect(parseAnswers({ postsPerWeek: 7, referralSource: '  podcast   bisnis ' })).toEqual({
      answers: { ...EMPTY_ANSWERS, postsPerWeek: 7, referralSource: 'podcast bisnis' },
    })
    expect(parseAnswers({ postsPerWeek: 0 })).toEqual({ answers: EMPTY_ANSWERS })
    expect(parseAnswers({ postsPerWeek: 4 })).toHaveProperty('error')
    expect(parseAnswers({ postsPerWeek: '5' })).toHaveProperty('error')
    expect(parseAnswers({ referralSource: 5 })).toHaveProperty('error')
    expect(parseAnswers({ referralSource: 'a'.repeat(101) })).toHaveProperty('error')
  })

  it('enforces the text limits', () => {
    expect(parseAnswers({ name: 'a'.repeat(101) })).toEqual({ error: 'Nama brand maksimal 100 karakter.' })
  })
})

describe('design styles', () => {
  const fonts = new Set<string>(FONT_CHOICES.map((font) => font.name))

  it('only uses fonts the owner can pick, and has a layout for every role', () => {
    for (const id of DESIGN_STYLE_IDS) {
      const style = DESIGN_STYLES[id]
      expect(fonts.has(style.headingFont)).toBe(true)
      expect(fonts.has(style.bodyFont)).toBe(true)
      for (const role of ['single', 'cover', 'isi', 'cta'] as const) expect(style.layouts[role].length).toBeGreaterThan(0)
    }
  })

  it('looks up own keys only', () => {
    expect(isDesignStyle('bold')).toBe(true)
    expect(isDesignStyle('__proto__')).toBe(false)
    expect(designStyleOf('')).toBeNull()
    expect(designStyleOf('hilang')).toBeNull()
    expect(isAccountKind('kreator')).toBe(true)
    expect(isAccountKind('hasOwnProperty')).toBe(false)
  })
})

describe('the one-tap questions', () => {
  it('keeps known answers and the website with a scheme', () => {
    const result = parseAnswers({ goal: 'sales', captionLanguage: 'mixed', handler: 'agency', skillLevel: 'new', logoChoice: 'instagram', website: 'tokoku.id/produk', noInstagram: true })
    expect(result).toEqual({
      answers: { ...EMPTY_ANSWERS, goal: 'sales', captionLanguage: 'mixed', handler: 'agency', skillLevel: 'new', logoChoice: 'instagram', website: 'https://tokoku.id/produk', noInstagram: true },
    })
  })

  it('rejects an answer that is not one of the choices', () => {
    expect(parseAnswers({ goal: 'constructor' })).toEqual({ error: 'Jawaban tidak valid.' })
    expect(parseAnswers({ website: 'bukan alamat' })).toEqual({ error: 'Alamat website tidak valid.' })
  })

  it('never takes the Instagram username from the client: only the confirmed lookup sets it', () => {
    expect(parseAnswers({ igUsername: 'orang.lain' })).toEqual({ answers: EMPTY_ANSWERS })
  })
})

describe('parseWebsite', () => {
  it('adds https and refuses what is not a web address', () => {
    expect(parseWebsite('')).toBe('')
    expect(parseWebsite(' Tokoku.ID ')).toBe('https://tokoku.id/')
    expect(parseWebsite('http://tokoku.id/a?b=1')).toBe('http://tokoku.id/a?b=1')
    expect(parseWebsite('localhost')).toBeNull()
    expect(parseWebsite('ftp://tokoku.id')).toBeNull()
    expect(parseWebsite('toko ku.id')).toBeNull()
  })
})
