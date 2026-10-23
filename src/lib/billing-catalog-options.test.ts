import { describe, expect, it } from 'vitest'
import { addBillingMonths, billingCycle, DEFAULT_CATALOG, parseBillingCatalog, quotePurchase } from './billing-catalog-options'

describe('purchased entitlements', () => {
  it('prices all durations from the catalog and locks a separate plan snapshot', () => {
    expect([1, 3, 6, 12].map((months) => quotePurchase(DEFAULT_CATALOG, 1, 'pro', months).total)).toEqual([139000, 396150, 742260, 1384440])
    expect([1, 3, 6, 12].map((months) => quotePurchase(DEFAULT_CATALOG, 1, 'max', months).total)).toEqual([349000, 994650, 1863660, 3476040])
    const catalog = structuredClone(DEFAULT_CATALOG)
    const bought = quotePurchase(catalog, 1, 'pro', 12)
    catalog.plans[0].credits = 999
    expect(bought.plan.credits).toBe(2500)
    expect(() => quotePurchase(catalog, 1, 'pro', 2)).toThrow()
    catalog.plans[0].active = false
    expect(() => quotePurchase(catalog, 1, 'pro', 1)).toThrow()
  })
  it('resets on anchored calendar months across February, leap years, and exact boundaries', () => {
    const start = new Date('2028-01-31T10:00:00Z')
    const end = addBillingMonths(start, 12)
    expect(addBillingMonths(start, 1).toISOString()).toBe('2028-02-29T10:00:00.000Z')
    expect(billingCycle(start, end, new Date('2028-03-30T10:00:00Z')).start.toISOString()).toBe('2028-02-29T10:00:00.000Z')
    expect(billingCycle(start, end, new Date('2028-03-31T10:00:00Z')).end.toISOString()).toBe('2028-04-30T10:00:00.000Z')
  })
  it('rejects malformed prices, duplicate IDs, unsafe support URLs and double charging slides', () => {
    expect(parseBillingCatalog(DEFAULT_CATALOG)).toEqual(DEFAULT_CATALOG)
    for (const mutate of [
      (c: typeof DEFAULT_CATALOG) => { c.plans[0].priceIdr = -1 },
      (c: typeof DEFAULT_CATALOG) => { c.plans[1].id = 'pro' },
      (c: typeof DEFAULT_CATALOG) => { c.supportUrl = 'javascript:alert(1)' },
      (c: typeof DEFAULT_CATALOG) => { c.rates.content_slide = 20 },
      (c: typeof DEFAULT_CATALOG) => { c.durations[0].discount = 101 },
    ]) {
      const catalog = structuredClone(DEFAULT_CATALOG)
      mutate(catalog)
      expect(() => parseBillingCatalog(catalog)).toThrow()
    }
  })
})
