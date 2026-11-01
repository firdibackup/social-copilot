import { describe, expect, it } from 'vitest'
import { handleIssue, normalizeHandle, trialHref } from './instagram-handle'

describe('hero Instagram handle', () => {
  it('normalizes and validates like Instagram usernames', () => {
    expect(normalizeHandle('  @@kopi.kita ')).toBe('kopi.kita')
    expect(handleIssue('')).toBeNull()
    expect(handleIssue('@kopi_kita.id')).toBeNull()
    expect(handleIssue('kopi kita')).toBe('space')
    expect(handleIssue('kopi-kita')).toBe('invalid')
    expect(handleIssue('a'.repeat(31))).toBe('invalid')
  })

  it('sends the trial to sign-up, carrying the handle when there is one', () => {
    expect(trialHref('')).toBe('/daftar')
    expect(trialHref('  ')).toBe('/daftar')
    expect(trialHref(' @Kopi.Kita ')).toBe('/daftar?instagram=Kopi.Kita')
  })
})
