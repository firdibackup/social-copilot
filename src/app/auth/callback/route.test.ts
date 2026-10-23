import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from './route'

const exchange = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth', () => ({ authClient: async () => ({ auth: { exchangeCodeForSession: exchange } }) }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('APP_URL', 'https://app.example.com')
  exchange.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } }, error: null })
})
afterEach(() => vi.unstubAllEnvs())

const visit = (query: string) => GET(new Request(`http://internal:3000/auth/callback?${query}`))

describe('Google OAuth callback', () => {
  it('exchanges the code and returns to the requested page on the configured domain', async () => {
    const response = await visit('code=one-use&next=%2Fbuat%3Fid%3D1')
    expect(exchange).toHaveBeenCalledExactlyOnceWith('one-use')
    expect(response.headers.get('location')).toBe('https://app.example.com/buat?id=1')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })

  it.each(['https://evil.test', '//evil.test', '/\\evil.test', '/\t/evil.test'])(
    'rejects an external next destination: %s', async (next) => {
      const response = await visit(`code=one-use&next=${encodeURIComponent(next)}`)
      expect(response.headers.get('location')).toBe('https://app.example.com/kalender')
    },
  )

  it.each(['', 'error=access_denied', 'code=one-use&error=access_denied'])(
    'returns a retryable error without exchanging a missing or denied code: %s', async (query) => {
      const response = await visit(`${query}&next=%2Fbuat`)
      expect(exchange).not.toHaveBeenCalled()
      expect(response.headers.get('location')).toBe('https://app.example.com/masuk?error=google&next=%2Fbuat')
    },
  )

  it('handles expired codes without exposing provider errors', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    exchange.mockResolvedValue({ data: { session: null }, error: new Error('invalid verifier') })
    const response = await visit('code=expired')
    expect(response.headers.get('location')).toBe('https://app.example.com/masuk?error=google&next=%2Fkalender')
    log.mockRestore()
  })

  it('requires an actual session after exchange', async () => {
    exchange.mockResolvedValue({ data: { session: null }, error: null })
    expect((await visit('code=empty')).headers.get('location')).toContain('/masuk?error=google')
  })
})
