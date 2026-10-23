import { describe, expect, it } from 'vitest'
import { DEFAULT_CATALOG } from './billing-catalog-options'
import { canUpgrade, quoteUpgrade, type PaidTerm } from './billing-upgrade-options'

const [pro, max] = DEFAULT_CATALOG.plans
const term = (overrides: Partial<PaidTerm> = {}): PaidTerm => ({ id: 'term', period_start: '2026-04-01T00:00:00Z', period_end: '2026-05-01T00:00:00Z', snapshot: { plan: pro, months: 1, discount: 0 }, entitlement_plan: null, ...overrides })

describe('immediate upgrade proration', () => {
  it('charges half the price difference halfway through a 30-day month', () => {
    const quote = quoteUpgrade([term()], max, 1, new Date('2026-04-16T00:00:00Z'))
    expect(quote.total).toBe(105000)
    expect(quote.additionalCredits).toBe(10000)
    expect(quote.activeUntil).toBe('2026-05-01T00:00:00.000Z')
  })
  it('includes prepaid future months and retains their original discount', () => {
    const quote = quoteUpgrade([term({ period_end: '2026-07-01T00:00:00Z', snapshot: { plan: pro, months: 3, discount: 5 } })], max, 2, new Date('2026-04-16T00:00:00Z'))
    expect(quote.total).toBe(498750)
    expect(quote.terms[0].from).toEqual(pro)
  })
  it('anchors February and March cycles to January 31', () => {
    const quote = quoteUpgrade([term({ period_start: '2026-01-31T00:00:00Z', period_end: '2026-03-31T00:00:00Z' })], max, 1, new Date('2026-02-28T00:00:00Z'))
    expect(quote.total).toBe(210000)
  })
  it('prices every future purchased term separately', () => {
    const quote = quoteUpgrade([term(), term({ id: 'next', period_start: '2026-05-01T00:00:00Z', period_end: '2026-06-01T00:00:00Z' })], max, 1, new Date('2026-04-16T00:00:00Z'))
    expect(quote.total).toBe(315000)
    expect(quote.terms).toHaveLength(2)
  })
  it('rejects expired access, same-tier repurchases and feature downgrades', () => {
    expect(() => quoteUpgrade([term()], max, 1, new Date('2026-05-01T00:00:00Z'))).toThrow('berakhir')
    expect(() => quoteUpgrade([term({ entitlement_plan: max })], max, 1, new Date('2026-04-16T00:00:00Z'))).toThrow('bukan upgrade')
    expect(canUpgrade(pro, { ...max, chatDaily: 0 })).toBe(false)
  })
})
