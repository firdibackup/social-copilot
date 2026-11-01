import { describe, expect, it, vi } from 'vitest'
import { isTrialLimit } from './upgrade-dialog'
import { trialLimitMessage } from '@/lib/billing-options'

vi.mock('./confirm-dialog', () => ({ confirmDialog: vi.fn() }))

describe('isTrialLimit', () => {
  it('recognizes the trial limit answer in both languages', () => {
    expect(isTrialLimit(trialLimitMessage('id'))).toBe(true)
    expect(isTrialLimit(` ${trialLimitMessage('en')} `)).toBe(true)
    expect(isTrialLimit(new Error(trialLimitMessage('id')))).toBe(true)
  })

  it('says 0 credits are left and never promises speed', () => {
    expect(trialLimitMessage('id')).toContain('Kredit gratis kamu habis')
    expect(trialLimitMessage('id')).toContain('sisa 0')
    expect(trialLimitMessage('id')).not.toMatch(/lebih cepat/i)
  })

  it('does not mistake other errors for the trial limit', () => {
    for (const error of [null, undefined, '', 'Kuota AI tidak cukup.', {}]) expect(isTrialLimit(error)).toBe(false)
  })
})
