import { describe, expect, it } from 'vitest'
import {
  colorsFromPalettes,
  EMPTY_BRAND,
  labelsForCount,
  normalizeHex,
  normalizeWebsiteUrl,
  parseBrandFields,
  parsePalette,
  pickFirst,
  planReferenceImages,
  REFERENCE_LABELS,
  slideRoles,
  type PoolImage,
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

describe('slideRoles', () => {
  it.each([
    [0, []],
    [1, [null]],
    [2, ['cover', 'isi']],
    [5, ['cover', 'isi', 'isi', 'isi', 'cta']],
  ] as const)('gives %i slides the roles %j', (count, roles) => {
    expect(slideRoles(count)).toEqual(roles)
  })
})

describe('planReferenceImages', () => {
  const image = (id: string, label: PoolImage['label'], position = 0): PoolImage => ({ id, label, position })
  const group = [image('cover', 'cover', 0), image('isi-1', 'isi', 1), image('isi-2', 'isi', 2), image('cta', 'cta', 3)]

  it('gives each role an image of its own label, the same inner image to every inner slide', () => {
    expect(planReferenceImages(group, slideRoles(5), pickFirst)).toEqual(['cover', 'isi-1', 'isi-1', 'isi-1', 'cta'])
  })

  it('never lends the cover to an inner or CTA slide that has no image of its own label', () => {
    expect(planReferenceImages([image('cover', 'cover')], slideRoles(3), pickFirst)).toEqual(['cover', null, null])
    expect(planReferenceImages([image('isi', 'isi')], slideRoles(3), pickFirst)).toEqual([null, 'isi', null])
  })

  it('fills every role without an image of its own label with one Umum image', () => {
    const pool = [image('cover', 'cover'), image('umum-1', 'single', 1), image('umum-2', 'single', 2)]

    expect(planReferenceImages(pool, slideRoles(4), pickFirst)).toEqual(['cover', 'umum-1', 'umum-1', 'umum-1'])
    expect(planReferenceImages([image('umum', 'single'), image('isi', 'isi', 1)], slideRoles(3), pickFirst)).toEqual([
      'umum',
      'isi',
      'umum',
    ])
  })

  it('lets a pool of Umum images alone lend its style to every slide', () => {
    expect(planReferenceImages([image('photo', 'single')], slideRoles(4), pickFirst)).toEqual(['photo', 'photo', 'photo', 'photo'])
  })

  it('names the photo label Umum', () => {
    expect(REFERENCE_LABELS.single).toBe('Umum')
  })

  it('gives a one-image post the cover, else a photo', () => {
    expect(planReferenceImages(group, slideRoles(1), pickFirst)).toEqual(['cover'])
    expect(planReferenceImages([image('photo', 'single'), image('isi', 'isi')], [null], pickFirst)).toEqual(['photo'])
  })

  it('picks within each label with the picker it is given, once per role', () => {
    const last = <T,>(items: T[]) => items.at(-1)
    const pool = [...group, image('cover-2', 'cover', 4), image('cta-2', 'cta', 5)]

    expect(planReferenceImages(pool, slideRoles(4), last)).toEqual(['cover-2', 'isi-2', 'isi-2', 'cta-2'])
  })

  it('gives every slide nothing without references', () => {
    expect(planReferenceImages([], slideRoles(3), pickFirst)).toEqual([null, null, null])
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
