/**
 * Posting slots: the account's weekly recurring publish times in WIB, the empty chairs Kalender shows and Buat fills.
 * A slot is never a post. A post keeps its absolute time, so changing the slots moves nothing. Pure, so the browser,
 * the server and the tests share it.
 */
import { isObject } from './brand-options'
import { parseWibInput, wibDateKey } from './format'

export interface PostingSlot {
  /** `HH:MM`, WIB. */
  time: string
  /** ISO weekdays, 1 = Monday, ascending. */
  days: number[]
}

/** Kalender's columns and the slot table's header, Monday first; index + 1 is the ISO weekday. */
export const WEEKDAY_SHORT = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'] as const

/** Rows of the slot table: four times a day at most. */
export const MAX_SLOT_TIMES = 4
export const MIN_POSTS_PER_WEEK = 1
/** Four a day, every day. */
export const MAX_POSTS_PER_WEEK = MAX_SLOT_TIMES * 7
/** How far ahead Buat looks for an empty slot. */
export const SLOT_LOOKAHEAD_DAYS = 60
/** A slot closer than this is no longer offered: the worker needs a moment, and so does the owner. */
export const MIN_SLOT_LEAD_MS = 2 * 60 * 1000

/** The preset fills a day in this order: evening prime time first. */
const PRESET_TIMES = ['19:00', '12:00', '08:00', '21:00']
/** Days for n posts a week, spread as evenly as the week allows. */
const SPREAD_DAYS: Record<number, number[]> = {
  1: [4],
  2: [2, 5],
  3: [1, 3, 5],
  4: [1, 2, 4, 5],
  5: [1, 2, 4, 5, 7],
  6: [1, 2, 3, 4, 5, 7],
  7: [1, 2, 3, 4, 5, 6, 7],
}
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const DAY_MS = 24 * 60 * 60 * 1000

export const countSlots = (slots: readonly PostingSlot[]) => slots.reduce((sum, slot) => sum + slot.days.length, 0)

const byTime = (a: PostingSlot, b: PostingSlot) => a.time.localeCompare(b.time)

/**
 * The preset for `postsPerWeek`: 19.00 on days spread over the week, then 12.00, 08.00 and 21.00 once a day is not
 * enough. 5 a week is 19.00 on Mon, Tue, Thu, Fri and Sun.
 */
export function generateSlots(postsPerWeek: number): PostingSlot[] {
  let remaining = Math.min(Math.max(Math.round(postsPerWeek), MIN_POSTS_PER_WEEK), MAX_POSTS_PER_WEEK)
  const slots: PostingSlot[] = []
  for (const time of PRESET_TIMES) {
    if (remaining <= 0) break
    const count = Math.min(7, remaining)
    slots.push({ time, days: SPREAD_DAYS[count] })
    remaining -= count
  }
  return slots.sort(byTime)
}

/** Validates what the slot table sent: at most 4 distinct times, each with its weekdays, sorted by time. */
export function parseSlots(input: unknown): { slots: PostingSlot[] } | { error: string } {
  if (!Array.isArray(input)) return { error: 'Slot tidak valid.' }
  if (input.length > MAX_SLOT_TIMES) return { error: `Maksimal ${MAX_SLOT_TIMES} jam per hari.` }
  const slots: PostingSlot[] = []
  for (const item of input) {
    if (!isObject(item) || typeof item.time !== 'string' || !TIME.test(item.time) || !Array.isArray(item.days)) {
      return { error: 'Slot tidak valid.' }
    }
    const time = item.time
    if (slots.some((slot) => slot.time === time)) return { error: `Jam ${time.replace(':', '.')} muncul dua kali.` }
    const days: unknown[] = item.days
    if (!days.every((day): day is number => typeof day === 'number' && Number.isInteger(day) && day >= 1 && day <= 7)) {
      return { error: 'Slot tidak valid.' }
    }
    slots.push({ time, days: [...new Set(days)].sort((a, b) => a - b) })
  }
  return { slots: slots.sort(byTime) }
}

/** Stored slots, or null when they no longer pass the checks: the account then falls back to its default. */
export function readStoredSlots(value: unknown): PostingSlot[] | null {
  const parsed = parseSlots(value)
  return 'slots' in parsed ? parsed.slots : null
}

/** ISO weekday (1 = Monday) of a `YYYY-MM-DD` day. */
export const isoWeekday = (day: string) => ((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7) + 1

/** `count` consecutive day keys from `first`. */
export function dayKeys(first: string, count: number): string[] {
  const start = new Date(`${first}T00:00:00Z`).getTime()
  return Array.from({ length: count }, (_, index) => new Date(start + index * DAY_MS).toISOString().slice(0, 10))
}

/** Every slot time on these WIB days, earliest first. */
export function slotTimesOn(slots: readonly PostingSlot[], days: readonly string[]): Date[] {
  return days
    .flatMap((day) => {
      const weekday = isoWeekday(day)
      return slots.flatMap((slot) => {
        const at = slot.days.includes(weekday) ? parseWibInput(`${day}T${slot.time}`) : null
        return at ? [at] : []
      })
    })
    .sort((a, b) => a.getTime() - b.getTime())
}

/** The empty slots on these days, earliest first: far enough ahead, and no post (any platform) at exactly that time. */
export function emptySlotsOn(
  slots: readonly PostingSlot[],
  days: readonly string[],
  taken: readonly Date[],
  now: Date,
): Date[] {
  const takenTimes = new Set(taken.map((date) => date.getTime()))
  return slotTimesOn(slots, days).filter(
    (at) => at.getTime() - now.getTime() >= MIN_SLOT_LEAD_MS && !takenTimes.has(at.getTime()),
  )
}

/** The next `limit` empty slots from now, within SLOT_LOOKAHEAD_DAYS. Buat's one click takes the first. */
export function nextEmptySlots(slots: readonly PostingSlot[], taken: readonly Date[], now: Date, limit: number): Date[] {
  return emptySlotsOn(slots, dayKeys(wibDateKey(now), SLOT_LOOKAHEAD_DAYS), taken, now).slice(0, limit)
}
