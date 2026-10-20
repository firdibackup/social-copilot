import { describe, expect, it } from 'vitest'
import {
  countSlots,
  dayKeys,
  emptySlotsOn,
  generateSlots,
  isoWeekday,
  nextEmptySlots,
  parseSlots,
  slotTimesOn,
  type PostingSlot,
} from './schedule-slots'

/** 19.00 on Mon, Tue, Thu, Fri and Sun: the spec's example week. */
const EVENINGS: PostingSlot[] = [{ time: '19:00', days: [1, 2, 4, 5, 7] }]
const wib = (value: string) => new Date(`${value}:00+07:00`)

describe('generateSlots', () => {
  it('spreads 5 posts a week over 19.00 on Mon, Tue, Thu, Fri and Sun', () => {
    expect(generateSlots(5)).toEqual(EVENINGS)
  })

  it('adds 12.00 once 19.00 every day is not enough, sorted by time', () => {
    expect(generateSlots(10)).toEqual([
      { time: '12:00', days: [1, 3, 5] },
      { time: '19:00', days: [1, 2, 3, 4, 5, 6, 7] },
    ])
  })

  it('fills four times a day at most', () => {
    const slots = generateSlots(28)
    expect(slots.map((slot) => slot.time)).toEqual(['08:00', '12:00', '19:00', '21:00'])
    expect(countSlots(slots)).toBe(28)
  })

  it.each([
    [0, 1],
    [1, 1],
    [99, 28],
    [6.6, 7],
  ])('keeps %s posts within 1 to 28 (%s slots)', (postsPerWeek, expected) => {
    expect(countSlots(generateSlots(postsPerWeek))).toBe(expected)
  })
})

describe('parseSlots', () => {
  it('sorts rows by time and dedupes and sorts their days', () => {
    expect(
      parseSlots([
        { time: '19:00', days: [5, 1, 5] },
        { time: '08:30', days: [] },
      ]),
    ).toEqual({
      slots: [
        { time: '08:30', days: [] },
        { time: '19:00', days: [1, 5] },
      ],
    })
  })

  it.each([
    ['a non-array', { time: '19:00', days: [1] }],
    ['a malformed time', [{ time: '7:00', days: [1] }]],
    ['an hour past 23', [{ time: '24:00', days: [1] }]],
    ['a day outside 1–7', [{ time: '19:00', days: [0] }]],
    ['a fractional day', [{ time: '19:00', days: [1.5] }]],
    ['days that are not a list', [{ time: '19:00', days: '1,2' }]],
  ])('rejects %s', (_label, input) => {
    expect(parseSlots(input)).toEqual({ error: 'Slot tidak valid.' })
  })

  it('rejects the same time twice', () => {
    expect(parseSlots([{ time: '19:00', days: [1] }, { time: '19:00', days: [2] }])).toEqual({
      error: 'Jam 19.00 muncul dua kali.',
    })
  })

  it('rejects more than four times a day', () => {
    const rows = ['06:00', '09:00', '12:00', '15:00', '18:00'].map((time) => ({ time, days: [1] }))
    expect(parseSlots(rows)).toEqual({ error: 'Maksimal 4 jam per hari.' })
  })
})

describe('days', () => {
  it('reads ISO weekdays, Monday first', () => {
    expect(isoWeekday('2026-10-19')).toBe(1)
    expect(isoWeekday('2026-10-20')).toBe(2)
    expect(isoWeekday('2026-10-25')).toBe(7)
  })

  it('counts days across a month end', () => {
    expect(dayKeys('2026-10-30', 4)).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'])
  })
})

describe('slotTimesOn', () => {
  it('turns the week into WIB moments, earliest first', () => {
    expect(slotTimesOn(EVENINGS, dayKeys('2026-10-20', 7))).toEqual([
      wib('2026-10-20T19:00'),
      wib('2026-10-22T19:00'),
      wib('2026-10-23T19:00'),
      wib('2026-10-25T19:00'),
      wib('2026-10-26T19:00'),
    ])
  })

  it('orders several times a day', () => {
    const slots: PostingSlot[] = [
      { time: '19:00', days: [2] },
      { time: '08:00', days: [2] },
    ]
    expect(slotTimesOn(slots, ['2026-10-20'])).toEqual([wib('2026-10-20T08:00'), wib('2026-10-20T19:00')])
  })
})

describe('nextEmptySlots', () => {
  it('skips a slot that passed today: at 20.59 on Tuesday the first is Thursday 19.00', () => {
    expect(nextEmptySlots(EVENINGS, [], wib('2026-10-20T20:59'), 2)).toEqual([
      wib('2026-10-22T19:00'),
      wib('2026-10-23T19:00'),
    ])
  })

  it('skips a slot a post already has', () => {
    expect(nextEmptySlots(EVENINGS, [wib('2026-10-22T19:00')], wib('2026-10-20T20:59'), 1)).toEqual([
      wib('2026-10-23T19:00'),
    ])
  })

  it('counts a post as taking the slot only at exactly its time', () => {
    expect(nextEmptySlots(EVENINGS, [wib('2026-10-22T19:01')], wib('2026-10-20T20:59'), 1)).toEqual([
      wib('2026-10-22T19:00'),
    ])
  })

  it('offers today’s slot until two minutes before it', () => {
    expect(nextEmptySlots(EVENINGS, [], wib('2026-10-20T18:58'), 1)).toEqual([wib('2026-10-20T19:00')])
    expect(nextEmptySlots(EVENINGS, [], new Date(wib('2026-10-20T18:58').getTime() + 1), 1)).toEqual([
      wib('2026-10-22T19:00'),
    ])
  })

  it('finds nothing without slots', () => {
    expect(nextEmptySlots([], [], wib('2026-10-20T08:00'), 3)).toEqual([])
    expect(nextEmptySlots([{ time: '19:00', days: [] }], [], wib('2026-10-20T08:00'), 3)).toEqual([])
  })
})

describe('emptySlotsOn', () => {
  it('lists one day’s open slots for Kalender', () => {
    const slots: PostingSlot[] = [
      { time: '08:00', days: [4] },
      { time: '19:00', days: [4] },
    ]
    expect(emptySlotsOn(slots, ['2026-10-22'], [wib('2026-10-22T08:00')], wib('2026-10-20T20:59'))).toEqual([
      wib('2026-10-22T19:00'),
    ])
  })
})
