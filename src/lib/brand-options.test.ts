import { describe, expect, it } from 'vitest'
import {
  colorsFromPalettes,
  EMPTY_BRAND,
  labelsForCount,
  normalizeHex,
  normalizeWebsiteUrl,
  parseBrandFields,
  parsePalette,
  pickReferenceImage,
} from './brand-options'

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

describe('labelsForCount', () => {
  it.each([
    [1, ['single']],
    [2, ['cover', 'isi']],
    [3, ['cover', 'isi', 'cta']],
    [5, ['cover', 'isi', 'isi', 'isi', 'cta']],
  ])('labels %i images by position', (count, labels) => {
    expect(labelsForCount(count)).toEqual(labels)
  })
})

describe('pickReferenceImage', () => {
  const group = labelsForCount(4).map((label, position) => ({ position, label })) // cover isi isi cta

  it.each([
    [null, 0],
    [{ index: 1, count: 1 }, 0],
    [{ index: 1, count: 7 }, 0],
    [{ index: 7, count: 7 }, 3],
    [{ index: 2, count: 7 }, 1],
    [{ index: 3, count: 7 }, 2],
    [{ index: 4, count: 7 }, 1],
  ])('maps slide %j to position %i', (slide, position) => {
    expect(pickReferenceImage(group, slide)?.position).toBe(position)
  })

  it('falls back to the cover without a cta, and to the first image without a cover', () => {
    const noCta = [
      { position: 1, label: 'isi' as const },
      { position: 0, label: 'cover' as const },
    ]
    expect(pickReferenceImage(noCta, { index: 3, count: 3 })?.position).toBe(0)
    expect(pickReferenceImage([{ position: 0, label: 'isi' as const }], { index: 1, count: 2 })?.position).toBe(0)
    expect(pickReferenceImage([], null)).toBeNull()
  })

  it('uses a single image for every slide', () => {
    expect(pickReferenceImage([{ position: 0, label: 'single' as const }], { index: 5, count: 5 })?.position).toBe(0)
  })
})

describe('colorsFromPalettes', () => {
  it('takes colours round-robin across the covers without duplicates', () => {
    expect(colorsFromPalettes([['#111111', '#222222'], ['#111111', '#333333']])).toEqual([
      { hex: '#111111', role: 'utama' },
      { hex: '#222222', role: 'sekunder' },
      { hex: '#333333', role: 'aksen' },
    ])
  })

  it('stops at one colour per role', () => {
    const palette = ['#000001', '#000002', '#000003', '#000004', '#000005', '#000006']
    expect(colorsFromPalettes([palette]).map((color) => color.role)).toEqual(['utama', 'sekunder', 'aksen', 'latar', 'teks'])
  })
})
