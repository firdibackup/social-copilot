import { describe, expect, it } from 'vitest'
import { formatWhatsapp, mayarMobile, normalizeWhatsapp, parseCustomerContact, whatsappLink } from './whatsapp'

describe('normalizeWhatsapp', () => {
  it.each([
    ['0812-3456-7890', '6281234567890'],
    ['812 3456 7890', '6281234567890'],
    ['+62 812 3456 7890', '6281234567890'],
    ['6281234567890', '6281234567890'],
    ['(0812) 3456.7890', '6281234567890'],
    ['+60 12-345 6789', '60123456789'],
  ])('reads %s', (input, expected) => {
    expect(normalizeWhatsapp(input)).toBe(expected)
  })

  it.each(['', '0812', 'abc', '0812345678901234567', '+62 21 555 1234', '62 021 5551234', 12345, null])('refuses %s', (input) => {
    expect(normalizeWhatsapp(input)).toBeNull()
  })
})

describe('display and links', () => {
  it('formats, converts for Mayar and links to wa.me', () => {
    expect(formatWhatsapp('6281234567890')).toBe('+62 812-3456-7890')
    expect(formatWhatsapp('60123456789')).toBe('+60123456789')
    expect(mayarMobile('6281234567890')).toBe('081234567890')
    expect(mayarMobile('60123456789')).toBe('60123456789')
    expect(whatsappLink('6281234567890', 'Halo Budi & tim?')).toBe('https://wa.me/6281234567890?text=Halo%20Budi%20%26%20tim%3F')
  })
})

describe('parseCustomerContact', () => {
  it('trims the name and normalizes the number', () => {
    expect(parseCustomerContact({ name: '  Budi   Santoso ', whatsapp: '0812 3456 7890' })).toEqual({ name: 'Budi Santoso', whatsapp: '6281234567890' })
  })

  it('explains what is missing', () => {
    expect(parseCustomerContact({ name: ' ', whatsapp: '0812 3456 7890' })).toEqual({ error: 'Isi nama untuk tagihan.' })
    expect(parseCustomerContact({ name: 'x'.repeat(101), whatsapp: '0812 3456 7890' })).toHaveProperty('error')
    expect(parseCustomerContact({ name: 'Budi', whatsapp: '123' })).toHaveProperty('error')
    expect(parseCustomerContact(undefined)).toHaveProperty('error')
  })
})
