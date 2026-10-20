import { describe, expect, it } from 'vitest'
import {
  itemsFromCaption,
  parseThreadItems,
  splitThreadText,
  threadItemsError,
  threadsLength,
  threadsMediaType,
  THREADS_TEXT_LIMIT,
} from './thread-items'

const ID_A = '0b6f3f4e-6b0b-4c5e-9a61-1f2d3c4b5a69'
const ID_B = '6a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'

describe('threadsLength', () => {
  it('counts ordinary characters once, accented ones included', () => {
    expect(threadsLength('Kopi enak')).toBe(9)
    expect(threadsLength('café\n')).toBe(5)
  })

  it('counts emojis as their UTF-8 bytes, as Threads does', () => {
    expect(threadsLength('😀')).toBe(4)
    expect(threadsLength('👍🏽')).toBe(8)
    expect(threadsLength('❤️')).toBe(6)
    expect(threadsLength('🇮🇩')).toBe(8)
  })

  it('counts a digit once, unless it is part of a keycap', () => {
    expect(threadsLength('1')).toBe(1)
    expect(threadsLength('1️⃣')).toBe(7)
  })
})

describe('splitThreadText', () => {
  it('keeps a text that fits', () => {
    expect(splitThreadText('  Halo semua \r\n')).toEqual(['Halo semua'])
    expect(splitThreadText('')).toEqual([''])
  })

  it('cuts after a paragraph first', () => {
    const first = 'a'.repeat(300)
    const second = 'b'.repeat(300)
    expect(splitThreadText(`${first}\n\n${second}`)).toEqual([first, second])
  })

  it('cuts after a sentence when a paragraph is too long', () => {
    const sentence = `${'kata '.repeat(59)}akhir.`
    const parts = splitThreadText(`${sentence} ${sentence}`)
    expect(parts).toEqual([sentence, sentence])
  })

  it('cuts at a space when there is no sentence end', () => {
    const parts = splitThreadText('kata '.repeat(150).trim())
    expect(parts.length).toBe(2)
    expect(parts.every((part) => threadsLength(part) <= THREADS_TEXT_LIMIT)).toBe(true)
    expect(parts.join(' ')).toBe('kata '.repeat(150).trim())
  })

  it('cuts hard inside a word longer than the limit', () => {
    expect(splitThreadText('x'.repeat(1200))).toEqual(['x'.repeat(500), 'x'.repeat(500), 'x'.repeat(200)])
  })

  it('never puts more than the limit in a part, counting emojis as Threads does', () => {
    const parts = splitThreadText(`${'Promo hari ini 🔥🔥. '.repeat(40)}Cek bio!`)
    expect(parts.length).toBeGreaterThan(1)
    for (const part of parts) expect(threadsLength(part)).toBeLessThanOrEqual(THREADS_TEXT_LIMIT)
  })
})

describe('itemsFromCaption', () => {
  it('puts every photo on the first item', () => {
    expect(itemsFromCaption('Halo', [ID_A, ID_B])).toEqual([{ text: 'Halo', assetIds: [ID_A, ID_B] }])
  })

  it('splits a long caption into a chain', () => {
    const items = itemsFromCaption(`${'a'.repeat(400)}\n\n${'b'.repeat(400)}`, [ID_A])
    expect(items).toEqual([
      { text: 'a'.repeat(400), assetIds: [ID_A] },
      { text: 'b'.repeat(400), assetIds: [] },
    ])
  })

  it('keeps 20 photos at most', () => {
    const ids = Array.from({ length: 25 }, (_, index) => `id-${index}`)
    expect(itemsFromCaption('', ids)[0].assetIds).toHaveLength(20)
  })
})

describe('threadItemsError', () => {
  it('accepts text, photos, or both', () => {
    expect(threadItemsError([{ text: 'Halo', assetIds: [] }, { text: '', assetIds: [ID_A] }])).toBeNull()
  })

  it.each([
    ['an empty chain', [], 'Post Threads masih kosong.'],
    ['an item with nothing in it', [{ text: '  ', assetIds: [] }], 'Post Threads #1 kosong: isi teks atau tambahkan foto.'],
    [
      'an item over 500 as Threads counts',
      [{ text: 'ok', assetIds: [] }, { text: '😀'.repeat(126), assetIds: [] }],
      'Post Threads #2 lebih dari 500 karakter. Pendekkan atau pakai Pecah otomatis.',
    ],
    [
      'more than 10 items',
      Array.from({ length: 11 }, () => ({ text: 'a', assetIds: [] })),
      'Maksimal 10 post dalam satu rantai Threads.',
    ],
  ])('rejects %s', (_label, items, message) => {
    expect(threadItemsError(items)).toBe(message)
  })
})

describe('parseThreadItems', () => {
  it('trims text, normalises newlines and drops repeated photos', () => {
    expect(parseThreadItems([{ text: ' Halo\r\nsemua ', assetIds: [ID_A, ID_A, ID_B] }])).toEqual({
      items: [{ text: 'Halo\nsemua', assetIds: [ID_A, ID_B] }],
    })
  })

  it('allows an empty chain, which follows the caption again', () => {
    expect(parseThreadItems([])).toEqual({ items: [] })
  })

  it.each([
    ['a non-array', { text: 'a', assetIds: [] }, 'Rantai Threads tidak valid.'],
    ['an item without photos list', [{ text: 'a' }], 'Rantai Threads tidak valid.'],
    ['a photo id that is not a uuid', [{ text: 'a', assetIds: ['x'] }], 'Foto Threads tidak valid.'],
    ['text over 500 code points', [{ text: 'a'.repeat(501), assetIds: [] }], 'Post Threads #1 lebih dari 500 karakter.'],
  ])('rejects %s', (_label, input, error) => {
    expect(parseThreadItems(input)).toEqual({ error })
  })
})

describe('threadsMediaType', () => {
  it('picks the container for the photo count', () => {
    expect([0, 1, 2, 20].map(threadsMediaType)).toEqual(['TEXT', 'IMAGE', 'CAROUSEL', 'CAROUSEL'])
  })
})
