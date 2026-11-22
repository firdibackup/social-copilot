'use server'

import { trialStatus } from '@/lib/ai'
import { requireUser } from '@/lib/auth'
import { getDisplayedBillingCatalog } from '@/lib/billing-catalog'
import type { TrialStatus } from '@/lib/billing-options'
import { describeError } from '@/lib/errors'
import { logFunnel } from '@/lib/funnel'
import { isPaywallTrigger, paywallOffer, type PaywallOffer } from '@/lib/paywall-options'

export interface PaywallData {
  offer: PaywallOffer | null
  /** Null for a paying user, who sees the paywall only by a stale answer. */
  status: TrialStatus | null
}

/** What the paywall shows: the plan on sale and what the user used of the trial. Counts the paywall as shown. */
export async function paywallAction(trigger: unknown): Promise<PaywallData | null> {
  const userId = await requireUser()
  try {
    const [catalog, status] = await Promise.all([getDisplayedBillingCatalog(), trialStatus(userId)])
    await logFunnel(userId, 'paywall_shown', isPaywallTrigger(trigger) ? trigger : 'limit')
    return { offer: paywallOffer(catalog), status }
  } catch (error) {
    console.error('[paywall] gagal memuat:', describeError(error))
    return null
  }
}

/** The paywall's button was pressed, with the duration picked. */
export async function paywallClickAction(trigger: unknown, months: unknown): Promise<void> {
  const userId = await requireUser()
  const picked = typeof months === 'number' && Number.isInteger(months) && months > 0 && months <= 36 ? months : 0
  await logFunnel(userId, 'paywall_cta', `${isPaywallTrigger(trigger) ? trigger : 'limit'}:${picked}`)
}
