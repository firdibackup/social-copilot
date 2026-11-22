import { describe, expect, it } from 'vitest'
import { matchesQuery, normalizeQuery, searchItems } from './element-search'

describe('element search', () => {
  it('ignores case, accents and punctuation', () => {
    expect(normalizeQuery('  Kopi-Susu, Café! ')).toBe('kopi susu cafe')
  })

  it('matches when every query word starts a word of the text', () => {
    expect(matchesQuery('Panah kanan arrow right', 'pan kan')).toBe(true)
    expect(matchesQuery('Panah kanan arrow right', 'ARROW')).toBe(true)
    expect(matchesQuery('Panah kanan arrow right', 'ah')).toBe(false)
    expect(matchesQuery('Panah kanan arrow right', 'panah kiri')).toBe(false)
  })

  it('keeps every item for an empty query and filters otherwise', () => {
    const items = [{ name: 'Bintang star' }, { name: 'Hati heart love' }]
    expect(searchItems(items, (item) => item.name, '  ')).toEqual(items)
    expect(searchItems(items, (item) => item.name, 'love')).toEqual([items[1]])
    expect(searchItems(items, (item) => item.name, 'kopi')).toEqual([])
  })
})
