import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requireActiveUser } from './auth'
import { getCurrentPeriod } from './billing'

const session = vi.hoisted(() => ({ userId: null as string | null }))

vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: () => {} }) }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`)
  },
}))
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getClaims: async () => ({ data: session.userId ? { claims: { sub: session.userId } } : null }) },
  }),
}))
vi.mock('./billing', () => ({ getCurrentPeriod: vi.fn() }))

const PERIOD = { start: new Date('2026-10-01'), end: new Date('2026-10-31'), activeUntil: new Date('2026-10-31') }

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://supabase.test')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'publishable')
  vi.mocked(getCurrentPeriod).mockReset()
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

    await expect(requireActiveUser()).rejects.toThrow('REDIRECT /langganan')
  })

  it('sends a visitor without a session to sign in', async () => {
    session.userId = null

    await expect(requireActiveUser()).rejects.toThrow('REDIRECT /masuk')
    expect(getCurrentPeriod).not.toHaveBeenCalled()
  })
})
