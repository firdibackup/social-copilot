import { describe, expect, it } from 'vitest'
import { safeNext } from './params'

describe('safeNext', () => {
  it('keeps a path on this site, query included', () => {
    expect(safeNext('/buat?id=1')).toBe('/buat?id=1')
  })

  it('falls back to the calendar for anything that could leave the site', () => {
    for (const value of ['//evil.test', '/\\evil.test', 'https://evil.test', 'kalender', '', null]) {
      expect(safeNext(value)).toBe('/kalender')
    }
  })
})
