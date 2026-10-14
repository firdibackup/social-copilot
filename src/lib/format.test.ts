import { describe, expect, it } from 'vitest'
import { parseWibInput, toWibInput, wibDateKey } from './format'

describe('parseWibInput', () => {
  it('reads a datetime-local value as WIB', () => {
    expect(parseWibInput('2026-10-14T19:00')?.toISOString()).toBe('2026-10-14T12:00:00.000Z')
  })

  it('returns null for anything else', () => {
    expect(parseWibInput('')).toBeNull()
    expect(parseWibInput('14/10/2026 19:00')).toBeNull()
    expect(parseWibInput('2026-13-40T25:00')).toBeNull()
  })
})

describe('toWibInput', () => {
  it('formats a moment as a WIB datetime-local value', () => {
    expect(toWibInput(new Date('2026-10-14T12:00:00Z'))).toBe('2026-10-14T19:00')
  })
})

describe('wibDateKey', () => {
  it('uses the WIB calendar day, which starts at 17:00 UTC', () => {
    expect(wibDateKey(new Date('2026-10-14T16:59:00Z'))).toBe('2026-10-14')
    expect(wibDateKey(new Date('2026-10-14T17:00:00Z'))).toBe('2026-10-15')
  })
})
