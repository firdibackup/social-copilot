import { describe, expect, it } from 'vitest'
import {
  calendarDays,
  firstOpenDay,
  formatLongDay,
  formatMonth,
  parseWibInput,
  shiftDay,
  shiftMonth,
  slotLabel,
  slotOn,
  suggestedSlot,
  timesOn,
  toSlot,
  toWibInput,
  wibDateKey,
} from './format'

describe('slotLabel', () => {
  const now = new Date('2026-10-20T13:59:00Z') // Tuesday 20.59 WIB

  it('names today and tomorrow like the old suggestion', () => {
    expect(slotLabel(new Date('2026-10-20T14:30:00Z'), now)).toBe('Hari ini 21.30')
    expect(slotLabel(new Date('2026-10-21T12:00:00Z'), now)).toBe('Besok 19.00')
  })

  it('names later days by weekday and date', () => {
    expect(slotLabel(new Date('2026-10-22T12:00:00Z'), now)).toBe('Kam, 22 Okt 19.00')
  })

  it('gives the editor the WIB input value with it', () => {
    expect(toSlot(new Date('2026-10-22T12:00:00Z'), now)).toEqual({ value: '2026-10-22T19:00', label: 'Kam, 22 Okt 19.00' })
  })
})

describe('formatLongDay', () => {
  it('names a day key in full', () => {
    expect(formatLongDay('2026-10-22')).toBe('Kamis, 22 Oktober')
  })
})

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

describe('formatMonth and shiftMonth', () => {
  it('names a month and steps across years', () => {
    expect(formatMonth('2026-10')).toBe('Oktober 2026')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
  })

  it('does not skip short months from the 31st', () => {
    expect(shiftMonth('2026-01', 1)).toBe('2026-02')
  })
})

describe('calendarDays', () => {
  it('gives six Monday-first weeks padded with the adjacent months', () => {
    const days = calendarDays('2026-10') // 1 Oktober 2026 is a Thursday
    expect(days).toHaveLength(42)
    expect(days[0]).toBe('2026-09-28')
    expect(days[3]).toBe('2026-10-01')
    expect(days[41]).toBe('2026-11-08')
  })

  it('starts on the 1st when the month begins on a Monday', () => {
    expect(calendarDays('2026-06')[0]).toBe('2026-06-01')
  })
})

describe('shiftDay', () => {
  it('steps across months and years', () => {
    expect(shiftDay('2026-10-31', 1)).toBe('2026-11-01')
    expect(shiftDay('2027-01-03', -7)).toBe('2026-12-27')
  })
})

describe('timesOn', () => {
  const now = new Date('2026-10-20T11:10:00Z') // 18.10 WIB

  it('lists every 15 minutes on a later day', () => {
    const times = timesOn('2026-10-21', now)
    expect(times).toHaveLength(96)
    expect(times[0]).toBe('00:00')
    expect(times.at(-1)).toBe('23:45')
  })

  it('keeps only times at least 30 minutes away today', () => {
    expect(timesOn('2026-10-20', now)[0]).toBe('18:45')
    expect(timesOn('2026-10-20', new Date('2026-10-20T11:15:00Z'))[0]).toBe('18:45')
  })

  it('offers nothing on a past day', () => {
    expect(timesOn('2026-10-19', now)).toEqual([])
  })
})

describe('firstOpenDay', () => {
  it('is today while a time is left, tomorrow after 23.15 WIB', () => {
    expect(firstOpenDay(new Date('2026-10-20T16:15:00Z'))).toBe('2026-10-20')
    expect(firstOpenDay(new Date('2026-10-20T16:16:00Z'))).toBe('2026-10-21')
  })
})
