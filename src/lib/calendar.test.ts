import { describe, expect, it } from 'vitest'
import { addDays, buildMonthGrid, formatShortDay, parseMonth, shiftMonth, weekCounts } from './calendar'

describe('addDays', () => {
  it('moves a week across a month and a year', () => {
    expect(addDays('2026-10-28', 7)).toBe('2026-11-04')
    expect(addDays('2027-01-03', -7)).toBe('2026-12-27')
  })
})

describe('formatShortDay', () => {
  it('names a day key briefly', () => {
    expect(formatShortDay('2026-10-22')).toBe('22 Okt')
  })
})

describe('buildMonthGrid', () => {
  it('starts on Monday and pads with the neighbouring months', () => {
    const weeks = buildMonthGrid('2026-10')
    expect(weeks).toHaveLength(5)
    expect(weeks[0]).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
    expect(weeks[4].at(-1)).toBe('2026-11-01')
  })

  it('uses six weeks when the month starts on a Sunday', () => {
    const weeks = buildMonthGrid('2026-03')
    expect(weeks).toHaveLength(6)
    expect(weeks[0].at(-1)).toBe('2026-03-01')
    expect(weeks[5][0]).toBe('2026-03-30')
  })

  it('crosses into the next year', () => {
    expect(buildMonthGrid('2026-12').at(-1)?.at(-1)).toBe('2027-01-03')
  })
})

describe('weekCounts', () => {
  it('counts repeated post day keys in their Monday-to-Sunday weeks', () => {
    const weeks = [
      ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'],
      ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'],
    ]

    expect(weekCounts(weeks, ['2026-09-28', '2026-10-01', '2026-10-01', '2026-10-11', '2026-10-12'])).toEqual([3, 1])
  })

  it('returns zero for weeks without posts', () => {
    expect(weekCounts([['2026-10-05']], [])).toEqual([0])
  })
})

describe('shiftMonth', () => {
  it('moves across year boundaries', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
  })
})

describe('parseMonth', () => {
  it('accepts YYYY-MM and rejects anything else', () => {
    expect(parseMonth('2026-10')).toBe('2026-10')
    expect(parseMonth('2026-13')).toBeNull()
    expect(parseMonth('oktober')).toBeNull()
    expect(parseMonth(undefined)).toBeNull()
  })
})
