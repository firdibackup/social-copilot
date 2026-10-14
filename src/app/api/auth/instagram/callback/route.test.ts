import { beforeEach, describe, expect, it, vi } from 'vitest'
import { consumeOAuthState, saveConnection } from '@/lib/connection'
import { exchangeCodeForToken, exchangeForLongLivedToken, fetchProfile } from '@/lib/instagram'
import { GET } from './route'

vi.mock('@/lib/connection', () => ({ consumeOAuthState: vi.fn(), saveConnection: vi.fn() }))
vi.mock('@/lib/instagram', () => ({
  exchangeCodeForToken: vi.fn(),
  exchangeForLongLivedToken: vi.fn(),
  fetchProfile: vi.fn(),
}))

const PROFILE = { userId: '17841400000000001', username: 'creator.test', accountType: 'MEDIA_CREATOR' }
const LONG_TOKEN = { accessToken: 'long-token', expiresAt: new Date('2026-12-13T00:00:00Z') }

const callback = (query: string) =>
  GET(new Request(`https://social-copilot.ngrok-free.app/api/auth/instagram/callback?${query}`))

function redirectTarget(response: Response) {
  const location = new URL(response.headers.get('location') ?? '')
  return { path: `${location.origin}${location.pathname}`, params: Object.fromEntries(location.searchParams) }
}

describe('GET /api/auth/instagram/callback', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(consumeOAuthState).mockResolvedValue(true)
    vi.mocked(exchangeCodeForToken).mockResolvedValue({
      accessToken: 'short-token',
      permissions: ['instagram_business_basic'],
    })
    vi.mocked(exchangeForLongLivedToken).mockResolvedValue(LONG_TOKEN)
    vi.mocked(fetchProfile).mockResolvedValue(PROFILE)
  })

  it('connects the account and redirects to settings', async () => {
    const response = await callback('code=abc&state=s1')

    expect(redirectTarget(response)).toEqual({
      path: 'http://localhost:3000/pengaturan',
      params: { ig: 'connected' },
    })
    expect(consumeOAuthState).toHaveBeenCalledWith('s1')
    expect(exchangeCodeForToken).toHaveBeenCalledWith('abc')
    expect(exchangeForLongLivedToken).toHaveBeenCalledWith('short-token')
    expect(fetchProfile).toHaveBeenCalledWith('long-token')
    expect(saveConnection).toHaveBeenCalledWith(PROFILE, LONG_TOKEN, ['instagram_business_basic'])
  })

  it('reports a denied permission without consuming the state', async () => {
    const response = await callback('error=access_denied&error_reason=user_denied&state=s1')

    expect(redirectTarget(response).params).toEqual({ ig_error: 'ditolak' })
    expect(consumeOAuthState).not.toHaveBeenCalled()
  })

  it('rejects a request without a code', async () => {
    const response = await callback('state=s1')

    expect(redirectTarget(response).params).toEqual({ ig_error: 'state_tidak_valid' })
    expect(exchangeCodeForToken).not.toHaveBeenCalled()
  })

  it('rejects an unknown or expired state', async () => {
    vi.mocked(consumeOAuthState).mockResolvedValue(false)

    const response = await callback('code=abc&state=forged')

    expect(redirectTarget(response).params).toEqual({ ig_error: 'state_tidak_valid' })
    expect(exchangeCodeForToken).not.toHaveBeenCalled()
  })

  it('reports a failed token exchange', async () => {
    vi.mocked(exchangeCodeForToken).mockRejectedValue(new Error('Invalid authorization code'))

    const response = await callback('code=abc&state=s1')

    expect(redirectTarget(response).params).toEqual({ ig_error: 'gagal_token' })
    expect(saveConnection).not.toHaveBeenCalled()
  })

  it('reports a failed profile fetch', async () => {
    vi.mocked(fetchProfile).mockRejectedValue(new Error('timeout'))

    const response = await callback('code=abc&state=s1')

    expect(redirectTarget(response).params).toEqual({ ig_error: 'gagal_profil' })
    expect(saveConnection).not.toHaveBeenCalled()
  })

  it('reports database failures', async () => {
    vi.mocked(saveConnection).mockRejectedValue(new Error('Supabase down'))
    expect(redirectTarget(await callback('code=abc&state=s1')).params).toEqual({ ig_error: 'gagal_database' })

    vi.mocked(consumeOAuthState).mockRejectedValue(new Error('Supabase down'))
    expect(redirectTarget(await callback('code=abc&state=s1')).params).toEqual({ ig_error: 'gagal_database' })
  })
})
