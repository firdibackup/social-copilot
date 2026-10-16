import { beforeEach, describe, expect, it, vi } from 'vitest'
import { confirmPayment, startCheckout } from './billing'
import { createPaymentRequest, getPaymentRequest, MayarApiError } from './mayar'

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
vi.mock('./mayar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./mayar')>()),
  createPaymentRequest: vi.fn(),
  getPaymentRequest: vi.fn(),
}))

const USER = 'user-1'
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
})

describe('startCheckout', () => {
  it('hands out a pending link that is still payable instead of making another', async () => {
    fake.results.push(ok([{ link: 'https://pay.test/pl/old' }]))

    await expect(startCheckout(USER, 'budi@example.com', NOW)).resolves.toBe('https://pay.test/pl/old')
    expect(createPaymentRequest).not.toHaveBeenCalled()
    expect(step('payments', 'eq')).toEqual(expect.arrayContaining([['user_id', USER], ['status', 'pending']]))
  })

  it('writes the payment row before asking Mayar, then stores the link', async () => {
    fake.results.push(ok([]), ok({ id: 'pay-2' }), ok(null))
    vi.mocked(createPaymentRequest).mockResolvedValue({ id: 'pr-2', link: 'https://pay.test/pl/new' })

    await expect(startCheckout(USER, 'budi@example.com', NOW)).resolves.toBe('https://pay.test/pl/new')
    expect(step('payments', 'insert')[0][0]).toMatchObject({ user_id: USER, amount: 99_000, status: 'pending' })
    expect(createPaymentRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 99_000,
        email: 'budi@example.com',
        redirectUrl: 'http://localhost:3000/langganan?bayar=selesai',
        expiredAt: new Date('2026-10-17T10:00:00Z'),
      }),
    )
    expect(step('payments', 'update')[0][0]).toEqual({ mayar_id: 'pr-2', link: 'https://pay.test/pl/new' })
  })

  it('closes the row when Mayar refuses, so nothing can be paid against it', async () => {
    fake.results.push(ok([]), ok({ id: 'pay-3' }), ok(null))
    vi.mocked(createPaymentRequest).mockRejectedValue(new MayarApiError('down', 503))

    await expect(startCheckout(USER, 'budi@example.com', NOW)).rejects.toThrow('down')
    expect(step('payments', 'update')[0][0]).toEqual({ status: 'expired' })
  })
})

describe('confirmPayment', () => {
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
