import { describe, expect, it } from 'vitest'
import { addBillingMonths, assertPayableTotals, billingCycle, DEFAULT_CATALOG, MIN_PRICE_IDR, parseBillingCatalog, quotePurchase } from './billing-catalog-options'

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
    const cheapest = structuredClone(DEFAULT_CATALOG)
    cheapest.plans[0].priceIdr = MIN_PRICE_IDR
    cheapest.durations = [{ months: 1, discount: 0 }]
    expect(parseBillingCatalog(cheapest).plans[0].priceIdr).toBe(MIN_PRICE_IDR)
    cheapest.plans[0].priceIdr = 1
    expect(() => parseBillingCatalog(cheapest)).toThrow('minimal Rp')
    cheapest.plans[0].priceIdr = MIN_PRICE_IDR
    cheapest.durations = [{ months: 1, discount: 10 }]
    expect(parseBillingCatalog(cheapest).durations[0].discount).toBe(10)
    expect(() => assertPayableTotals(cheapest)).toThrow('setelah diskon')
    cheapest.plans[0].active = false
    expect(() => assertPayableTotals(cheapest)).not.toThrow()
    expect(() => assertPayableTotals(DEFAULT_CATALOG)).not.toThrow()
    for (const mutate of [
      (c: typeof DEFAULT_CATALOG) => { c.plans[0].priceIdr = -1 },
      (c: typeof DEFAULT_CATALOG) => { c.plans[0].priceIdr = 0 },
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
  it('gives a task added after the catalog was saved its default rate', () => {
    const catalog = structuredClone(DEFAULT_CATALOG) as { rates: Record<string, number> }
    delete catalog.rates.reference_labels
    expect(parseBillingCatalog(catalog).rates.reference_labels).toBe(DEFAULT_CATALOG.rates.reference_labels)
  })
})
