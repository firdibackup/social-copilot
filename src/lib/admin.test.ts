import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminError, adjustCredits, deleteUser, endSubscription, grantDays, resetCredits, setBanned, setPassword } from './admin'
import { grantFreePeriod } from './billing'

/** A query builder that records each call and resolves to the next queued result for any table. */
const fake = vi.hoisted(() => ({
  results: [] as { data: unknown; error: unknown }[],
  queries: [] as { table: string; steps: [string, unknown[]][] }[],
  rpc: vi.fn(),
  auth: { getUserById: vi.fn(), updateUserById: vi.fn(), deleteUser: vi.fn() },
  storage: { list: vi.fn(), remove: vi.fn() },
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
    auth: { admin: fake.auth },
    storage: { from: () => fake.storage },
  }),
}))
vi.mock('./billing', () => ({ grantFreePeriod: vi.fn(), listPayments: vi.fn() }))

const ADMIN = { id: 'admin-1', email: 'owner@example.com' }
const USER = 'user-1'
const ok = (data: unknown) => ({ data, error: null })
const inserts = (table: string) =>
  fake.queries
    .filter((query) => query.table === table)
    .flatMap((query) => query.steps.filter(([called]) => called === 'insert').map(([, args]) => args[0]))
/** admin_user_overview's row for USER, with a current period from `periodStart` (null: none). */
const overview = (periodStart: string | null, used: number | null = null) =>
  ok(periodStart ? [{ user_id: USER, active_until: '2026-11-01', period_start: periodStart, period_end: '2026-11-01', credits_used: used }] : [])

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  fake.results = []
  fake.queries = []
  fake.auth.getUserById.mockResolvedValue({ data: { user: { id: USER, email: 'budi@example.com' } }, error: null })
  fake.auth.updateUserById.mockResolvedValue({ data: {}, error: null })
  fake.auth.deleteUser.mockResolvedValue({ data: {}, error: null })
  fake.storage.list.mockResolvedValue({ data: [], error: null })
})

describe('grantDays', () => {
  it('grants the days and logs them against the user', async () => {
    await grantDays(ADMIN, USER, 14)

    expect(grantFreePeriod).toHaveBeenCalledWith(USER, 14)
    expect(inserts('admin_log')).toEqual([
      { admin_id: 'admin-1', target_user_id: USER, target_email: 'budi@example.com', action: 'grant_days', detail: { days: 14 } },
    ])
  })

  it('refuses a user that does not exist, before granting anything', async () => {
    fake.auth.getUserById.mockResolvedValue({ data: { user: null }, error: { message: 'User not found' } })

    await expect(grantDays(ADMIN, USER, 14)).rejects.toThrow(AdminError)
    expect(grantFreePeriod).not.toHaveBeenCalled()
  })
})

describe('endSubscription', () => {
  it('ends the period and logs how many rows changed', async () => {
    fake.rpc.mockResolvedValue(ok(2))

    await endSubscription(ADMIN, USER)

    expect(fake.rpc).toHaveBeenCalledWith('admin_end_subscription', { p_user_id: USER })
    expect(inserts('admin_log')[0]).toMatchObject({ action: 'end_subscription', detail: { periods: 2 } })
  })

  it('says so when there was nothing to end', async () => {
    fake.rpc.mockResolvedValue(ok(0))

    await expect(endSubscription(ADMIN, USER)).rejects.toThrow('tidak punya langganan aktif')
    expect(inserts('admin_log')).toEqual([])
  })

  it('refuses the admin’s own subscription, which would lock them out of the app', async () => {
    await expect(endSubscription(ADMIN, ADMIN.id)).rejects.toThrow('langganan sendiri')
    expect(fake.rpc).not.toHaveBeenCalled()
  })
})

describe('adjustCredits', () => {
  it('stores the adjustment in the current period', async () => {
    fake.rpc.mockResolvedValue(overview('2026-10-01', 300))

    await adjustCredits(ADMIN, USER, -200, 'salah tagih')

    expect(inserts('credit_adjustments')).toEqual([{ user_id: USER, amount: -200, note: 'salah tagih', created_by: 'admin-1' }])
    expect(inserts('admin_log')[0]).toMatchObject({ action: 'adjust_credits', detail: { amount: -200, note: 'salah tagih' } })
  })

  it('refuses a user without a current period, where the adjustment would never count', async () => {
    fake.rpc.mockResolvedValue(overview(null))

    await expect(adjustCredits(ADMIN, USER, 500, null)).rejects.toThrow('tidak punya periode aktif')
    expect(inserts('credit_adjustments')).toEqual([])
  })
})

describe('resetCredits', () => {
  it('gives back exactly what the period used', async () => {
    fake.rpc.mockResolvedValue(overview('2026-10-01', 1_234))

    await resetCredits(ADMIN, USER)

    expect(inserts('credit_adjustments')).toEqual([
      { user_id: USER, amount: 1_234, note: 'Reset pemakaian periode', created_by: 'admin-1' },
    ])
  })

  it('refuses when nothing was used or there is no period', async () => {
    fake.rpc.mockResolvedValue(overview('2026-10-01', 0))
    await expect(resetCredits(ADMIN, USER)).rejects.toThrow('belum terpakai')

    fake.rpc.mockResolvedValue(overview(null))
    await expect(resetCredits(ADMIN, USER)).rejects.toThrow('tidak punya periode aktif')
    expect(inserts('credit_adjustments')).toEqual([])
  })
})

describe('setPassword', () => {
  it('turns a weak password into a message the admin can act on', async () => {
    fake.auth.updateUserById.mockResolvedValue({ data: {}, error: { code: 'weak_password', message: 'weak' } })

    await expect(setPassword(ADMIN, USER, 'password')).rejects.toThrow(AdminError)
    expect(inserts('admin_log')).toEqual([])
  })
})

describe('setBanned', () => {
  it('bans for a century and lifts it with "none"', async () => {
    await setBanned(ADMIN, USER, true)
    await setBanned(ADMIN, USER, false)

    expect(fake.auth.updateUserById).toHaveBeenNthCalledWith(1, USER, { ban_duration: '876000h' })
    expect(fake.auth.updateUserById).toHaveBeenNthCalledWith(2, USER, { ban_duration: 'none' })
  })

  it('refuses to ban the admin themself', async () => {
    await expect(setBanned(ADMIN, ADMIN.id, true)).rejects.toThrow('akun sendiri')
    expect(fake.auth.updateUserById).not.toHaveBeenCalled()
  })
})

describe('deleteUser', () => {
  it('needs the user’s email typed exactly, in any case', async () => {
    await expect(deleteUser(ADMIN, USER, 'budi@example')).rejects.toThrow('Ketik email')
    expect(fake.auth.deleteUser).not.toHaveBeenCalled()

    await deleteUser(ADMIN, USER, ' Budi@Example.com ')
    expect(fake.auth.deleteUser).toHaveBeenCalledWith(USER)
  })

  it('refuses the admin themself', async () => {
    await expect(deleteUser(ADMIN, ADMIN.id, 'owner@example.com')).rejects.toThrow('akun sendiri')
    expect(fake.auth.deleteUser).not.toHaveBeenCalled()
  })

  it('removes the user’s files, folders included, and survives a bucket that fails', async () => {
    fake.storage.list.mockImplementation(async (prefix: string) => {
      if (prefix === USER) return { data: [{ name: 'a.jpg', id: '1' }, { name: 'refs', id: null }], error: null }
      if (prefix === `${USER}/refs`) return { data: [{ name: 'b.png', id: '2' }], error: null }
      return { data: [], error: null }
    })
    fake.storage.remove.mockResolvedValueOnce(ok([])).mockRejectedValueOnce(new Error('storage down'))

    await deleteUser(ADMIN, USER, 'budi@example.com')

    expect(fake.storage.remove).toHaveBeenCalledWith([`${USER}/a.jpg`, `${USER}/refs/b.png`])
    expect(inserts('admin_log')[0]).toMatchObject({ action: 'delete_user', target_email: 'budi@example.com' })
  })
})

describe('logAdminAction', () => {
  it('does not undo the action when the log cannot be written', async () => {
    fake.results.push({ data: null, error: { message: 'relation "admin_log" does not exist' } })

    await expect(grantDays(ADMIN, USER, 7)).resolves.toBeUndefined()
    expect(grantFreePeriod).toHaveBeenCalled()
  })
})
