import type { Locale } from '@/i18n/locale-config'
import { dateFormat } from './format'

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/
const DAY_MS = 24 * 60 * 60 * 1000

const toKey = (date: Date) => date.toISOString().slice(0, 10)

function monthStart(month: string): Date {
  const [year, index] = month.split('-').map(Number)
  return new Date(Date.UTC(year, index - 1, 1))
}

/** A `YYYY-MM` value from the URL, or null. */
export function parseMonth(value: string | undefined): string | null {
  return value && MONTH_KEY.test(value) ? value : null
}

export function shiftMonth(month: string, delta: number): string {
  const start = monthStart(month)
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + delta, 1)).toISOString().slice(0, 7)
}

/** e.g. "Oktober 2026" */
export function formatMonth(month: string, locale: Locale = 'id'): string {
  return dateFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(monthStart(month))
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

/** Counts day keys in each week; repeated keys represent separate posts. */
export function weekCounts(weeks: string[][], dayKeys: string[]): number[] {
  const countByDay = new Map<string, number>()
  for (const day of dayKeys) countByDay.set(day, (countByDay.get(day) ?? 0) + 1)
  return weeks.map((week) => week.reduce((count, day) => count + (countByDay.get(day) ?? 0), 0))
}

/** The day `count` days after a `YYYY-MM-DD` key, or before it when negative. */
export function addDays(day: string, count: number): string {
  return toKey(new Date(new Date(`${day}T00:00:00Z`).getTime() + count * DAY_MS))
}

/** e.g. "22 Okt" for a `YYYY-MM-DD` key. */
export function formatShortDay(day: string, locale: Locale = 'id'): string {
  return dateFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`))
}

/** e.g. "14 Oktober 2026" for a `YYYY-MM-DD` key. */
export function formatDay(day: string, locale: Locale = 'id'): string {
  return dateFormat(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`))
}
