import { describe, expect, it } from 'vitest'
import { parseContentRequest, parseInstruction } from './content-options'

const REFERENCE_ID = '00000000-0000-4000-8000-000000000001'
const IDEA_ID = '00000000-0000-4000-8000-000000000002'

const INPUT = {
  topic: 'Tips menyeduh kopi di rumah',
  slides: 3,
  format: '4:5',
  referenceId: null,
  productGroupId: null,
  pillarId: null,
  includeLogo: false,
  ideaId: null,
}

describe('parseContentRequest', () => {
  it('accepts a valid request', () => {
    expect(parseContentRequest(INPUT)).toEqual({ request: INPUT })
  })

  it('trims the topic and turns CRLF into LF', () => {
    const parsed = parseContentRequest({ ...INPUT, topic: '  Baris satu\r\nBaris dua \r\n' })

    expect(parsed).toEqual({ request: { ...INPUT, topic: 'Baris satu\nBaris dua' } })
  })

  it('accepts a square format, a reference, the logo and the idea the topic came from', () => {
    const input = { ...INPUT, format: '1:1', referenceId: REFERENCE_ID, includeLogo: true, ideaId: IDEA_ID }

    expect(parseContentRequest(input)).toEqual({ request: input })
  })

  it('accepts Otomatis for references and products', () => {
    expect(parseContentRequest({ ...INPUT, referenceId: 'auto', productGroupId: 'auto' })).toEqual({
      request: { ...INPUT, referenceId: 'auto', productGroupId: 'auto' },
    })
  })

  it('accepts an optional valid pillar id', () => {
    expect(parseContentRequest({ ...INPUT, pillarId: 'edukasi-kopi' })).toEqual({
      request: { ...INPUT, pillarId: 'edukasi-kopi' },
    })
    expect(parseContentRequest({ ...INPUT, pillarId: '' })).toEqual({ request: INPUT })
  })

  it.each(['Pilar Besar', 'pilar_1', 'a'.repeat(41), 7])('refuses invalid pillar id %s', (pillarId) => {
    expect(parseContentRequest({ ...INPUT, pillarId })).toEqual({ error: 'Pilar tidak dikenal.' })
  })

  it.each([1, 10])('accepts %i slides', (slides) => {
    expect(parseContentRequest({ ...INPUT, slides })).toEqual({ request: { ...INPUT, slides } })
  })

  it.each([
    ['a missing topic', undefined],
    ['a blank topic', ' \r\n\t '],
    ['a topic that is not text', 42],
  ])('refuses %s', (_label, topic) => {
    expect(parseContentRequest({ ...INPUT, topic })).toEqual({ error: 'Tulis topik atau ide konten dulu.' })
  })

  it('counts code points, so a topic of 5000 emoji fits and 5001 does not', () => {
    expect(parseContentRequest({ ...INPUT, topic: '😀'.repeat(5000) })).toEqual({
      request: { ...INPUT, topic: '😀'.repeat(5000) },
    })
    expect(parseContentRequest({ ...INPUT, topic: '😀'.repeat(5001) })).toEqual({ error: 'Topik maksimal 5000 karakter.' })
  })

  it.each([
    ['a fractional count', 1.5],
    ['zero', 0],
    ['eleven', 11],
    ['the string "3"', '3'],
    ['NaN', Number.NaN],
    ['a missing count', undefined],
  ])('refuses %s as the number of slides', (_label, slides) => {
    expect(parseContentRequest({ ...INPUT, slides })).toEqual({ error: 'Jumlah slide 1–10.' })
  })

  it.each([
    ['an unknown format', '16:9'],
    ['a key inherited from Object.prototype', 'toString'],
    ['a missing format', undefined],
  ])('refuses %s', (_label, format) => {
    expect(parseContentRequest({ ...INPUT, format })).toEqual({ error: 'Format gambar tidak dikenal.' })
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an empty string', ''],
  ])('reads a reference and an idea given as %s as none', (_label, empty) => {
    expect(parseContentRequest({ ...INPUT, referenceId: empty, productGroupId: empty, ideaId: empty })).toEqual({ request: INPUT })
  })

  it('refuses a reference or an idea that is not a uuid', () => {
    expect(parseContentRequest({ ...INPUT, referenceId: 'ref-1' })).toEqual({ error: 'Referensi tidak ditemukan.' })
    expect(parseContentRequest({ ...INPUT, productGroupId: 'product-1' })).toEqual({ error: 'Produk tidak ditemukan.' })
    expect(parseContentRequest({ ...INPUT, ideaId: 'idea-1' })).toEqual({ error: 'Ide tidak ditemukan.' })
    expect(parseContentRequest({ ...INPUT, ideaId: 7 })).toEqual({ error: 'Ide tidak ditemukan.' })
  })

  it.each([
    ['the string "true"', 'true'],
    ['1', 1],
    ['undefined', undefined],
  ])('includes the logo only for exactly true, not for %s', (_label, includeLogo) => {
    expect(parseContentRequest({ ...INPUT, includeLogo })).toEqual({ request: { ...INPUT, includeLogo: false } })
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'Tips menyeduh kopi'],
    ['a number', 3],
  ])('refuses %s as the request', (_label, input) => {
    expect(parseContentRequest(input)).toEqual({ error: 'Permintaan tidak valid.' })
  })
})

describe('parseInstruction', () => {
  it('returns the instruction trimmed, with CRLF as LF', () => {
    expect(parseInstruction('  Latar lebih terang\r\njudul lebih besar  ')).toBe('Latar lebih terang\njudul lebih besar')
  })

  it.each([
    ['an empty string', ''],
    ['only whitespace', ' \r\n\t '],
    ['a number', 42],
    ['null', null],
  ])('refuses %s', (_label, value) => {
    expect(parseInstruction(value)).toEqual({ error: 'Tulis perubahan yang diinginkan dulu.' })
  })

  it('counts code points after trimming, so 500 emoji fit and 501 do not', () => {
    expect(parseInstruction(` ${'😀'.repeat(500)} `)).toBe('😀'.repeat(500))
    expect(parseInstruction('😀'.repeat(501))).toEqual({ error: 'Perubahan maksimal 500 karakter.' })
  })
})
