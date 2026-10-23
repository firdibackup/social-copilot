import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requireAccount, requireActiveUser, requireAdmin } from './auth'
import { getCurrentPeriod } from './billing'
import { getConnectedAccountId } from './connection'
import { isOnboarded } from './onboarding'

const session = vi.hoisted(() => ({ userId: null as string | null, email: 'owner@example.com' }))

vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: () => {} }) }))
vi.mock('next/server', () => ({ connection: async () => {} }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`)
  },
  notFound: () => {
    throw new Error('NOT_FOUND')
  },
}))
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getClaims: async () => ({ data: session.userId ? { claims: { sub: session.userId, email: session.email } } : null }) },
  }),
}))
vi.mock('./billing', () => ({ getCurrentPeriod: vi.fn() }))
vi.mock('./connection', () => ({ getConnectedAccountId: vi.fn() }))
vi.mock('./onboarding', () => ({ isOnboarded: vi.fn() }))

const PERIOD = { start: new Date('2026-10-01'), end: new Date('2026-10-31'), activeUntil: new Date('2026-10-31') }

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://supabase.test')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'publishable')
  vi.mocked(getCurrentPeriod).mockReset()
  vi.mocked(isOnboarded).mockReset().mockResolvedValue(true)
})

describe('requireActiveUser', () => {
  it('returns the user with a paid period covering now', async () => {
    session.userId = 'user-1'
    vi.mocked(getCurrentPeriod).mockResolvedValue(PERIOD)

    await expect(requireActiveUser()).resolves.toBe('user-1')
  })

  it('sends a user without an active period to Langganan', async () => {
    session.userId = 'user-2'
    vi.mocked(getCurrentPeriod).mockResolvedValue(null)

    await expect(requireActiveUser()).rejects.toThrow('REDIRECT /pengaturan?billing=pilih')
  })

  it('sends a visitor without a session to sign in', async () => {
    session.userId = null

    await expect(requireActiveUser()).rejects.toThrow('REDIRECT /masuk')
    expect(getCurrentPeriod).not.toHaveBeenCalled()
  })

  it('sends a paying user who has not finished the onboarding to /mulai', async () => {
    session.userId = 'user-4'
    vi.mocked(getCurrentPeriod).mockResolvedValue(PERIOD)
    vi.mocked(isOnboarded).mockResolvedValue(false)

    await expect(requireActiveUser()).rejects.toThrow('REDIRECT /mulai')
  })

  it('prioritizes the payment redirect when both checks fail', async () => {
    session.userId = 'user-5'
    vi.mocked(getCurrentPeriod).mockResolvedValue(null)
    vi.mocked(isOnboarded).mockResolvedValue(false)

    await expect(requireActiveUser()).rejects.toThrow('REDIRECT /pengaturan?billing=pilih')
  })

  it('lets the user through when the onboarding status cannot be read', async () => {
    session.userId = 'user-6'
    vi.mocked(getCurrentPeriod).mockResolvedValue(PERIOD)
    vi.mocked(isOnboarded).mockRejectedValue(new Error('relation "onboarding" does not exist'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(requireActiveUser()).resolves.toBe('user-6')
  })
})

describe('requireAccount', () => {
  it('returns the user and the connected account', async () => {
    session.userId = 'user-1'
    vi.mocked(getCurrentPeriod).mockResolvedValue(PERIOD)
    vi.mocked(getConnectedAccountId).mockResolvedValue('ig-1')

    await expect(requireAccount()).resolves.toEqual({ userId: 'user-1', accountId: 'ig-1' })
  })

  it('sends a user without Instagram to Pengaturan', async () => {
    session.userId = 'user-3'
    vi.mocked(getCurrentPeriod).mockResolvedValue(PERIOD)
    vi.mocked(getConnectedAccountId).mockResolvedValue(null)

    await expect(requireAccount()).rejects.toThrow('REDIRECT /pengaturan?perlu=instagram')
  })
})

describe('requireAdmin', () => {
  it('returns a user listed in ADMIN_EMAILS, whatever the case', async () => {
    vi.stubEnv('ADMIN_EMAILS', 'Owner@Example.com, staf@example.com')
    session.userId = 'admin-1'
    session.email = 'owner@example.com'

    await expect(requireAdmin()).resolves.toEqual({ id: 'admin-1', email: 'owner@example.com' })
  })

  it('answers 404 to anyone else, and when ADMIN_EMAILS is empty', async () => {
    session.userId = 'user-9'
    session.email = 'pengguna@example.com'
    vi.stubEnv('ADMIN_EMAILS', 'owner@example.com')
    await expect(requireAdmin()).rejects.toThrow('NOT_FOUND')

    vi.stubEnv('ADMIN_EMAILS', '')
    session.email = ''
    await expect(requireAdmin()).rejects.toThrow('NOT_FOUND')
  })

  it('sends a visitor without a session to sign in', async () => {
    session.userId = null

    await expect(requireAdmin()).rejects.toThrow('REDIRECT /masuk')
  })
})
