import type { LoggedTask } from './ai'

/**
 * The one plan, shared by the server and the subscription page. A table of plans comes with the second plan.
 * Credits are the period's AI allowance: 1,000 credits are 100%.
 */
export const PLAN = { name: 'Social Copilot 30 hari', priceIdr: 99_000, days: 30, credits: 1_000 } as const

/** What one request of each kind costs. Images cost the most at 9Router, so they weigh the most. */
export const TASK_CREDITS: Record<LoggedTask, number> = {
  captions: 2,
  ideas: 2,
  rewrite: 2,
  hashtags: 2,
  image_plan: 1,
  brand_profile: 5,
  brand_visual: 10,
  image: 20,
}

/** Share of the period's credits spent, 0–100, rounded down so 100% means truly spent. */
export const usedPercent = (used: number) => Math.min(100, Math.floor((used / PLAN.credits) * 100))

/** e.g. "Rp99.000" */
export const formatRupiah = (amount: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount)
