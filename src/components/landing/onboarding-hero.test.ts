import { describe, expect, it } from 'vitest'
import { handleIssue, normalizeHandle } from './onboarding-hero'

describe('onboarding Instagram handle', () => {
  it('normalizes and validates like Instagram usernames', () => {
    expect(normalizeHandle('  @@kopi.kita ')).toBe('kopi.kita')
    expect(handleIssue('')).toBeNull()
    expect(handleIssue('@kopi_kita.id')).toBeNull()
    expect(handleIssue('kopi kita')).toBe('space')
    expect(handleIssue('kopi-kita')).toBe('invalid')
    expect(handleIssue('a'.repeat(31))).toBe('invalid')
  })
})
