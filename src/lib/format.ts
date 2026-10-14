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

const shiftToWib = (date: Date) => new Date(date.getTime() + WIB_OFFSET_MS).toISOString()

/** The `<input type="datetime-local">` value for a moment, in WIB. */
export function toWibInput(date: Date): string {
  return shiftToWib(date).slice(0, 16)
}

/** The WIB calendar day (`YYYY-MM-DD`) of a moment. */
export function wibDateKey(date: Date): string {
  return shiftToWib(date).slice(0, 10)
}

/** Reads a `datetime-local` value as WIB. Rejects malformed or impossible dates such as 31 February. */
export function parseWibInput(value: string): Date | null {
  if (!WIB_INPUT.test(value)) return null
  const date = new Date(`${value}:00+07:00`)
  return !Number.isNaN(date.getTime()) && toWibInput(date) === value ? date : null
}
