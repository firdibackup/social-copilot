import type { LoggedTask } from './ai'

/**
 * The one plan, shared by the server and the subscription page. A table of plans comes with the second plan.
 * Credits are the period's AI allowance: 10,000 credits are 100%, so a 5-slide post (103 credits) is about 1%.
 */
export const PLAN = { name: 'Social Copilot 30 hari', priceIdr: 99_000, days: 30, credits: 10_000 } as const

/** One image. Images cost the most at 9Router, so they weigh the most. */
export const IMAGE_CREDITS = 20

/**
 * What one request of each kind costs. A new post is paid once, up front: `content` plus every slide's image
 * (contentCost); its images then cost nothing (`content_slide`). An edit through the composer is paid by itself.
 */
export const TASK_CREDITS: Record<LoggedTask, number> = {
  content: 3,
  content_slide: 0,
  slide_edit: IMAGE_CREDITS,
  caption_edit: 2,
  content_ideas: 2,
  brand_profile: 5,
  brand_visual: 10,
}

/** A new post with `slides` images: its caption and plan plus every image. */
export const contentCost = (slides: number) => TASK_CREDITS.content + slides * IMAGE_CREDITS

/**
 * Share of the period's credits spent, 0–100, rounded down so 100% means truly spent. Multiplying first keeps it
 * exact: (290 / 1000) * 100 is 28.999… in floating point.
 */
export const usedPercent = (used: number) => Math.min(100, Math.floor((used * 100) / PLAN.credits))

const shareFormat = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 })

/** What a cost is as a share of the period, e.g. "6,3%" or "0,2%". */
export const formatCreditShare = (credits: number) => `${shareFormat.format((credits / PLAN.credits) * 100)}%`

/** e.g. "Rp 99.000", with a no-break space. */
export const formatRupiah = (amount: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount)
