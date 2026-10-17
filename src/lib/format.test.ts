import { describe, expect, it } from 'vitest'
import { parseWibInput, slotOn, suggestedSlot, toWibInput, wibDateKey } from './format'

describe('parseWibInput', () => {
  it('reads a datetime-local value as WIB', () => {
    expect(parseWibInput('2026-10-14T19:00')?.toISOString()).toBe('2026-10-14T12:00:00.000Z')
  })

  it('returns null for anything else', () => {
    expect(parseWibInput('')).toBeNull()
    expect(parseWibInput('14/10/2026 19:00')).toBeNull()
    expect(parseWibInput('2026-13-40T25:00')).toBeNull()
  })
})

describe('toWibInput', () => {
  it('formats a moment as a WIB datetime-local value', () => {
    expect(toWibInput(new Date('2026-10-14T12:00:00Z'))).toBe('2026-10-14T19:00')
  })
})

describe('wibDateKey', () => {
  it('uses the WIB calendar day, which starts at 17:00 UTC', () => {
    expect(wibDateKey(new Date('2026-10-14T16:59:00Z'))).toBe('2026-10-14')
    expect(wibDateKey(new Date('2026-10-14T17:00:00Z'))).toBe('2026-10-15')
  })
})

describe('suggestedSlot', () => {
  it.each([
    ['at 12.00 WIB', '2026-10-16T05:00:00Z'],
    ['exactly 30 minutes before, at 18.30 WIB', '2026-10-16T11:30:00Z'],
  ])('offers 19.00 WIB today %s', (_label, now) => {
    expect(suggestedSlot(new Date(now))).toEqual({ value: '2026-10-16T19:00', label: 'Hari ini 19.00' })
  })

  it.each([
    ['a millisecond after 18.30 WIB', '2026-10-16T11:30:00.001Z'],
    ['at 19.00 WIB', '2026-10-16T12:00:00Z'],
    ['at 23.59 WIB, a minute before the WIB day ends at 17:00 UTC', '2026-10-16T16:59:00Z'],
  ])('offers 19.00 WIB tomorrow once today is less than 30 minutes away: %s', (_label, now) => {
    expect(suggestedSlot(new Date(now))).toEqual({ value: '2026-10-17T19:00', label: 'Besok 19.00' })
  })

  it('counts the new WIB day from 17:00 UTC, so the same evening becomes today', () => {
    expect(suggestedSlot(new Date('2026-10-16T17:00:00Z'))).toEqual({ value: '2026-10-17T19:00', label: 'Hari ini 19.00' })
  })

  it('rolls over to the next month and year', () => {
    expect(suggestedSlot(new Date('2026-12-31T15:00:00Z'))).toEqual({ value: '2027-01-01T19:00', label: 'Besok 19.00' })
  })
})

describe('slotOn', () => {
  const now = new Date('2026-10-16T05:00:00Z')

  it('offers 19.00 WIB on a later day picked in Kalender, with its date', () => {
    expect(slotOn('2026-10-25', now)).toEqual({ value: '2026-10-25T19:00', label: '25 Okt 19.00' })
  })

  it('keeps the usual label when the day is today or tomorrow', () => {
    expect(slotOn('2026-10-16', now)).toEqual({ value: '2026-10-16T19:00', label: 'Hari ini 19.00' })
    expect(slotOn('2026-10-17', new Date('2026-10-16T12:00:00Z'))).toEqual({ value: '2026-10-17T19:00', label: 'Besok 19.00' })
  })

  it.each([
    ['a past day', '2026-10-15'],
    ['today once 19.00 is less than 30 minutes away', '2026-10-16'],
  ])('offers nothing for %s', (_label, day) => {
    expect(slotOn(day, new Date('2026-10-16T11:45:00Z'))).toBeNull()
  })

  it.each([['an impossible date', '2026-02-31'], ['a malformed day', '25-10-2026'], ['an injected time', '2026-10-25T08:00']])(
    'offers nothing for %s',
    (_label, day) => {
      expect(slotOn(day, now)).toBeNull()
    },
  )
})
