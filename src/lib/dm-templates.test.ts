import { describe, expect, it } from 'vitest'
import {
  containsKeyword,
  fillTemplate,
  formatVariables,
  parseVariables,
  suggestTemplate,
  type DmTemplate,
} from './dm-templates'

describe('containsKeyword', () => {
  it('matches the keyword as a whole word', () => {
    expect(containsKeyword('kak, ada promo?', 'promo')).toBe(true)
    expect(containsKeyword('promo', 'promo')).toBe(true)
    expect(containsKeyword('info promo hari ini', 'promo hari ini')).toBe(true)
  })

  it('ignores the keyword inside a longer word', () => {
    expect(containsKeyword('ada promosi?', 'promo')).toBe(false)
    expect(containsKeyword('superpromo', 'promo')).toBe(false)
    expect(containsKeyword('promo_2', 'promo')).toBe(false)
  })

  it('is case-sensitive, as the owner chose', () => {
    expect(containsKeyword('Ada Promo?', 'promo')).toBe(false)
  })

  it('treats regex characters in the keyword literally', () => {
    expect(containsKeyword('berapa harga (s)?', 'harga (s)')).toBe(true)
    expect(containsKeyword('harga s', 'harga (s)')).toBe(false)
  })

  it('treats accented letters as part of a word', () => {
    expect(containsKeyword('cafépromo', 'promo')).toBe(false)
  })
})

describe('suggestTemplate', () => {
  const templates: DmTemplate[] = [
    { id: 'manual', keyword: null, body: 'Manual' },
    { id: 'harga', keyword: 'harga', body: 'Harga' },
    { id: 'promo', keyword: 'promo', body: 'Promo' },
  ]

  it('returns the first template whose keyword the message contains', () => {
    expect(suggestTemplate(templates, 'promo dan harga?')?.id).toBe('harga')
  })

  it('never suggests a template without a keyword', () => {
    expect(suggestTemplate(templates, 'Manual')).toBeNull()
  })
})

describe('fillTemplate', () => {
  const context = { senderName: 'Budi', message: 'ada promo?', variables: { brand_name: 'Toko Sinar' } }

  it('fills the sender, the message and owner variables', () => {
    expect(fillTemplate('Halo {sender_name}, soal "{message_text}" di {brand_name}', context)).toBe(
      'Halo Budi, soal "ada promo?" di Toko Sinar',
    )
  })

  it('greets with "Kak" while the sender name is unknown', () => {
    expect(fillTemplate('Halo {sender_name}!', { ...context, senderName: null })).toBe('Halo Kak!')
  })

  it('keeps unknown placeholders so the owner sees them in the draft', () => {
    expect(fillTemplate('Buka {jam_buka}, {constructor}', context)).toBe('Buka {jam_buka}, {constructor}')
  })

  it('inserts values with $ and backslashes literally', () => {
    const variables = { brand_name: 'Toko $& \\1' }
    expect(fillTemplate('{brand_name}', { ...context, variables })).toBe('Toko $& \\1')
  })

  it('does not let owner variables replace the built-in ones', () => {
    const variables = { sender_name: 'Palsu' }
    expect(fillTemplate('{sender_name}', { ...context, variables })).toBe('Budi')
  })
})

describe('parseVariables', () => {
  it('reads name = value lines and skips blank ones', () => {
    expect(parseVariables('brand_name = Toko Sinar\n\n jam_buka=09.00 = 17.00 \n')).toEqual({
      variables: { brand_name: 'Toko Sinar', jam_buka: '09.00 = 17.00' },
    })
  })

  it('rejects a line without a valid name', () => {
    expect(parseVariables('Brand Name = X')).toEqual({ error: expect.stringContaining('Brand Name = X') })
    expect(parseVariables('tanpa sama dengan')).toEqual({ error: expect.stringContaining('tanpa sama dengan') })
  })

  it('rejects the built-in names', () => {
    expect(parseVariables('sender_name = X')).toEqual({ error: expect.stringContaining('{sender_name}') })
  })

  it('round-trips through formatVariables', () => {
    const variables = { brand_name: 'Toko Sinar', jam_buka: '09.00' }
    expect(parseVariables(formatVariables(variables))).toEqual({ variables })
  })
})
