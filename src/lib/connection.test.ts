import { describe, expect, it } from 'vitest'
import { shouldRefreshToken } from './connection'

const NOW = new Date('2026-10-14T00:00:00Z')
const HOUR_MS = 60 * 60 * 1000
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * HOUR_MS)
const daysFromNow = (days: number) => new Date(NOW.getTime() + days * 24 * HOUR_MS)

describe('shouldRefreshToken', () => {
  it('keeps a token refreshed less than 24 hours ago', () => {
    expect(shouldRefreshToken(hoursAgo(23), daysFromNow(3), NOW)).toBe(false)
  })

  it('refreshes a token older than 24 hours that expires within 7 days', () => {
    expect(shouldRefreshToken(hoursAgo(25), daysFromNow(6), NOW)).toBe(true)
  })

  it('keeps a token with more than 7 days left', () => {
    expect(shouldRefreshToken(hoursAgo(48), daysFromNow(30), NOW)).toBe(false)
  })
})
