const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/
const DAY_MS = 24 * 60 * 60 * 1000

const monthFormat = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' })

const toKey = (date: Date) => date.toISOString().slice(0, 10)

function monthStart(month: string): Date {
  const [year, index] = month.split('-').map(Number)
  return new Date(Date.UTC(year, index - 1, 1))
}

/** A `YYYY-MM` value from the URL, or null. */
export function parseMonth(value: string | undefined): string | null {
  return value && MONTH.test(value) ? value : null
}

export function shiftMonth(month: string, delta: number): string {
  const start = monthStart(month)
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + delta, 1)).toISOString().slice(0, 7)
}

/** e.g. "Oktober 2026" */
export function formatMonth(month: string): string {
  return monthFormat.format(monthStart(month))
}

/** `YYYY-MM-DD` keys covering the month in whole weeks, Monday first. */
export function buildMonthGrid(month: string): string[][] {
  const first = monthStart(month)
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0))
  const mondayOffset = (first.getUTCDay() + 6) % 7

  const weeks: string[][] = []
  let time = first.getTime() - mondayOffset * DAY_MS
  while (time <= last.getTime()) {
    const week: string[] = []
    for (let day = 0; day < 7; day++, time += DAY_MS) week.push(toKey(new Date(time)))
    weeks.push(week)
  }
  return weeks
}

const dayFormat = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

/** e.g. "14 Oktober 2026" for a `YYYY-MM-DD` key. */
export function formatDay(day: string): string {
  return dayFormat.format(new Date(`${day}T00:00:00Z`))
}
