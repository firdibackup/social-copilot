import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { signInWithGoogle } from './actions'

const oauth = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth', () => ({ authClient: async () => ({ auth: { signInWithOAuth: oauth } }) }))
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`) } }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('APP_URL', 'https://app.example.com')
})
afterEach(() => vi.unstubAllEnvs())

describe('Google sign in', () => {
  it('starts OAuth with a PKCE callback and preserves the requested destination', async () => {
    oauth.mockResolvedValue({ data: { url: 'https://auth.example.com/authorize' }, error: null })
    const form = new FormData()
    form.set('next', '/mimo')
    await expect(signInWithGoogle({ error: null }, form)).rejects.toThrow('redirect:https://auth.example.com/authorize')
    expect(oauth).toHaveBeenCalledExactlyOnceWith({
      provider: 'google',
      options: {
        redirectTo: 'https://app.example.com/auth/callback?next=%2Fmimo',
        queryParams: { prompt: 'select_account' },
      },
    })
  })

  it('reports provider/network failures inline', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    oauth.mockRejectedValue(new Error('unavailable'))
    expect((await signInWithGoogle({ error: null }, new FormData())).error).toContain('Login Google belum tersedia')
    log.mockRestore()
  })
})
