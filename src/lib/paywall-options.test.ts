import { describe, expect, it } from 'vitest'
import { DEFAULT_CATALOG, type BillingCatalog } from './billing-catalog-options'
import { paywallOffer, paywallReason } from './paywall-options'

const lite = { ...DEFAULT_CATALOG.plans[0], id: 'lite', name: 'Lite', priceIdr: 59_000, credits: 2_100 }
const catalog: BillingCatalog = {
  ...DEFAULT_CATALOG,
  plans: [
    { ...DEFAULT_CATALOG.plans[0], active: false, waitlist: true },
    lite,
    { ...DEFAULT_CATALOG.plans[1], active: false, waitlist: true },
  ],
}

describe('paywallOffer', () => {
  it('sells the cheapest plan on sale and names the waitlist plans', () => {
    const offer = paywallOffer(catalog)
    expect(offer?.plan).toEqual({ id: 'lite', name: 'Lite', posts: 20 })
    expect(offer?.waitlist).toEqual(['Pro', 'Max'])
  })

  it('prices every duration with its discount', () => {
    expect(paywallOffer(catalog)?.durations).toEqual([
      { months: 1, discount: 0, monthly: 59_000, total: 59_000 },
      { months: 3, discount: 5, monthly: 56_050, total: 168_150 },
      { months: 6, discount: 11, monthly: 52_510, total: 315_060 },
      { months: 12, discount: 17, monthly: 48_970, total: 587_640 },
    ])
  })

  it('has nothing to offer when no plan is on sale', () => {
    expect(paywallOffer({ ...catalog, plans: catalog.plans.filter((plan) => !plan.active) })).toBeNull()
  })
})

describe('paywallReason', () => {
  const fresh = { contentLimit: 2, contentUsed: 0, chatUsed: 0, revisionUsed: 0, connected: false }

  it('keeps what the caller knows', () => {
    expect(paywallReason('chat', { ...fresh, contentUsed: 2 })).toBe('chat')
  })

  it('otherwise names the used-up part, content first', () => {
    expect(paywallReason('limit', { ...fresh, contentUsed: 2, chatUsed: 10 })).toBe('content')
    expect(paywallReason('limit', { ...fresh, chatUsed: 10 })).toBe('chat')
    expect(paywallReason('limit', { ...fresh, revisionUsed: 2 })).toBe('revision')
    expect(paywallReason('limit', fresh)).toBe('feature')
    expect(paywallReason('limit', null)).toBe('feature')
  })
})
