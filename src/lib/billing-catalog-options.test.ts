import { describe, expect, it } from 'vitest'
import {
  addBillingMonths, assertPayableTotals, billingCycle, DEFAULT_CATALOG, defaultDescription, estimatedPosts, MIN_PRICE_IDR, parseBillingCatalog, planFeatures,
  quotaMultiple, quotePurchase, shownPlans, type CatalogPlan, type PlanFeature,
} from './billing-catalog-options'
import idBilling from '../../messages/id/billing.json'
import enBilling from '../../messages/en/billing.json'
import idLanding from '../../messages/id/landing.json'
import enLanding from '../../messages/en/landing.json'

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
    expect([2_100, 2_500, 12_500].map(estimatedPosts)).toEqual([20, 24, 121])
    const lite = { ...DEFAULT_CATALOG.plans[0], id: 'lite' }
    const waiting = { ...DEFAULT_CATALOG, plans: [lite, { ...DEFAULT_CATALOG.plans[1], active: false, waitlist: true }] }
    expect(shownPlans(parseBillingCatalog(waiting)).map((plan) => plan.id)).toEqual(['lite', 'max'])
    expect(() => quotePurchase(waiting, 1, 'max', 1)).toThrow()
    expect(() => parseBillingCatalog({ ...DEFAULT_CATALOG, plans: [{ ...lite, waitlist: 'ya' }] })).toThrow()
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

describe('plan cards', () => {
  const plan = (overrides: Partial<CatalogPlan>): CatalogPlan => ({
    id: 'lite', name: 'Lite', priceIdr: 59_000, days: 30, credits: 2_100, active: true, description: 'Untuk mulai rutin.',
    chatDaily: 20, researchDaily: 0, prioritySupport: false, earlyAccess: false, ...overrides,
  })
  const pro = plan({ id: 'pro', name: 'Pro', credits: 2_500, active: false, waitlist: true, description: 'Untuk rutin membuat dan menjadwalkan konten.' })
  const max = plan({ id: 'max', name: 'Max', credits: 12_500, active: false, waitlist: true, prioritySupport: true, earlyAccess: true,
    description: 'Lebih banyak ruang untuk produksi dan riset konten.' })

  it('lists the same features for a plan wherever its card is shown', () => {
    expect(planFeatures(plan({}))).toEqual(['chatbot', 'creation', 'calendar', 'accounts', 'analytics'])
    // A waitlist plan adds DM and Auto DM; Max stands on Pro's list and adds its own extras.
    expect(planFeatures(pro)).toEqual(['chatbot', 'creation', 'calendar', 'accounts', 'analytics', 'dmSoon'])
    expect(planFeatures(max)).toEqual(['allPro', 'dmSoon', 'support', 'earlyAccess'])
    expect(planFeatures({ ...max, active: true })).toEqual(['allPro', 'support', 'earlyAccess'])
  })

  it('replaces only the default Pro and Max descriptions with the line that states their posts', () => {
    expect(defaultDescription(pro)).toBe('pro')
    expect(defaultDescription(max)).toBe('max')
    expect(defaultDescription({ ...pro, description: 'Tulisan admin sendiri.' })).toBeNull()
    expect(defaultDescription(plan({}))).toBeNull()
    expect(defaultDescription({ ...pro, credits: 10 })).toBeNull()
  })

  it('names a whole multiple of Pro’s quota, and nothing otherwise', () => {
    const catalog = { ...DEFAULT_CATALOG, plans: [plan({}), pro, max] }
    expect(quotaMultiple(catalog, max)).toBe(5)
    expect(quotaMultiple(catalog, pro)).toBeNull()
    expect(quotaMultiple(catalog, plan({}))).toBeNull()
    expect(quotaMultiple(catalog, { ...max, credits: 3_000 })).toBeNull()
    expect(quotaMultiple({ ...catalog, plans: [max] }, max)).toBeNull()
  })

  it('keeps the card texts of /langganan word for word those of the homepage, and silent about Meta', () => {
    const features: PlanFeature[] = ['chatbot', 'creation', 'calendar', 'accounts', 'analytics', 'allPro', 'dmSoon', 'support', 'earlyAccess']
    for (const [landing, billing] of [[idLanding, idBilling], [enLanding, enBilling]] as const) {
      expect(Object.keys(billing.subscribe.features).sort()).toEqual([...features].sort())
      for (const feature of features) expect(billing.subscribe.features[feature], feature).toBe(landing.pricing.features[feature])
      expect(billing.subscribe.descriptions).toEqual(landing.pricing.descriptions)
      expect(billing.subscribe.multiplier).toBe(landing.pricing.multiplier)
      expect(JSON.stringify([billing.subscribe, landing.pricing])).not.toMatch(/Meta/)
    }
  })
})
