import { estimatedPosts, type BillingCatalog } from './billing-catalog-options'
import { TRIAL_CHAT_MESSAGES, TRIAL_LIMITS, type TrialStatus } from './billing-options'

/** What the user was doing when the trial ran out; decides the paywall's promise line. */
export const PAYWALL_TRIGGERS = ['chat', 'content', 'revision', 'feature', 'limit'] as const
export type PaywallTrigger = (typeof PAYWALL_TRIGGERS)[number]
export const isPaywallTrigger = (value: unknown): value is PaywallTrigger =>
  typeof value === 'string' && (PAYWALL_TRIGGERS as readonly string[]).includes(value)

export interface PaywallDuration {
  months: number
  /** Percent off, 0 for the plain monthly price. */
  discount: number
  /** What a month costs at this duration. */
  monthly: number
  total: number
}

/** The plan the paywall sells, and the waitlist-only plans it mentions. */
export interface PaywallOffer {
  plan: { id: string; name: string; posts: number }
  durations: PaywallDuration[]
  waitlist: string[]
}

/** The cheapest plan on sale at every duration; null when nothing is on sale. */
export function paywallOffer(catalog: BillingCatalog): PaywallOffer | null {
  const plan = catalog.plans.filter((plan) => plan.active).sort((a, b) => a.priceIdr - b.priceIdr)[0]
  if (!plan || catalog.durations.length === 0) return null
  return {
    plan: { id: plan.id, name: plan.name, posts: estimatedPosts(plan.credits) },
    durations: catalog.durations.map(({ months, discount }) => {
      const total = Math.round(plan.priceIdr * months * (100 - discount) / 100)
      return { months, discount, monthly: Math.round(total / months), total }
    }),
    waitlist: catalog.plans.filter((plan) => !plan.active && plan.waitlist).map((plan) => plan.name),
  }
}

/**
 * Which promise the paywall makes. A caller that knows what the user did says so; otherwise it is the part of the
 * trial that is used up, content first.
 */
export function paywallReason(trigger: PaywallTrigger, status: TrialStatus | null): Exclude<PaywallTrigger, 'limit'> {
  if (trigger !== 'limit') return trigger
  if (!status) return 'feature'
  if (status.contentUsed >= status.contentLimit) return 'content'
  if (status.chatUsed >= TRIAL_CHAT_MESSAGES) return 'chat'
  if (status.revisionUsed >= TRIAL_LIMITS.revision) return 'revision'
  return 'feature'
}
