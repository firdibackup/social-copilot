import { createTranslator } from 'next-intl'
import type { Locale } from '@/i18n/locale-config'
import idMessages from '../../messages/id/billing.json'
import enMessages from '../../messages/en/billing.json'
import { formatRupiah, TASK_CREDITS, type Plan } from './billing-options'

export interface CatalogPlan extends Plan {
  id: string
  active: boolean
  description: string
  chatDaily: number
  researchDaily: number
  prioritySupport: boolean
  earlyAccess: boolean
}
export interface BillingCatalog {
  plans: CatalogPlan[]
  durations: { months: number; discount: number }[]
  rates: typeof TASK_CREDITS & { image: number }
  supportUrl: string
  supportHours: string
}
export const DEFAULT_CATALOG: BillingCatalog = {
  plans: [
    { id: 'pro', name: 'Pro', priceIdr: 139_000, days: 30, credits: 2_500, active: true,
      description: 'Untuk rutin membuat dan menjadwalkan konten.', chatDaily: 100, researchDaily: 5,
      prioritySupport: false, earlyAccess: false },
    { id: 'max', name: 'Max', priceIdr: 349_000, days: 30, credits: 12_500, active: true,
      description: 'Lebih banyak ruang untuk produksi dan riset konten.', chatDaily: 200, researchDaily: 10,
      prioritySupport: true, earlyAccess: true },
  ],
  durations: [{ months: 1, discount: 0 }, { months: 3, discount: 5 }, { months: 6, discount: 11 }, { months: 12, discount: 17 }],
  rates: { ...TASK_CREDITS, image: 20 }, supportUrl: '', supportHours: '',
}
/** Mayar rejects payment amounts below Rp 1.000. */
export const MIN_PRICE_IDR = 1_000
/** Rough monthly post count shown instead of raw credits: 2.500 credits ≈ 30 carousel posts. */
export const estimatedPosts = (credits: number) => Math.floor((credits * 30) / 2_500)

export interface PurchaseSnapshot {
  version: number
  plan: CatalogPlan
  months: number
  discount: number
  total: number
  /** Set when a coupon was applied: `total` is then after the coupon, `couponDiscount` what it took off. */
  coupon?: { id: string; code: string; percent: number }
  couponDiscount?: number
}
export function quotePurchase(catalog: BillingCatalog, version: number, planId: string, months: number, locale: Locale = 'id'): PurchaseSnapshot {
  const t = createTranslator({ locale, messages: locale === 'en' ? enMessages : idMessages, namespace: 'catalogErrors' })
  const plan = catalog.plans.find((plan) => plan.id === planId && plan.active)
  const duration = catalog.durations.find((duration) => duration.months === months)
  if (!plan || !duration) throw new Error(t('message1'))
  return { version, plan: { ...plan }, months, discount: duration.discount,
    total: Math.round(plan.priceIdr * months * (100 - duration.discount) / 100) }
}
/** Anchor every cycle to the original date: Jan 31 → Feb 28 → Mar 31. */
export function addBillingMonths(start: Date, months: number): Date {
  const result = new Date(start)
  const day = result.getUTCDate()
  result.setUTCDate(1)
  result.setUTCMonth(result.getUTCMonth() + months)
  const last = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate()
  result.setUTCDate(Math.min(day, last))
  return result
}
export function billingCycle(start: Date, end: Date, now: Date): { start: Date; end: Date } {
  let month = Math.max(0, (now.getUTCFullYear() - start.getUTCFullYear()) * 12 + now.getUTCMonth() - start.getUTCMonth())
  if (addBillingMonths(start, month) > now) month--
  return { start: addBillingMonths(start, month), end: new Date(Math.min(end.getTime(), addBillingMonths(start, month + 1).getTime())) }
}
/**
 * Save-time only: a large discount on a cheap plan can push the paid total below what Mayar accepts.
 * Not part of parsing, so a catalog saved before this rule still loads.
 */
export function assertPayableTotals(catalog: BillingCatalog, locale: Locale = 'id'): void {
  const t = createTranslator({ locale, messages: locale === 'en' ? enMessages : idMessages, namespace: 'catalogErrors' })
  for (const plan of catalog.plans) {
    if (!plan.active) continue
    for (const duration of catalog.durations) {
      if (Math.round(plan.priceIdr * duration.months * (100 - duration.discount) / 100) < MIN_PRICE_IDR) {
        throw new Error(t('total', { name: plan.name, months: duration.months, discount: duration.discount, amount: formatRupiah(MIN_PRICE_IDR, locale) }))
      }
    }
  }
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const integer = (value: unknown, min: number, max: number) => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max
const shortText = (value: unknown, max: number) => typeof value === 'string' && value.length <= max

export function parseBillingCatalog(value: unknown, locale: Locale = 'id'): BillingCatalog {
  const t = createTranslator({ locale, messages: locale === 'en' ? enMessages : idMessages, namespace: 'catalogErrors' })
  if (!object(value) || !Array.isArray(value.plans) || !value.plans.length || value.plans.length > 20) throw new Error(t('message2'))
  const ids = new Set<string>()
  for (const plan of value.plans) {
    if (object(plan) && typeof plan.priceIdr === 'number' && plan.priceIdr < MIN_PRICE_IDR) {
      throw new Error(t('price', { name: String(plan.name || plan.id), amount: formatRupiah(MIN_PRICE_IDR, locale) }))
    }
    if (!object(plan) || typeof plan.id !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/.test(plan.id) || ids.has(plan.id)
      || !shortText(plan.name, 80) || !String(plan.name).trim() || !shortText(plan.description, 250)
      || !integer(plan.priceIdr, MIN_PRICE_IDR, 100_000_000) || !integer(plan.credits, 1, 1_000_000)
      || plan.days !== 30 || !integer(plan.chatDaily, 0, 100_000) || !integer(plan.researchDaily, 0, 10_000)
      || typeof plan.active !== 'boolean' || typeof plan.prioritySupport !== 'boolean' || typeof plan.earlyAccess !== 'boolean') {
      throw new Error(t('message3'))
    }
    ids.add(plan.id)
  }
  if (!Array.isArray(value.durations) || !value.durations.length || value.durations.length > 12) throw new Error(t('message4'))
  const months = new Set<number>()
  for (const duration of value.durations) {
    if (!object(duration) || !integer(duration.months, 1, 12) || !integer(duration.discount, 0, 90) || months.has(duration.months as number)) throw new Error(t('message5'))
    months.add(duration.months as number)
  }
  if (!object(value.rates)) throw new Error(t('message6'))
  // A task added after the catalog was saved takes its default rate until an admin sets one.
  const rates: Record<string, unknown> = { ...DEFAULT_CATALOG.rates, ...value.rates }
  if (Object.keys(DEFAULT_CATALOG.rates).some((key) => !integer(rates[key], 0, 10_000))) throw new Error(t('message6'))
  if (rates.content_slide !== 0 || rates.template_analysis !== 0) throw new Error(t('message7'))
  if (!shortText(value.supportHours, 200) || !shortText(value.supportUrl, 500)) throw new Error(t('message8'))
  if (value.supportUrl) {
    let url: URL
    try { url = new URL(String(value.supportUrl)) } catch { throw new Error(t('message9')) }
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error(t('message9'))
  }
  return { ...value, rates } as unknown as BillingCatalog
}
