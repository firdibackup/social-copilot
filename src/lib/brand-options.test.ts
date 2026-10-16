import { describe, expect, it } from 'vitest'
import { EMPTY_BRAND, normalizeHex, normalizeWebsiteUrl, parseBrandFields, parsePalette } from './brand-options'

describe('parseBrandFields', () => {
  it('trims text, turns CRLF into LF and normalizes the website and colours', () => {
    const parsed = parseBrandFields({
      name: '  Kopi Sinar ',
      facts: '- Buka 08.00\r\n- Bandung',
      websiteUrl: 'kopisinar.id',
      colors: [{ hex: '#ABC', role: 'utama' }],
    })

    expect(parsed).toEqual({
      fields: {
        ...EMPTY_BRAND,
        name: 'Kopi Sinar',
        facts: '- Buka 08.00\n- Bandung',
        websiteUrl: 'https://kopisinar.id/',
        colors: [{ hex: '#aabbcc', role: 'utama' }],
      },
    })
  })

  it('counts code points, so 100 emoji fit in the name and 101 do not', () => {
    expect(parseBrandFields({ name: '☕'.repeat(100) })).toHaveProperty('fields')
    expect(parseBrandFields({ name: '☕'.repeat(101) })).toEqual({ error: 'Nama brand maksimal 100 karakter.' })
  })

  it.each([
    ['a non-object', 'brand'],
    ['a number in a text field', { name: 5 }],
    ['an ftp website', { websiteUrl: 'ftp://kopisinar.id' }],
    ['seven colours', { colors: Array.from({ length: 7 }, () => ({ hex: '#000000', role: 'aksen' })) }],
    ['a colour without a known role', { colors: [{ hex: '#000000', role: 'toString' }] }],
    ['a colour that is not hex', { colors: [{ hex: 'red', role: 'utama' }] }],
  ])('rejects %s', (_label, input) => {
    expect(parseBrandFields(input)).toHaveProperty('error')
  })
})

describe('normalizeHex', () => {
  it('expands short hex and lowercases', () => {
    expect(normalizeHex('#F0a')).toBe('#ff00aa')
    expect(normalizeHex('1A2B3C')).toBe('#1a2b3c')
  })

  it('rejects anything else', () => {
    expect(normalizeHex('#12345')).toBeNull()
    expect(normalizeHex('blue')).toBeNull()
  })
})

describe('parsePalette', () => {
  it('accepts up to five hex colours', () => {
    expect(parsePalette(['#000000', '#ffffff'])).toEqual(['#000000', '#ffffff'])
    expect(parsePalette(Array(6).fill('#000000'))).toBeNull()
    expect(parsePalette(['#FFF'])).toBeNull()
  })
})

describe('normalizeWebsiteUrl', () => {
  it('adds https to a bare domain and keeps an explicit http', () => {
    expect(normalizeWebsiteUrl('kopisinar.id/menu')).toBe('https://kopisinar.id/menu')
    expect(normalizeWebsiteUrl('http://kopisinar.id')).toBe('http://kopisinar.id/')
  })

  it('rejects hosts without a dot and other schemes', () => {
    expect(normalizeWebsiteUrl('localhost:3000')).toBeNull()
    expect(normalizeWebsiteUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeWebsiteUrl('   ')).toBeNull()
  })
})
