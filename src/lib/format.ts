import { intlLocale, type Locale } from '@/i18n/locale-config'

/** PRD default; becomes a setting once the owner can change it. */
export const DEFAULT_TIMEZONE = 'Asia/Jakarta'

/** Every formatter below takes the UI locale; Indonesian is the default so existing callers read as before. */
const formatters = new Map<string, Intl.DateTimeFormat>()

/** One cached `Intl.DateTimeFormat` per locale and options. */
export function dateFormat(locale: Locale, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`
  let format = formatters.get(key)
  if (!format) {
    format = new Intl.DateTimeFormat(intlLocale(locale), options)
    formatters.set(key, format)
  }
  return format
}

const DATE_TIME: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: DEFAULT_TIMEZONE,
  timeZoneName: 'short',
}
const TIME: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', timeZone: DEFAULT_TIMEZONE }
const SHORT_DATE: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', timeZone: DEFAULT_TIMEZONE }

const RELATIVE_DAY: Record<Locale, { today: string; tomorrow: string }> = {
  id: { today: 'Hari ini', tomorrow: 'Besok' },
  en: { today: 'Today', tomorrow: 'Tomorrow' },
}

// ponytail: fixed +07:00 works because WIB has no DST; switch to Intl offsets once the timezone is a setting.
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000
const WIB_INPUT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

/** e.g. "13 Desember 2026 pukul 07.00 WIB" */
export function formatDateTime(date: Date, locale: Locale = 'id'): string {
  return dateFormat(locale, DATE_TIME).format(date)
}

/** e.g. "07.00" */
export function formatTime(date: Date, locale: Locale = 'id'): string {
  return dateFormat(locale, TIME).format(date)
}

/** e.g. "13 Des" */
export function formatShortDate(date: Date, locale: Locale = 'id'): string {
  return dateFormat(locale, SHORT_DATE).format(date)
}

/** e.g. "18 Okt, 23.15": a message's time in a thread. */
export function formatShortDateTime(date: Date, locale: Locale = 'id'): string {
  return `${formatShortDate(date, locale)}, ${formatTime(date, locale)}`
}

/** A list's time column: today's items show the time, older ones the date. */
export function formatListTime(date: Date, now: Date, locale: Locale = 'id'): string {
  return wibDateKey(date) === wibDateKey(now) ? formatTime(date, locale) : formatShortDate(date, locale)
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
export function suggestedSlot(now: Date, locale: Locale = 'id'): Slot {
  const today = wibDateKey(now)
  const tonight = new Date(`${today}T${SUGGESTED_TIME}:00+07:00`)
  const time = formatTime(tonight, locale)
  const words = RELATIVE_DAY[locale]
  if (tonight.getTime() - now.getTime() >= MIN_LEAD_MS) return { value: `${today}T${SUGGESTED_TIME}`, label: `${words.today} ${time}` }
  return { value: `${wibDateKey(new Date(tonight.getTime() + DAY_MS))}T${SUGGESTED_TIME}`, label: `${words.tomorrow} ${time}` }
}

/**
 * The suggested time on a day picked in Kalender (`YYYY-MM-DD`, from `?tanggal=`), or null when the day is malformed
 * or that time is less than 30 minutes away.
 */
export function slotOn(day: string, now: Date, locale: Locale = 'id'): Slot | null {
  const value = `${day}T${SUGGESTED_TIME}`
  const date = parseWibInput(value)
  if (!date || date.getTime() - now.getTime() < MIN_LEAD_MS) return null
  const suggested = suggestedSlot(now, locale)
  return suggested.value === value ? suggested : { value, label: `${formatShortDate(date, locale)} ${formatTime(date, locale)}` }
}

const SLOT_DAY: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short', timeZone: DEFAULT_TIMEZONE }

/** e.g. "Kam, 22 Okt 19.00"; today and tomorrow read "Hari ini 19.00" and "Besok 19.00", like suggestedSlot. */
export function slotLabel(date: Date, now: Date, locale: Locale = 'id'): string {
  const day = wibDateKey(date)
  const words = RELATIVE_DAY[locale]
  const prefix =
    day === wibDateKey(now)
      ? words.today
      : day === wibDateKey(new Date(now.getTime() + DAY_MS))
        ? words.tomorrow
        : dateFormat(locale, SLOT_DAY).format(date)
  return `${prefix} ${formatTime(date, locale)}`
}

/** A posting slot as the editor offers it. */
export const toSlot = (date: Date, now: Date, locale: Locale = 'id'): Slot => ({
  value: toWibInput(date),
  label: slotLabel(date, now, locale),
})

const LONG_DAY: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }

/** e.g. "Kamis, 22 Oktober" for a `YYYY-MM-DD` key. */
export function formatLongDay(day: string, locale: Locale = 'id'): string {
  return dateFormat(locale, LONG_DAY).format(new Date(`${day}T00:00:00Z`))
}

const MONTH: Intl.DateTimeFormatOptions = { month: 'long', year: 'numeric', timeZone: 'UTC' }
const dayKeyDate = (day: string) => new Date(`${day}T00:00:00Z`)

/** e.g. "Oktober 2026" for a `YYYY-MM` key. */
export function formatMonth(month: string, locale: Locale = 'id'): string {
  return dateFormat(locale, MONTH).format(dayKeyDate(`${month}-01`))
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
