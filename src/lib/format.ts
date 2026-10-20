/** PRD default; becomes a setting once the owner can change it. */
export const DEFAULT_TIMEZONE = 'Asia/Jakarta'

const dateTimeFormat = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: DEFAULT_TIMEZONE,
  timeZoneName: 'short',
})

const timeFormat = new Intl.DateTimeFormat('id-ID', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: DEFAULT_TIMEZONE,
})

const shortDateFormat = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'short',
  timeZone: DEFAULT_TIMEZONE,
})

// ponytail: fixed +07:00 works because WIB has no DST; switch to Intl offsets once the timezone is a setting.
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000
const WIB_INPUT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

/** e.g. "13 Desember 2026 pukul 07.00 WIB" */
export function formatDateTime(date: Date): string {
  return dateTimeFormat.format(date)
}

/** e.g. "07.00" */
export function formatTime(date: Date): string {
  return timeFormat.format(date)
}

/** e.g. "13 Des" */
export function formatShortDate(date: Date): string {
  return shortDateFormat.format(date)
}

/** e.g. "18 Okt, 23.15": a message's time in a thread. */
export function formatShortDateTime(date: Date): string {
  return `${formatShortDate(date)}, ${formatTime(date)}`
}

/** A list's time column: today's items show the time, older ones the date. */
export function formatListTime(date: Date, now: Date): string {
  return wibDateKey(date) === wibDateKey(now) ? formatTime(date) : formatShortDate(date)
}

const shiftToWib = (date: Date) => new Date(date.getTime() + WIB_OFFSET_MS).toISOString()

/** The `<input type="datetime-local">` value for a moment, in WIB. */
export function toWibInput(date: Date): string {
  return shiftToWib(date).slice(0, 16)
}

/** The WIB calendar day (`YYYY-MM-DD`) of a moment. */
export function wibDateKey(date: Date): string {
  return shiftToWib(date).slice(0, 10)
}

const SUGGESTED_TIME = '19:00'
/** How close to now a post may still be scheduled. */
export const MIN_LEAD_MS = 30 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

export interface Slot {
  /** `datetime-local` value, in WIB. */
  value: string
  label: string
}

/**
 * The publish time the editor offers in one click: 19.00 WIB today, or tomorrow once that is less than 30 minutes
 * away. ponytail: a fixed evening slot; use the account's own best hours once Analitik reads them.
 */
export function suggestedSlot(now: Date): Slot {
  const today = wibDateKey(now)
  const tonight = new Date(`${today}T${SUGGESTED_TIME}:00+07:00`)
  if (tonight.getTime() - now.getTime() >= MIN_LEAD_MS) return { value: `${today}T${SUGGESTED_TIME}`, label: 'Hari ini 19.00' }
  return { value: `${wibDateKey(new Date(tonight.getTime() + DAY_MS))}T${SUGGESTED_TIME}`, label: 'Besok 19.00' }
}

/**
 * The suggested time on a day picked in Kalender (`YYYY-MM-DD`, from `?tanggal=`), or null when the day is malformed
 * or that time is less than 30 minutes away.
 */
export function slotOn(day: string, now: Date): Slot | null {
  const value = `${day}T${SUGGESTED_TIME}`
  const date = parseWibInput(value)
  if (!date || date.getTime() - now.getTime() < MIN_LEAD_MS) return null
  const suggested = suggestedSlot(now)
  return suggested.value === value ? suggested : { value, label: `${formatShortDate(date)} 19.00` }
}

const slotDayFormat = new Intl.DateTimeFormat('id-ID', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: DEFAULT_TIMEZONE,
})

/** e.g. "Kam, 22 Okt 19.00"; today and tomorrow read "Hari ini 19.00" and "Besok 19.00", like suggestedSlot. */
export function slotLabel(date: Date, now: Date): string {
  const day = wibDateKey(date)
  const prefix =
    day === wibDateKey(now)
      ? 'Hari ini'
      : day === wibDateKey(new Date(now.getTime() + DAY_MS))
        ? 'Besok'
        : slotDayFormat.format(date)
  return `${prefix} ${formatTime(date)}`
}

/** A posting slot as the editor offers it. */
export const toSlot = (date: Date, now: Date): Slot => ({ value: toWibInput(date), label: slotLabel(date, now) })

const longDayFormat = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })

/** e.g. "Kamis, 22 Oktober" for a `YYYY-MM-DD` key. */
export function formatLongDay(day: string): string {
  return longDayFormat.format(new Date(`${day}T00:00:00Z`))
}

const monthFormat = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const dayKeyDate = (day: string) => new Date(`${day}T00:00:00Z`)

/** e.g. "Oktober 2026" for a `YYYY-MM` key. */
export function formatMonth(month: string): string {
  return monthFormat.format(dayKeyDate(`${month}-01`))
}

/** The `YYYY-MM` key `delta` months from `month`. */
export function shiftMonth(month: string, delta: number): string {
  const date = dayKeyDate(`${month}-01`)
  date.setUTCMonth(date.getUTCMonth() + delta)
  return date.toISOString().slice(0, 7)
}

/** The 42 day keys (`YYYY-MM-DD`) of a month's calendar: six Monday-first weeks, padded with the adjacent months. */
export function calendarDays(month: string): string[] {
  const first = dayKeyDate(`${month}-01`)
  const start = first.getTime() - ((first.getUTCDay() + 6) % 7) * DAY_MS
  return Array.from({ length: 42 }, (_, i) => new Date(start + i * DAY_MS).toISOString().slice(0, 10))
}

/** The day key `delta` days from `day`. */
export function shiftDay(day: string, delta: number): string {
  return new Date(dayKeyDate(day).getTime() + delta * DAY_MS).toISOString().slice(0, 10)
}

const TIME_STEP_MIN = 15

/** The `HH:mm` times on a WIB day, every 15 minutes, that are at least 30 minutes away. Empty for past days. */
export function timesOn(day: string, now: Date): string[] {
  const times: string[] = []
  for (let minutes = 0; minutes < 24 * 60; minutes += TIME_STEP_MIN) {
    const time = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
    const date = parseWibInput(`${day}T${time}`)
    if (date && date.getTime() - now.getTime() >= MIN_LEAD_MS) times.push(time)
  }
  return times
}

/** The first WIB day that still has a time to schedule: today, or tomorrow late in the evening. */
export function firstOpenDay(now: Date): string {
  const today = wibDateKey(now)
  return timesOn(today, now).length > 0 ? today : wibDateKey(new Date(now.getTime() + DAY_MS))
}

/** Reads a `datetime-local` value as WIB. Rejects malformed or impossible dates such as 31 February. */
export function parseWibInput(value: string): Date | null {
  if (!WIB_INPUT.test(value)) return null
  const date = new Date(`${value}:00+07:00`)
  return !Number.isNaN(date.getTime()) && toWibInput(date) === value ? date : null
}
