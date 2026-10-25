import { beforeEach, describe, expect, it, vi } from 'vitest'
import { currentPeriod, currentUser } from '@/lib/auth'
import { after } from 'next/server'
import { hasBrandKit, startBrandSync } from '@/lib/brand'
import { getCompletedAnswers } from '@/lib/onboarding'
import { EMPTY_ANSWERS } from '@/lib/onboarding-options'
import { syncNewAccount } from '@/lib/brand-sync'
import {
  AccountTakenError,
  claimOrphanRows,
  consumeOAuthState,
  draftScheduledPosts,
  getConnectedAccountId,
  saveConnection,
} from '@/lib/connection'
import { deleteOtherFacebookConnections } from '@/lib/facebook-connection'
import { ensureWebhookSubscription } from '@/lib/inbox-sync'
import { exchangeCodeForToken, exchangeForLongLivedToken, fetchProfile, InstagramApiError } from '@/lib/instagram'
import { deleteOtherThreadsConnection } from '@/lib/threads-connection'
import { GET } from './route'

vi.mock('@/lib/auth', () => ({ currentPeriod: vi.fn(), currentUser: vi.fn() }))
vi.mock('@/lib/connection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/connection')>()),
  consumeOAuthState: vi.fn(),
  saveConnection: vi.fn(),
  getConnectedAccountId: vi.fn(),
  draftScheduledPosts: vi.fn(),
  claimOrphanRows: vi.fn(),
}))
vi.mock('next/server', () => ({ after: vi.fn() }))
vi.mock('@/lib/facebook-connection', () => ({ deleteOtherFacebookConnections: vi.fn() }))
vi.mock('@/lib/threads-connection', () => ({ deleteOtherThreadsConnection: vi.fn() }))
vi.mock('@/lib/brand', () => ({ hasBrandKit: vi.fn(), startBrandSync: vi.fn() }))
vi.mock('@/lib/brand-sync', () => ({ syncNewAccount: vi.fn() }))
vi.mock('@/lib/inbox-sync', () => ({ ensureWebhookSubscription: vi.fn() }))
vi.mock('@/lib/onboarding', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/onboarding')>()),
  getCompletedAnswers: vi.fn(),
}))
vi.mock('@/lib/instagram', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/instagram')>()),
  exchangeCodeForToken: vi.fn(),
  exchangeForLongLivedToken: vi.fn(),
  fetchProfile: vi.fn(),
}))

const USER = 'user-1'
const PERIOD = { start: new Date('2026-10-01'), end: new Date('2026-10-31'), activeUntil: new Date('2026-10-31') }
const PROFILE = { userId: '17841400000000001', username: 'creator.test', accountType: 'MEDIA_CREATOR' }
const LONG_TOKEN = { accessToken: 'long-token', expiresAt: new Date('2026-12-13T00:00:00Z') }

const callback = (query: string) =>
  GET(new Request(`https://social-copilot.ngrok-free.app/api/auth/instagram/callback?${query}`))

function runAfterTasks() {
  for (const [task] of vi.mocked(after).mock.calls) void (task as () => unknown)()
}

function redirectTarget(response: Response) {
  const location = new URL(response.headers.get('location') ?? '')
  return { path: `${location.origin}${location.pathname}`, params: Object.fromEntries(location.searchParams) }
}

describe('GET /api/auth/instagram/callback', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(currentUser).mockResolvedValue({ id: USER, email: 'owner@example.com' })
    vi.mocked(currentPeriod).mockResolvedValue(PERIOD)
    vi.mocked(consumeOAuthState).mockResolvedValue('ok')
    vi.mocked(saveConnection).mockResolvedValue()
    vi.mocked(exchangeCodeForToken).mockResolvedValue({
      accessToken: 'short-token',
      permissions: ['instagram_business_basic'],
    })
    vi.mocked(exchangeForLongLivedToken).mockResolvedValue(LONG_TOKEN)
    vi.mocked(fetchProfile).mockResolvedValue(PROFILE)
    vi.mocked(getConnectedAccountId).mockResolvedValue(null)
    vi.mocked(hasBrandKit).mockResolvedValue(true)
    vi.mocked(startBrandSync).mockResolvedValue(true)
  })

  describe('switching and new accounts', () => {
    const connect = () => callback('code=abc&state=s1')

    it('fills the brand of an account connected for the first time, after the redirect', async () => {
      vi.mocked(hasBrandKit).mockResolvedValue(false)

      const response = await connect()

      expect(redirectTarget(response).params).toEqual({ ig: 'connected' })
      expect(hasBrandKit).toHaveBeenCalledWith(USER, PROFILE.userId)
      expect(startBrandSync).toHaveBeenCalledWith(USER, PROFILE.userId, {})
      runAfterTasks()
      expect(syncNewAccount).toHaveBeenCalledWith(USER, PROFILE.userId, undefined)
    })

    it('seeds the new account’s brand with the onboarding answers', async () => {
      vi.mocked(hasBrandKit).mockResolvedValue(false)
      vi.mocked(getCompletedAnswers).mockResolvedValue({
        ...EMPTY_ANSWERS,
        name: 'Kopi Sinar',
        designStyle: 'minimalis',
        headingFont: 'Plus Jakarta Sans',
        postsPerWeek: 5,
        referralSource: 'TikTok',
      })

      await connect()

      expect(startBrandSync).toHaveBeenCalledWith(USER, PROFILE.userId, {
        name: 'Kopi Sinar',
        design_style: 'minimalis',
        heading_font: 'Plus Jakarta Sans',
      })
      runAfterTasks()
      expect(syncNewAccount).toHaveBeenCalledWith(USER, PROFILE.userId, 5)
    })

    it('leaves an account that already has a brand as it is', async () => {
      await connect()

      expect(startBrandSync).not.toHaveBeenCalled()
      runAfterTasks()
      expect(syncNewAccount).not.toHaveBeenCalled()
    })

    it('does not start a second fill another tab already started', async () => {
      vi.mocked(hasBrandKit).mockResolvedValue(false)
      vi.mocked(startBrandSync).mockResolvedValue(false)

      await connect()

      runAfterTasks()
      expect(syncNewAccount).not.toHaveBeenCalled()
    })

    it('subscribes the account to the DM and comment webhooks after the redirect', async () => {
      await connect()

      expect(ensureWebhookSubscription).not.toHaveBeenCalled()
      runAfterTasks()
      expect(ensureWebhookSubscription).toHaveBeenCalledWith(USER)
    })

    it('turns the previous account’s scheduled posts into drafts when another account logs in', async () => {
      vi.mocked(getConnectedAccountId).mockResolvedValue('ig-old')

      await connect()

      expect(draftScheduledPosts).toHaveBeenCalledWith(USER, 'ig-old')
    })

    it('removes Facebook Page tokens of other accounts once the new account is saved', async () => {
      vi.mocked(getConnectedAccountId).mockResolvedValue('ig-old')

      await connect()

      expect(deleteOtherFacebookConnections).toHaveBeenCalledWith(USER, PROFILE.userId)
    })

    it('removes a Threads connection made for another account', async () => {
      vi.mocked(getConnectedAccountId).mockResolvedValue('ig-old')

      await connect()

      expect(deleteOtherThreadsConnection).toHaveBeenCalledWith(USER, PROFILE.userId)
    })

    it('keeps scheduled posts when the same account reconnects', async () => {
      vi.mocked(getConnectedAccountId).mockResolvedValue(PROFILE.userId)

      await connect()

      expect(draftScheduledPosts).not.toHaveBeenCalled()
    })

    it('hands rows without an account to the new connection after saving it', async () => {
      await connect()

      expect(claimOrphanRows).toHaveBeenCalledWith(USER, PROFILE.userId)
      expect(vi.mocked(saveConnection).mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(claimOrphanRows).mock.invocationCallOrder[0],
      )
    })

    it('touches nothing when the account belongs to another user', async () => {
      vi.mocked(getConnectedAccountId).mockResolvedValue('ig-old')
      vi.mocked(saveConnection).mockRejectedValue(new AccountTakenError('taken'))

      await connect()

      expect(draftScheduledPosts).not.toHaveBeenCalled()
      expect(claimOrphanRows).not.toHaveBeenCalled()
      expect(deleteOtherFacebookConnections).not.toHaveBeenCalled()
      expect(deleteOtherThreadsConnection).not.toHaveBeenCalled()
    })
  })

  it('connects the account and redirects to settings', async () => {
    const response = await callback('code=abc&state=s1')

    expect(redirectTarget(response)).toEqual({
      path: 'http://localhost:3000/pengaturan',
      params: { ig: 'connected' },
    })
    expect(consumeOAuthState).toHaveBeenCalledWith('s1', USER)
    expect(exchangeCodeForToken).toHaveBeenCalledWith('abc')
    expect(exchangeForLongLivedToken).toHaveBeenCalledWith('short-token')
    expect(fetchProfile).toHaveBeenCalledWith('long-token')
    expect(saveConnection).toHaveBeenCalledWith(USER, PROFILE, LONG_TOKEN, ['instagram_business_basic'])
  })

  it('sends a visitor without a session to sign in, without touching the state', async () => {
    vi.mocked(currentUser).mockResolvedValue(null)

    expect(redirectTarget(await callback('code=abc&state=s1'))).toEqual({ path: 'http://localhost:3000/masuk', params: {} })
    expect(consumeOAuthState).not.toHaveBeenCalled()
  })

  it('sends a user without an active subscription to Langganan, without touching the state', async () => {
    vi.mocked(currentPeriod).mockResolvedValue(null)

    expect(redirectTarget(await callback('code=abc&state=s1')).path).toBe('http://localhost:3000/langganan')
    expect(consumeOAuthState).not.toHaveBeenCalled()
  })

  it('refuses an Instagram account another user already connected', async () => {
    vi.mocked(saveConnection).mockRejectedValue(new AccountTakenError('taken'))

    expect(redirectTarget(await callback('code=abc&state=s1')).params).toEqual({ ig_error: 'akun_dipakai' })
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

  it('explains a state another signed-in user started, without logging in', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.mocked(consumeOAuthState).mockResolvedValue('other_user')

    const response = await callback('code=abc&state=s1')

    expect(redirectTarget(response).params).toEqual({ ig_error: 'sesi_lain' })
    expect(exchangeCodeForToken).not.toHaveBeenCalled()
  })

  it('rejects an unknown or expired state', async () => {
    vi.mocked(consumeOAuthState).mockResolvedValue('invalid')

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

  it('shows the provider reason, HTTP status and error code for a rejected login code', async () => {
    vi.mocked(exchangeCodeForToken).mockRejectedValue(new InstagramApiError('Invalid authorization code', 400, 400))

    expect(redirectTarget(await callback('code=abc&state=s1')).params).toEqual({
      ig_error: 'gagal_token',
      ig_error_detail: 'Invalid authorization code (HTTP 400, kode 400)',
    })
    expect(saveConnection).not.toHaveBeenCalled()
  })

  it('distinguishes long-lived token failures and removes echoed credentials from diagnostics', async () => {
    vi.stubEnv('INSTAGRAM_APP_SECRET', 'secret/value')
    try {
      vi.mocked(exchangeForLongLivedToken).mockRejectedValue(new InstagramApiError(
        'Rejected short-token secret%2Fvalue code=abc state=s1 access_token=other-token', 190, 400,
      ))

      const params = redirectTarget(await callback('code=abc&state=s1')).params

      expect(params.ig_error).toBe('gagal_token_panjang')
      expect(params.ig_error_detail).toContain('HTTP 400, kode 190')
      for (const secret of ['short-token', 'secret%2Fvalue', 'abc', 's1', 'other-token']) {
        expect(params.ig_error_detail).not.toContain(secret)
        expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(secret)
      }
      expect(fetchProfile).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('reports database failures', async () => {
    vi.mocked(saveConnection).mockRejectedValue(new Error('Supabase down'))
    expect(redirectTarget(await callback('code=abc&state=s1')).params).toEqual({ ig_error: 'gagal_database' })

    vi.mocked(consumeOAuthState).mockRejectedValue(new Error('Supabase down'))
    expect(redirectTarget(await callback('code=abc&state=s1')).params).toEqual({ ig_error: 'gagal_database' })
  })
})
