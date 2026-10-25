import { describe, expect, it } from 'vitest'
import { applyCoupon, assertCouponUsable, CouponError, normalizeCouponCode, parseCoupon, withCoupon, type Coupon } from './coupon-options'

const NOW = new Date('2026-10-25T10:00:00Z')
const COUPON: Coupon = { id: 'c-1', code: 'HEMAT', percent: 20, maxUses: 5, active: true, expiresAt: null, planIds: [], months: [] }
const FRESH = { used: 0, usedByUser: false }
const CATALOG = { planIds: ['pro', 'max'], months: [1, 3, 6, 12] }

describe('applyCoupon', () => {
  it('takes the percent off what is left after the duration discount', () => {
    expect(applyCoupon(396_150, 20)).toBe(316_920)
    expect(applyCoupon(139_000, 100)).toBe(0)
  })
})

describe('assertCouponUsable', () => {
  it('returns the total after the coupon', () => {
    expect(assertCouponUsable(COUPON, FRESH, 'pro', 1, 139_000, NOW)).toBe(111_200)
  })
  it.each([
    [{ ...COUPON, active: false }, FRESH, 'tidak aktif'],
    [{ ...COUPON, expiresAt: new Date('2026-10-25T09:59:59Z') }, FRESH, 'kedaluwarsa'],
    [{ ...COUPON, planIds: ['max'] }, FRESH, 'paket'],
    [{ ...COUPON, months: [6, 3] }, FRESH, 'durasi 3, 6 bulan'],
    [COUPON, { used: 1, usedByUser: true }, 'sudah pernah'],
    [COUPON, { used: 5, usedByUser: false }, 'habis'],
  ])('refuses %#', (coupon, usage, message) => {
    expect(() => assertCouponUsable(coupon, usage, 'pro', 1, 139_000, NOW)).toThrow(message)
  })
  it('refuses a total Mayar cannot take, but allows exactly free', () => {
    expect(() => assertCouponUsable({ ...COUPON, percent: 99 }, FRESH, 'pro', 1, 50_000, NOW)).toThrow(CouponError)
    expect(assertCouponUsable({ ...COUPON, percent: 100 }, FRESH, 'pro', 1, 50_000, NOW)).toBe(0)
  })
})

describe('withCoupon', () => {
  it('records the coupon and what it took off', () => {
    const purchase = { version: 1, plan: { id: 'pro' }, months: 3, discount: 5, total: 396_150 }
    expect(withCoupon(purchase, COUPON, FRESH, NOW)).toEqual({ ...purchase, total: 316_920, couponDiscount: 79_230,
      coupon: { id: 'c-1', code: 'HEMAT', percent: 20 } })
  })
})

describe('parseCoupon', () => {
  const valid = { code: ' merdeka-17 ', percent: '17', maxUses: '50', active: 'on', expiresAt: '2026-11-01T23:59', planIds: ['pro'], months: ['3', '1'] }
  it('normalises the code and reads the expiry as WIB', () => {
    expect(parseCoupon(valid, CATALOG, NOW)).toEqual({ code: 'MERDEKA-17', percent: 17, maxUses: 50, active: true,
      expiresAt: new Date('2026-11-01T16:59:00Z'), planIds: ['pro'], months: [1, 3] })
  })
  it('treats empty restrictions and expiry as none', () => {
    expect(parseCoupon({ code: 'ABC', percent: 100, maxUses: 1 }, CATALOG, NOW)).toMatchObject({ active: false, expiresAt: null, planIds: [], months: [] })
  })
  it.each([
    [{ code: 'ab' }, 'Kode'],
    [{ code: 'BAD CODE' }, 'Kode'],
    [{ percent: '0' }, 'Diskon'],
    [{ percent: '101' }, 'Diskon'],
    [{ percent: '12.5' }, 'Diskon'],
    [{ maxUses: '0' }, 'Kuantitas'],
    [{ expiresAt: '2026-10-01T10:00' }, 'masa depan'],
    [{ expiresAt: 'besok' }, 'tidak valid'],
    [{ planIds: ['gold'] }, 'Paket'],
    [{ months: ['2'] }, 'Durasi'],
  ])('refuses %o', (change, message) => {
    expect(() => parseCoupon({ ...valid, ...change }, CATALOG, NOW)).toThrow(message)
  })
  it('compares codes case-insensitively', () => {
    expect(normalizeCouponCode(' gratis ')).toBe('GRATIS')
    expect(normalizeCouponCode(undefined)).toBe('')
  })
})
