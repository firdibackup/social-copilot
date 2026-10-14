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

/** e.g. "13 Desember 2026 pukul 07.00 WIB" */
export function formatDateTime(date: Date): string {
  return dateTimeFormat.format(date)
}
