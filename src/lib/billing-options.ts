import type { LoggedTask } from './ai'

/** The one plan. Credits are the period's AI allowance: of 10,000, a 5-slide post (103 credits) is about 1%. */
export interface Plan {
  name: string
  priceIdr: number
  days: number
  credits: number
}

/**
 * The plan until an admin changes it in /admin/pengaturan (app_settings; getPlan() in src/lib/app-settings.ts).
 * A table of plans comes with the second plan.
 */
export const DEFAULT_PLAN: Plan = { name: 'Carousely 30 hari', priceIdr: 99_000, days: 30, credits: 10_000 }

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
  threads_write: 3,
  threads_edit: 2,
  content_ideas: 2,
  content_script: 3,
  brand_profile: 5,
  brand_visual: 10,
  brand_strategy: 5,
  website_catalog: 10,
  /** Per photo, not per request: one request tags a batch of photos (tagCost). */
  asset_tags: 1,
  /** The ✨ AI button of a DM or comment reply. */
  reply_draft: 1,
  /** Admin › Template: the admin's own analysis, never charged (runLogged's `unmetered`). */
  template_analysis: 0,
  /** Brand › Referensi › Dari grid: per request, which sorts up to 12 cut-out designs at once. */
  reference_labels: 2,
  /**
   * Mimo costs no credits: chat and Intel Kompetitor are capped per day instead (DAILY_LIMITS in chat-options.ts),
   * with atomic counters; these rows remain the audit log. A script it writes is still `content_script`.
   */
  chat: 0,
  deep_search: 0,
  chat_summary: 0,
}

/** A new post with `slides` images: its caption and plan plus every image. */
export const contentCost = (slides: number, rates = { ...TASK_CREDITS, image: IMAGE_CREDITS }) => rates.content + slides * rates.image

/** Tagging `photos` photos with AI. */
export const tagCost = (photos: number) => photos * TASK_CREDITS.asset_tags

/**
 * Share of the period's `credits` spent, 0–100, rounded down so 100% means truly spent. Multiplying first keeps it
 * exact: (290 / 1000) * 100 is 28.999… in floating point. Below 0 after an admin gave credits back.
 */
export const usedPercent = (used: number, credits: number) =>
  Math.max(0, Math.min(100, Math.floor((used * 100) / credits)))

const shareFormat = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 })

/** What a cost is as a share of the period's `total` credits, e.g. "6,3%" or "0,2%". */
export const formatCreditShare = (credits: number, total: number) => `${shareFormat.format((credits / total) * 100)}%`

/** e.g. "Rp 99.000", with a no-break space. */
export const formatRupiah = (amount: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount)
