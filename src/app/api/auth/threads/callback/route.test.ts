import { beforeEach, describe, expect, it, vi } from 'vitest'
import { currentPeriod, currentUser } from '@/lib/auth'
import { consumeOAuthState, getConnectedAccountId } from '@/lib/connection'
import { exchangeThreadsCode, exchangeThreadsLongLivedToken, fetchThreadsProfile, THREADS_SCOPES } from '@/lib/threads'
import { saveThreadsConnection, ThreadsTakenError } from '@/lib/threads-connection'
import { GET } from './route'

vi.mock('@/lib/auth', () => ({ currentPeriod: vi.fn(), currentUser: vi.fn() }))
vi.mock('@/lib/connection', () => ({ consumeOAuthState: vi.fn(), getConnectedAccountId: vi.fn() }))
vi.mock('@/lib/threads', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/threads')>()),
  exchangeThreadsCode: vi.fn(),
  exchangeThreadsLongLivedToken: vi.fn(),
  fetchThreadsProfile: vi.fn(),
}))
vi.mock('@/lib/threads-connection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/threads-connection')>()),
  saveThreadsConnection: vi.fn(),
}))

const USER = 'user-1'
const PERIOD = { start: new Date('2026-10-01'), end: new Date('2026-10-31'), activeUntil: new Date('2026-10-31') }
const PROFILE = { userId: 't1', username: 'toko', pictureUrl: null }
const LONG_TOKEN = { accessToken: 'long-token', expiresAt: new Date('2026-12-19T00:00:00Z') }

const callback = (query: string) => GET(new Request(`https://app.test/api/auth/threads/callback?${query}`))

function redirectTarget(response: Response) {
  const location = new URL(response.headers.get('location') ?? '')
  return { path: location.pathname, params: Object.fromEntries(location.searchParams) }
}

describe('Threads OAuth callback', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(currentUser).mockResolvedValue({ id: USER, email: 'a@b.c' })
    vi.mocked(currentPeriod).mockResolvedValue(PERIOD)
    vi.mocked(consumeOAuthState).mockResolvedValue('ok')
    vi.mocked(getConnectedAccountId).mockResolvedValue('ig-1')
    vi.mocked(exchangeThreadsCode).mockResolvedValue('short-token')
    vi.mocked(exchangeThreadsLongLivedToken).mockResolvedValue(LONG_TOKEN)
    vi.mocked(fetchThreadsProfile).mockResolvedValue(PROFILE)
    vi.mocked(saveThreadsConnection).mockResolvedValue(undefined)
  })

  it('saves the connection for the connected Instagram account and reports it', async () => {
    const response = await callback('code=abc&state=s1')

    expect(consumeOAuthState).toHaveBeenCalledWith('s1', USER)
    expect(exchangeThreadsLongLivedToken).toHaveBeenCalledWith('short-token')
    expect(saveThreadsConnection).toHaveBeenCalledWith(USER, 'ig-1', PROFILE, LONG_TOKEN, THREADS_SCOPES)
    expect(redirectTarget(response)).toEqual({ path: '/pengaturan', params: { th: 'connected' } })
  })

  it('sends a visitor without a session to sign in', async () => {
    vi.mocked(currentUser).mockResolvedValue(null)

    expect(redirectTarget(await callback('code=abc&state=s1')).path).toBe('/masuk')
    expect(consumeOAuthState).not.toHaveBeenCalled()
  })

  it('sends a user without a subscription to Langganan', async () => {
    vi.mocked(currentPeriod).mockResolvedValue(null)

    expect(redirectTarget(await callback('code=abc&state=s1')).path).toBe('/langganan')
  })

  it.each([
    ['a refused login', 'error=access_denied&state=s1', 'ditolak'],
    ['a missing code', 'state=s1', 'state_tidak_valid'],
  ])('reports %s', async (_label, query, code) => {
    expect(redirectTarget(await callback(query)).params).toEqual({ th_error: code })
    expect(saveThreadsConnection).not.toHaveBeenCalled()
  })

  it('refuses a state another signed-in user started', async () => {
    vi.mocked(consumeOAuthState).mockResolvedValue('other_user')

    expect(redirectTarget(await callback('code=abc&state=s1')).params).toEqual({ th_error: 'sesi_lain' })
    expect(exchangeThreadsCode).not.toHaveBeenCalled()
  })

  it('needs an Instagram account to connect Threads for', async () => {
    vi.mocked(getConnectedAccountId).mockResolvedValue(null)

    expect(redirectTarget(await callback('code=abc&state=s1')).params).toEqual({ th_error: 'perlu_instagram' })
    expect(exchangeThreadsCode).not.toHaveBeenCalled()
  })

  it('reports a failed token exchange without details', async () => {
    vi.mocked(exchangeThreadsCode).mockRejectedValue(new Error('redirect_uri mismatch'))

    expect(redirectTarget(await callback('code=abc&state=s1')).params).toEqual({ th_error: 'gagal_token' })
  })

  it('reports a Threads account another user connected', async () => {
    vi.mocked(saveThreadsConnection).mockRejectedValue(new ThreadsTakenError('taken'))

    expect(redirectTarget(await callback('code=abc&state=s1')).params).toEqual({ th_error: 'akun_dipakai' })
  })
})
