import { beforeEach, describe, expect, it, vi } from 'vitest'
import { currentPeriod, currentUser } from '@/lib/auth'
import { consumeOAuthState, getConnectedAccountId } from '@/lib/connection'
import { exchangeFacebookCode, exchangeForLongLivedUserToken, fetchInstagramPages } from '@/lib/facebook'
import { saveFacebookConnection } from '@/lib/facebook-connection'
import { GET } from './route'

vi.mock('@/lib/auth', () => ({ currentPeriod: vi.fn(), currentUser: vi.fn() }))
vi.mock('@/lib/connection', () => ({ consumeOAuthState: vi.fn(), getConnectedAccountId: vi.fn() }))
vi.mock('@/lib/facebook-connection', () => ({ saveFacebookConnection: vi.fn() }))
vi.mock('@/lib/facebook', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/facebook')>()),
  exchangeFacebookCode: vi.fn(),
  exchangeForLongLivedUserToken: vi.fn(),
  fetchInstagramPages: vi.fn(),
}))

const USER = 'user-1'
const PERIOD = { start: new Date('2026-10-01'), end: new Date('2026-10-31'), activeUntil: new Date('2026-10-31') }
const PAGE = {
  pageId: 'p1',
  pageName: 'Kopi Sinar',
  pageToken: 'page-token',
  instagramUserId: '17841400000000001',
  username: 'kopisinar',
}

const callback = (query: string) =>
  GET(new Request(`https://social-copilot.ngrok-free.app/api/auth/facebook/callback?${query}`))

const redirectParams = (response: Response) =>
  Object.fromEntries(new URL(response.headers.get('location') ?? '').searchParams)

describe('GET /api/auth/facebook/callback', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(currentUser).mockResolvedValue({ id: USER, email: 'owner@example.com' })
    vi.mocked(currentPeriod).mockResolvedValue(PERIOD)
    vi.mocked(consumeOAuthState).mockResolvedValue(true)
    vi.mocked(getConnectedAccountId).mockResolvedValue('17841400000000001')
    vi.mocked(exchangeFacebookCode).mockResolvedValue('short-token')
    vi.mocked(exchangeForLongLivedUserToken).mockResolvedValue('long-token')
    vi.mocked(fetchInstagramPages).mockResolvedValue([PAGE])
  })

  it('stores the Page token and reports success on the settings page', async () => {
    const response = await callback('code=abc&state=s1')

    expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/pengaturan')
    expect(redirectParams(response)).toEqual({ fb: 'connected' })
    expect(exchangeForLongLivedUserToken).toHaveBeenCalledWith('short-token')
    expect(fetchInstagramPages).toHaveBeenCalledWith('long-token')
    expect(consumeOAuthState).toHaveBeenCalledWith('s1', USER)
    expect(getConnectedAccountId).toHaveBeenCalledWith(USER)
    expect(saveFacebookConnection).toHaveBeenCalledWith(USER, PAGE)
  })

  it('sends a visitor without a session to sign in, without touching the state', async () => {
    vi.mocked(currentUser).mockResolvedValue(null)

    expect(new URL((await callback('code=abc&state=s1')).headers.get('location') ?? '').pathname).toBe('/masuk')
    expect(consumeOAuthState).not.toHaveBeenCalled()
  })

  it('reports a denied login without consuming the state', async () => {
    expect(redirectParams(await callback('error=access_denied&state=s1'))).toEqual({ fb_error: 'ditolak' })
    expect(consumeOAuthState).not.toHaveBeenCalled()
  })

  it('rejects a reused or unknown state', async () => {
    vi.mocked(consumeOAuthState).mockResolvedValue(false)

    expect(redirectParams(await callback('code=abc&state=old'))).toEqual({ fb_error: 'state_tidak_valid' })
    expect(exchangeFacebookCode).not.toHaveBeenCalled()
  })

  it('explains when no Page has an Instagram account', async () => {
    vi.mocked(fetchInstagramPages).mockResolvedValue([])

    expect(redirectParams(await callback('code=abc&state=s1'))).toEqual({ fb_error: 'tanpa_instagram' })
    expect(saveFacebookConnection).not.toHaveBeenCalled()
  })

  it('maps a failed token exchange to gagal_token', async () => {
    vi.mocked(exchangeFacebookCode).mockRejectedValue(new Error('Invalid verification code'))

    expect(redirectParams(await callback('code=abc&state=s1'))).toEqual({ fb_error: 'gagal_token' })
  })
})
