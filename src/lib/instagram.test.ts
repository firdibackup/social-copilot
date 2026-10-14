import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  INSTAGRAM_SCOPES,
  InstagramApiError,
  buildAuthorizeUrl,
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  fetchProfile,
} from './instagram'

const REDIRECT_URI = 'https://social-copilot.ngrok-free.app/api/auth/instagram/callback'
const fetchMock = vi.fn<typeof fetch>()

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

beforeEach(() => {
  vi.stubEnv('INSTAGRAM_APP_ID', 'app-id')
  vi.stubEnv('INSTAGRAM_APP_SECRET', 'app-secret')
  vi.stubEnv('INSTAGRAM_REDIRECT_URI', REDIRECT_URI)
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  fetchMock.mockReset()
})

describe('buildAuthorizeUrl', () => {
  it('includes the client, redirect URI, scopes and state', () => {
    const url = new URL(buildAuthorizeUrl('state-123'))

    expect(`${url.origin}${url.pathname}`).toBe('https://www.instagram.com/oauth/authorize')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'app-id',
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: INSTAGRAM_SCOPES.join(','),
      state: 'state-123',
    })
  })
})

describe('exchangeCodeForToken', () => {
  it('posts the code and reads the data[] response shape', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: [
          {
            access_token: 'short-token',
            user_id: 17841400000000000,
            permissions: 'instagram_business_basic,instagram_business_content_publish',
          },
        ],
      }),
    )

    const token = await exchangeCodeForToken('code-abc')

    expect(token).toEqual({
      accessToken: 'short-token',
      permissions: ['instagram_business_basic', 'instagram_business_content_publish'],
    })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.instagram.com/oauth/access_token')
    expect(init?.method).toBe('POST')
    const body = new URLSearchParams(String(init?.body))
    expect(Object.fromEntries(body)).toEqual({
      client_id: 'app-id',
      client_secret: 'app-secret',
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI,
      code: 'code-abc',
    })
  })

  it('reads the flat response shape with array permissions', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ access_token: 'short-token', permissions: ['instagram_business_basic'] }))

    expect(await exchangeCodeForToken('code-abc')).toEqual({
      accessToken: 'short-token',
      permissions: ['instagram_business_basic'],
    })
  })

  it('rejects a response without an access token', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [] }))

    await expect(exchangeCodeForToken('code-abc')).rejects.toBeInstanceOf(InstagramApiError)
  })

  it('surfaces the OAuth error message and status', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error_type: 'OAuthException', code: 400, error_message: 'Invalid authorization code' }, 400),
    )

    await expect(exchangeCodeForToken('code-abc')).rejects.toMatchObject({
      message: 'Invalid authorization code',
      status: 400,
    })
  })
})

describe('exchangeForLongLivedToken', () => {
  it('converts expires_in into an absolute expiry', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-14T00:00:00Z'), toFake: ['Date'] })
    fetchMock.mockResolvedValue(jsonResponse({ access_token: 'long-token', token_type: 'bearer', expires_in: 5_184_000 }))

    const token = await exchangeForLongLivedToken('short-token')

    expect(token).toEqual({ accessToken: 'long-token', expiresAt: new Date('2026-12-13T00:00:00Z') })
    const url = new URL(String(fetchMock.mock.calls[0][0]))
    expect(`${url.origin}${url.pathname}`).toBe('https://graph.instagram.com/access_token')
    expect(url.searchParams.get('grant_type')).toBe('ig_exchange_token')
    expect(url.searchParams.get('access_token')).toBe('short-token')
  })
})

describe('fetchProfile', () => {
  it('returns the account profile', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ user_id: '17841400000000001', username: 'creator.test', account_type: 'MEDIA_CREATOR', id: '1' }),
    )

    expect(await fetchProfile('long-token')).toEqual({
      userId: '17841400000000001',
      username: 'creator.test',
      accountType: 'MEDIA_CREATOR',
    })
  })

  it('flags Graph error 190 as an invalid token', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { message: 'Error validating access token', type: 'OAuthException', code: 190 } }, 400),
    )

    const error = await fetchProfile('long-token').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(InstagramApiError)
    expect((error as InstagramApiError).isInvalidToken).toBe(true)
  })

  it('does not leak the request URL when the network fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed: https://graph.instagram.com/me?access_token=SECRET'))

    const error = await fetchProfile('SECRET').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(InstagramApiError)
    expect((error as Error).message).not.toContain('SECRET')
  })
})
