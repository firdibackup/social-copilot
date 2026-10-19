import { describe, expect, it } from 'vitest'
import { cleanTags, MAX_ASSET_TAGS, parseTagInput } from './asset-options'

describe('cleanTags', () => {
  it('keeps distinct lowercase tags and drops what is not a short string', () => {
    expect(cleanTags([' Kopi  Susu ', 'kopi susu', 'Botol', '', 7, 'x'.repeat(41)])).toEqual(['kopi susu', 'botol'])
  })

  it('caps the list and ignores anything but an array', () => {
    expect(cleanTags(Array.from({ length: 30 }, (_, index) => `tag ${index}`))).toHaveLength(MAX_ASSET_TAGS)
    expect(cleanTags('kopi')).toEqual([])
  })
})

describe('parseTagInput', () => {
  it('splits the owner text on commas', () => {
    expect(parseTagInput('Kopi, gula aren,, kopi ')).toEqual({ tags: ['kopi', 'gula aren'] })
  })

  it('refuses a tag that is too long or too many tags', () => {
    expect(parseTagInput('x'.repeat(41))).toHaveProperty('error')
    expect(parseTagInput(Array.from({ length: 21 }, (_, index) => `tag ${index}`).join(','))).toHaveProperty('error')
  })
})
