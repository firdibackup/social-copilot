/** Kupon: pure rules shared by checkout, the admin form, and tests. The database re-checks all of them under a lock. */
import { formatRupiah } from './billing-options'
import { MIN_PRICE_IDR } from './billing-catalog-options'

/** What a checkout snapshot carries: enough for the database to recognise a changed coupon. */
export interface AppliedCoupon {
  id: string
  code: string
  percent: number
}

export interface Coupon {
  id: string
  code: string
  percent: number
  maxUses: number
  active: boolean
  expiresAt: Date | null
  /** Empty: every plan. */
  planIds: string[]
  /** Empty: every duration. */
  months: number[]
}

export interface CouponUsage {
  used: number
  usedByUser: boolean
}

export class CouponError extends Error {
  override name = 'CouponError'
}

export const COUPON_CODE = /^[A-Z0-9_-]{3,30}$/

/** Codes are case-insensitive: stored and compared in capitals, spaces trimmed. */
export const normalizeCouponCode = (value: unknown) => (typeof value === 'string' ? value.trim().toUpperCase() : '')

/** Duration discount first, then the coupon on what is left. Rounded once per step, like the invoice. */
export function applyCoupon(afterDuration: number, percent: number): number {
  return Math.round(afterDuration * (100 - percent) / 100)
}

/**
 * Whether `coupon` can be used for this plan and duration by this user. Throws a CouponError with a message for
 * people. A total between Rp 0 and Rp 1.000 can't be paid through Mayar, and only a 100% coupon may make it free.
 */
export function assertCouponUsable(coupon: Coupon, usage: CouponUsage, planId: string, months: number, totalBefore: number, now = new Date()): number {
  if (!coupon.active) throw new CouponError('Kupon ini sudah tidak aktif.')
  if (coupon.expiresAt && coupon.expiresAt <= now) throw new CouponError('Kupon ini sudah kedaluwarsa.')
  if (coupon.planIds.length && !coupon.planIds.includes(planId)) throw new CouponError('Kupon ini tidak berlaku untuk paket yang dipilih.')
  if (coupon.months.length && !coupon.months.includes(months)) {
    throw new CouponError(`Kupon ini hanya berlaku untuk durasi ${[...coupon.months].sort((a, b) => a - b).join(', ')} bulan.`)
  }
  if (usage.usedByUser) throw new CouponError('Kupon ini sudah pernah kamu pakai.')
  if (usage.used >= coupon.maxUses) throw new CouponError('Kuota kupon ini sudah habis.')
  const total = applyCoupon(totalBefore, coupon.percent)
  if (total > 0 && total < MIN_PRICE_IDR) {
    throw new CouponError(`Total setelah kupon di bawah ${formatRupiah(MIN_PRICE_IDR)}, jadi tidak bisa dibayar. Pilih durasi atau paket lain.`)
  }
  return total
}

/** The purchase with the coupon taken off, checked first. The snapshot keeps the coupon for the database to re-check. */
export function withCoupon<T extends { plan: { id: string }; months: number; total: number }>(
  purchase: T, coupon: Coupon, usage: CouponUsage, now = new Date(),
): T & { coupon: AppliedCoupon; couponDiscount: number } {
  const total = assertCouponUsable(coupon, usage, purchase.plan.id, purchase.months, purchase.total, now)
  return { ...purchase, total, coupon: { id: coupon.id, code: coupon.code, percent: coupon.percent }, couponDiscount: purchase.total - total }
}

export interface CouponInput {
  code: string
  percent: number
  maxUses: number
  active: boolean
  expiresAt: Date | null
  planIds: string[]
  months: number[]
}

const integer = (value: unknown, min: number, max: number) => {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  return typeof number === 'number' && Number.isSafeInteger(number) && number >= min && number <= max ? number : null
}

/**
 * The admin form. `expiresAt` is a `datetime-local` value read as WIB (UTC+7), or empty for no expiry.
 * Plan ids and months are checked against the catalog so a restriction can't name something that doesn't exist.
 */
export function parseCoupon(input: Record<string, unknown>, catalog: { planIds: string[]; months: number[] }, now = new Date()): CouponInput {
  const code = normalizeCouponCode(input.code)
  if (!COUPON_CODE.test(code)) throw new CouponError('Kode kupon 3–30 karakter: huruf, angka, - atau _.')
  const percent = integer(input.percent, 1, 100)
  if (percent === null) throw new CouponError('Diskon kupon harus bilangan bulat 1–100%.')
  const maxUses = integer(input.maxUses, 1, 1_000_000)
  if (maxUses === null) throw new CouponError('Kuantitas kupon harus bilangan bulat 1–1.000.000.')
  let expiresAt: Date | null = null
  if (typeof input.expiresAt === 'string' && input.expiresAt.trim()) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input.expiresAt.trim())) throw new CouponError('Tanggal kedaluwarsa tidak valid.')
    expiresAt = new Date(`${input.expiresAt.trim()}:00+07:00`)
    if (Number.isNaN(expiresAt.getTime())) throw new CouponError('Tanggal kedaluwarsa tidak valid.')
    if (expiresAt <= now) throw new CouponError('Tanggal kedaluwarsa harus di masa depan.')
  }
  const list = (value: unknown) => (Array.isArray(value) ? value : value === undefined || value === '' ? [] : [value])
  const planIds = [...new Set(list(input.planIds).map(String))]
  if (planIds.some((id) => !catalog.planIds.includes(id))) throw new CouponError('Paket yang dibatasi tidak ada di katalog.')
  const months = [...new Set(list(input.months).map((value) => integer(value, 1, 12)))]
  if (months.some((value) => value === null || !catalog.months.includes(value))) throw new CouponError('Durasi yang dibatasi tidak ada di katalog.')
  return { code, percent, maxUses, active: input.active === true || input.active === 'on' || input.active === 'true',
    expiresAt, planIds, months: (months as number[]).sort((a, b) => a - b) }
}
