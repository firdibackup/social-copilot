import { describe, expect, it, vi } from 'vitest'
import { isTrialLimit } from './upgrade-dialog'
import { trialLimitMessage } from '@/lib/billing-options'

vi.mock('./confirm-dialog', () => ({ confirmDialog: vi.fn() }))
vi.mock('@/app/paywall/actions', () => ({ paywallAction: vi.fn(), paywallClickAction: vi.fn() }))

describe('isTrialLimit', () => {
  it('recognizes the trial limit answer in both languages', () => {
    expect(isTrialLimit(trialLimitMessage('id'))).toBe(true)
    expect(isTrialLimit(` ${trialLimitMessage('en')} `)).toBe(true)
    expect(isTrialLimit(new Error(trialLimitMessage('id')))).toBe(true)
  })

  it('still recognizes the answer of a worker deployed before the free-access change', () => {
    expect(isTrialLimit('Kredit gratis kamu habis (sisa 0). Upgrade ke Pro atau Max untuk lanjut.')).toBe(true)
  })

  it('never promises speed', () => {
    expect(trialLimitMessage('id')).toContain('Jatah gratis kamu sudah habis')
    expect(trialLimitMessage('id')).not.toMatch(/lebih cepat/i)
  })

  it('does not mistake other errors for the trial limit', () => {
    for (const error of [null, undefined, '', 'Kuota AI tidak cukup.', {}]) expect(isTrialLimit(error)).toBe(false)
  })
})
