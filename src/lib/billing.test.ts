import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getPlan } from './app-settings'
import { confirmPayment, getCurrentPeriod, getUpgradeQuote, grantFreePeriod, startCheckout, startUpgradeCheckout } from './billing'
import { DEFAULT_PLAN } from './billing-options'
import { DEFAULT_CATALOG } from './billing-catalog-options'
vi.mock('./billing-catalog', () => ({ getBillingCatalog: vi.fn(async () => ({ version: 1, catalog: DEFAULT_CATALOG })) }))
import { createPaymentRequest, getPaymentRequest, MayarApiError } from './mayar'
import { findCoupon } from './coupons'
import { CouponError } from './coupon-options'
vi.mock('./coupons', () => ({ findCoupon: vi.fn() }))

/** A query builder that records each call and resolves to the next queued result for any table. */
const fake = vi.hoisted(() => ({
  results: [] as { data: unknown; error: unknown }[],
  queries: [] as { table: string; steps: [string, unknown[]][] }[],
  rpc: vi.fn(),
}))

vi.mock('./supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./supabase')>()),
  db: () => ({
    from: (table: string) => {
      const query = { table, steps: [] as [string, unknown[]][] }
      fake.queries.push(query)
      const result = fake.results.shift() ?? { data: null, error: null }
      const builder: object = new Proxy(
        {},
        {
          get: (_target, step) =>
            step === 'then'
              ? (resolve: (value: unknown) => void) => resolve(result)
              : (...args: unknown[]) => {
                  query.steps.push([String(step), args])
                  return builder
                },
        },
      )
      return builder
    },
    rpc: fake.rpc,
  }),
}))
vi.mock('./app-settings', () => ({ getPlan: vi.fn() }))
vi.mock('./mayar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./mayar')>()),
  createPaymentRequest: vi.fn(),
  getPaymentRequest: vi.fn(),
}))

const USER = 'user-1'
const CONTACT = { name: 'Budi Santoso', whatsapp: '6281234567890' }
const NOW = new Date('2026-10-16T10:00:00Z')
const PENDING = { id: 'pay-1', mayar_id: 'pr-1', link: 'https://pay.test/pl/x', amount: 99_000, status: 'pending' as const, expires_at: '2026-10-17T10:00:00Z' }
const ok = (data: unknown) => ({ data, error: null })
/** The arguments of every call to `name` on `table`. */
const step = (table: string, name: string) =>
  fake.queries
    .filter((query) => query.table === table)
    .flatMap((query) => query.steps.filter(([called]) => called === name).map(([, args]) => args))

beforeEach(() => {
  fake.results = []
  fake.queries = []
  fake.rpc.mockReset()
  vi.mocked(createPaymentRequest).mockReset()
  vi.mocked(getPaymentRequest).mockReset()
  vi.mocked(getPlan).mockResolvedValue(DEFAULT_PLAN)
  vi.mocked(findCoupon).mockReset()
  vi.stubEnv('MAYAR_ENABLED', 'true')
})

describe('startCheckout', () => {
  it('gives migrated legacy Pro access monthly credits while retaining its original access end', async () => {
    fake.results.push(ok([{
      period_start: '2026-01-31T10:00:00Z', period_end: '2099-12-31T00:00:00Z',
      snapshot: { legacy: true, monthly: true, plan: DEFAULT_CATALOG.plans[0] },
    }]))
    await expect(getCurrentPeriod(USER, new Date('2026-03-30T12:00:00Z'))).resolves.toEqual({
      start: new Date('2026-02-28T10:00:00Z'), end: new Date('2026-03-31T10:00:00Z'),
      activeUntil: new Date('2099-12-31T00:00:00Z'), plan: DEFAULT_CATALOG.plans[0],
    })
  })
  it('hands out a pending link that is still payable instead of making another', async () => {
    fake.rpc.mockResolvedValue(ok({ id: 'pay-1', link: 'https://pay.test/pl/old' }))

    await expect(startCheckout(USER, 'budi@example.com', CONTACT, NOW)).resolves.toBe('https://pay.test/pl/old')
    expect(createPaymentRequest).not.toHaveBeenCalled()
    expect(fake.rpc).toHaveBeenCalledWith('prepare_billing_checkout', expect.objectContaining({ p_user: USER }))
    expect(step('payments', 'update')[0]?.[0]).toEqual({ customer_name: 'Budi Santoso', customer_whatsapp: '6281234567890' })
  })

  it('writes the payment row before asking Mayar, then stores the link', async () => {
    fake.rpc.mockResolvedValue(ok({ id: 'pay-2', link: null }))
    fake.results.push(ok(null), ok([{ id: 'pay-2' }]), ok(null))
    vi.mocked(createPaymentRequest).mockResolvedValue({ id: 'pr-2', link: 'https://pay.test/pl/new' })

    await expect(startCheckout(USER, 'budi@example.com', CONTACT, NOW)).resolves.toBe('https://pay.test/pl/new')
    expect(fake.rpc).toHaveBeenCalledWith('prepare_billing_checkout', expect.objectContaining({ p_user: USER, p_snapshot: expect.objectContaining({ total: 139_000, months: 1, plan: expect.objectContaining({ id: 'pro', credits: 2500 }) }) }))
    expect(createPaymentRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Budi Santoso',
        amount: 139_000,
        email: 'budi@example.com',
        mobile: '081234567890',
        redirectUrl: 'http://localhost:3000/langganan?bayar=selesai&pesanan=pay-2',
        expiredAt: new Date('2026-10-17T10:00:00Z'),
      }),
    )
    expect(step('payments', 'update').at(-1)?.[0]).toEqual({ mayar_id: 'pr-2', link: 'https://pay.test/pl/new' })
  })

  it('closes the row when Mayar refuses, so nothing can be paid against it', async () => {
    fake.rpc.mockResolvedValue(ok({ id: 'pay-3', link: null }))
    fake.results.push(ok(null), ok([{ id: 'pay-3' }]), ok(null))
    vi.mocked(createPaymentRequest).mockRejectedValue(new MayarApiError('down', 503))

    await expect(startCheckout(USER, 'budi@example.com', CONTACT, NOW)).rejects.toThrow('down')
    expect(step('payments', 'update').at(-1)?.[0]).toEqual({ status: 'expired', checkout_key: null })
  })

  it('only the caller that claims a checkout may create its Mayar link', async () => {
    fake.rpc.mockResolvedValue(ok({ id: 'pay-2', link: null }))
    fake.results.push(ok(null), ok([]))
    await expect(startCheckout(USER, 'budi@example.com', CONTACT, NOW)).rejects.toThrow('sedang disiapkan')
    expect(createPaymentRequest).not.toHaveBeenCalled()
  })

  it('reads upgraded entitlements without moving the original usage cycle', async () => {
    fake.results.push(ok([{ period_start: '2026-10-01T00:00:00Z', period_end: '2027-01-01T00:00:00Z',
      snapshot: { months: 3, plan: DEFAULT_CATALOG.plans[0] }, entitlement_plan: DEFAULT_CATALOG.plans[1] }]))
    await expect(getCurrentPeriod(USER, NOW)).resolves.toMatchObject({
      plan: DEFAULT_CATALOG.plans[1], start: new Date('2026-10-01T00:00:00Z'), end: new Date('2026-11-01T00:00:00Z'),
      activeUntil: new Date('2027-01-01T00:00:00Z'),
    })
  })

  it('binds an upgrade quote to its owner, contents and expiry before checkout', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-only-signing-secret')
    fake.results.push(ok([{ id: 'term-1', period_start: '2026-10-01T00:00:00Z', period_end: '2026-11-01T00:00:00Z',
      snapshot: { months: 1, plan: DEFAULT_CATALOG.plans[0] }, entitlement_plan: null }]))
    const signed = await getUpgradeQuote(USER, 'max', NOW)
    await expect(startUpgradeCheckout('other-user', 'other@example.com', CONTACT, signed.token, NOW)).rejects.toThrow('kedaluwarsa')
    await expect(startUpgradeCheckout(USER, 'budi@example.com', CONTACT, `${signed.token}tampered`, NOW)).rejects.toThrow('tidak valid')
    await expect(startUpgradeCheckout(USER, 'budi@example.com', CONTACT, signed.token, new Date(NOW.getTime() + 11 * 60000))).rejects.toThrow('kedaluwarsa')
    expect(fake.rpc).not.toHaveBeenCalled()
    fake.rpc.mockResolvedValue(ok({ id: 'upgrade-1', link: null }))
    fake.results.push(ok(null), ok([{ id: 'upgrade-1' }]), ok(null))
    vi.mocked(createPaymentRequest).mockResolvedValue({ id: 'mayar-upgrade', link: 'https://pay.test/upgrade' })
    await expect(startUpgradeCheckout(USER, 'budi@example.com', CONTACT, signed.token, NOW)).resolves.toBe('https://pay.test/upgrade')
    expect(fake.rpc).toHaveBeenCalledWith('prepare_billing_checkout', expect.objectContaining({ p_snapshot: signed.quote }))
    vi.unstubAllEnvs()
  })
})

describe('startCheckout with a coupon', () => {
  const COUPON = { id: 'c-1', code: 'HEMAT20', percent: 20, maxUses: 10, active: true, expiresAt: null, planIds: [], months: [] }

  it('stacks the coupon after the duration discount and sends the snapshot with it', async () => {
    vi.mocked(findCoupon).mockResolvedValue({ coupon: COUPON, usage: { used: 0, usedByUser: false } })
    fake.rpc.mockResolvedValue(ok({ id: 'pay-4', link: null, status: 'pending' }))
    fake.results.push(ok(null), ok([{ id: 'pay-4' }]), ok(null))
    vi.mocked(createPaymentRequest).mockResolvedValue({ id: 'pr-4', link: 'https://pay.test/pl/kupon' })

    await expect(startCheckout(USER, 'budi@example.com', CONTACT, NOW, { planId: 'pro', months: 3, version: 1, couponCode: ' hemat20 ' }))
      .resolves.toBe('https://pay.test/pl/kupon')
    // 139.000 × 3 − 5% = 396.150; − 20% = 316.920
    expect(findCoupon).toHaveBeenCalledWith(USER, 'HEMAT20')
    expect(fake.rpc).toHaveBeenCalledWith('prepare_billing_checkout', expect.objectContaining({
      p_key: `${USER}:1:pro:3:HEMAT20`,
      p_snapshot: expect.objectContaining({ total: 316_920, discount: 5, couponDiscount: 79_230, coupon: { id: 'c-1', code: 'HEMAT20', percent: 20 } }),
    }))
    expect(createPaymentRequest).toHaveBeenCalledWith(expect.objectContaining({ amount: 316_920 }))
  })

  it('activates a 100% coupon without Mayar, even while payments are off', async () => {
    vi.stubEnv('MAYAR_ENABLED', '')
    vi.mocked(findCoupon).mockResolvedValue({ coupon: { ...COUPON, code: 'GRATIS', percent: 100 }, usage: { used: 0, usedByUser: false } })
    fake.rpc.mockResolvedValue(ok({ id: 'pay-5', link: null, status: 'paid' }))
    fake.results.push(ok(null))

    await expect(startCheckout(USER, 'budi@example.com', CONTACT, NOW, { planId: 'max', months: 1, version: 1, couponCode: 'GRATIS' }))
      .resolves.toBe('http://localhost:3000/langganan?bayar=selesai&pesanan=pay-5')
    expect(fake.rpc).toHaveBeenCalledWith('prepare_billing_checkout', expect.objectContaining({ p_snapshot: expect.objectContaining({ total: 0 }) }))
    expect(createPaymentRequest).not.toHaveBeenCalled()
  })

  it('refuses a paid checkout while payments are off', async () => {
    vi.stubEnv('MAYAR_ENABLED', '')
    vi.mocked(findCoupon).mockResolvedValue({ coupon: COUPON, usage: { used: 0, usedByUser: false } })
    await expect(startCheckout(USER, 'budi@example.com', CONTACT, NOW, { planId: 'pro', months: 1, version: 1, couponCode: 'HEMAT20' }))
      .rejects.toThrow('belum diaktifkan')
    expect(fake.rpc).not.toHaveBeenCalled()
  })

  it('refuses an exhausted or already used coupon before reserving anything', async () => {
    vi.mocked(findCoupon).mockResolvedValue({ coupon: COUPON, usage: { used: 10, usedByUser: false } })
    await expect(startCheckout(USER, 'b@example.com', CONTACT, NOW, { planId: 'pro', months: 1, version: 1, couponCode: 'HEMAT20' })).rejects.toThrow(CouponError)
    vi.mocked(findCoupon).mockResolvedValue({ coupon: COUPON, usage: { used: 1, usedByUser: true } })
    await expect(startCheckout(USER, 'b@example.com', CONTACT, NOW, { planId: 'pro', months: 1, version: 1, couponCode: 'HEMAT20' })).rejects.toThrow('sudah pernah')
    expect(fake.rpc).not.toHaveBeenCalled()
  })

  it('skips the coupon lookup when no code is given', async () => {
    fake.rpc.mockResolvedValue(ok({ id: 'pay-1', link: 'https://pay.test/pl/old' }))
    await startCheckout(USER, 'budi@example.com', CONTACT, NOW, { planId: 'pro', months: 1, version: 1, couponCode: '  ' })
    expect(findCoupon).not.toHaveBeenCalled()
  })
})

describe('confirmPayment', () => {
  it('recovers a paid expired link using its purchased duration, not today’s settings', async () => {
    vi.mocked(getPaymentRequest).mockResolvedValue({ status: 'paid', amount: 99_000 })
    fake.rpc.mockResolvedValue({ data: true, error: null })
    await expect(confirmPayment({ ...PENDING, status: 'expired', snapshot: {
      version: 1, months: 12, discount: 17, total: 99000, plan: { ...DEFAULT_CATALOG.plans[0], days: 30 },
    } }, NOW)).resolves.toBe(true)
    expect(fake.rpc).toHaveBeenCalledWith('activate_payment', { p_id: 'pay-1', p_days: 30 })
  })
  it('starts the period when Mayar says the full amount was paid', async () => {
    vi.mocked(getPaymentRequest).mockResolvedValue({ status: 'paid', amount: 99_000 })
    fake.rpc.mockResolvedValue({ data: true, error: null })

    await expect(confirmPayment(PENDING, NOW)).resolves.toBe(true)
    expect(getPaymentRequest).toHaveBeenCalledWith('pr-1')
    expect(fake.rpc).toHaveBeenCalledWith('activate_payment', { p_id: 'pay-1', p_days: 30 })
  })

  it('does not start a period for a different amount', async () => {
    vi.mocked(getPaymentRequest).mockResolvedValue({ status: 'paid', amount: 1_000 })

    await expect(confirmPayment(PENDING, NOW)).resolves.toBe(false)
    expect(fake.rpc).not.toHaveBeenCalled()
  })

  it('expires an unpaid payment whose link has run out', async () => {
    vi.mocked(getPaymentRequest).mockResolvedValue({ status: 'unpaid', amount: 99_000 })
    fake.results.push(ok(null))

    await expect(confirmPayment(PENDING, new Date('2026-10-18T00:00:00Z'))).resolves.toBe(false)
    expect(step('payments', 'update')[0][0]).toEqual({ status: 'expired' })
    expect(fake.rpc).not.toHaveBeenCalled()
  })

  it('leaves an unpaid payment alone while its link still works', async () => {
    vi.mocked(getPaymentRequest).mockResolvedValue({ status: 'unpaid', amount: 99_000 })

    await expect(confirmPayment(PENDING, NOW)).resolves.toBe(false)
    expect(fake.queries).toEqual([])
  })

  it('never asks Mayar about a payment that is not pending or has no Mayar id', async () => {
    await confirmPayment({ ...PENDING, status: 'paid' }, NOW)
    await confirmPayment({ ...PENDING, mayar_id: null }, NOW)
    expect(getPaymentRequest).not.toHaveBeenCalled()
  })
})

describe('grantFreePeriod', () => {
  it('records a free payment and activates it like a paid one, so it stacks after the current period', async () => {
    fake.results.push(ok({ id: 'pay-free' }))
    fake.rpc.mockResolvedValue({ data: true, error: null })

    await grantFreePeriod(USER)

    expect(step('payments', 'insert')[0][0]).toMatchObject({ user_id: USER, amount: 0, status: 'pending', snapshot: { plan: { credits: 10000, days: 30 } } })
    expect(fake.rpc).toHaveBeenCalledWith('activate_payment', { p_id: 'pay-free', p_days: 30 })
    expect(createPaymentRequest).not.toHaveBeenCalled()
  })
})

describe('the plan an admin set', () => {
  it('grants its length, or the days an admin chose', async () => {
    vi.mocked(getPlan).mockResolvedValue({ ...DEFAULT_PLAN, days: 7 })
    fake.results = [ok({ id: 'pay-a' }), ok({ id: 'pay-b' })]
    fake.rpc.mockResolvedValue({ data: true, error: null })

    await grantFreePeriod(USER)
    await grantFreePeriod(USER, 90)

    expect(fake.rpc).toHaveBeenCalledWith('activate_payment', { p_id: 'pay-a', p_days: 7 })
    expect(fake.rpc).toHaveBeenCalledWith('activate_payment', { p_id: 'pay-b', p_days: 90 })
  })
})
