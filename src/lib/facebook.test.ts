import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FACEBOOK_SCOPES,
  buildFacebookAuthorizeUrl,
  choosePage,
  discoverAccount,
  exchangeFacebookCode,
  exchangeForLongLivedUserToken,
  fetchInstagramPages,
  parseInstagramUsername,
  type InstagramPage,
} from './facebook'
import { InstagramApiError } from './instagram'

const REDIRECT_URI = 'https://social-copilot.ngrok-free.app/api/auth/facebook/callback'
const fetchMock = vi.fn<typeof fetch>()

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const calledUrl = (call = 0) => new URL(String(fetchMock.mock.calls[call][0]))

beforeEach(() => {
  vi.stubEnv('FACEBOOK_APP_ID', 'fb-app')
  vi.stubEnv('FACEBOOK_APP_SECRET', 'fb-secret')
  vi.stubEnv('FACEBOOK_REDIRECT_URI', REDIRECT_URI)
  vi.stubEnv('FACEBOOK_LOGIN_CONFIG_ID', '')
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  fetchMock.mockReset()
})

describe('buildFacebookAuthorizeUrl', () => {
  it('asks for the scopes with classic Facebook Login', () => {
    const url = new URL(buildFacebookAuthorizeUrl('state-1'))

    expect(`${url.origin}${url.pathname}`).toBe('https://www.facebook.com/v25.0/dialog/oauth')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'fb-app',
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      state: 'state-1',
      scope: FACEBOOK_SCOPES.join(','),
    })
  })

  it('sends the configuration instead with Facebook Login for Business', () => {
    vi.stubEnv('FACEBOOK_LOGIN_CONFIG_ID', ' 123456 ')
    const params = new URL(buildFacebookAuthorizeUrl('state-1')).searchParams

    expect(params.get('config_id')).toBe('123456')
    expect(params.get('override_default_response_type')).toBe('true')
    expect(params.has('scope')).toBe(false)
  })
})

describe('token exchange', () => {
  it('trades the code, then the short-lived token', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: 'short', token_type: 'bearer', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ access_token: 'long', token_type: 'bearer' }))

    await expect(exchangeFacebookCode('code-1')).resolves.toBe('short')
    await expect(exchangeForLongLivedUserToken('short')).resolves.toBe('long')

    expect(calledUrl(0).pathname).toBe('/v25.0/oauth/access_token')
    expect(Object.fromEntries(calledUrl(0).searchParams)).toEqual({
      client_id: 'fb-app',
      client_secret: 'fb-secret',
      redirect_uri: REDIRECT_URI,
      code: 'code-1',
    })
    expect(calledUrl(1).searchParams.get('grant_type')).toBe('fb_exchange_token')
    expect(calledUrl(1).searchParams.get('fb_exchange_token')).toBe('short')
  })

  it('turns a Graph error into an InstagramApiError', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { message: 'Invalid verification code', code: 100 } }, 400))

    await expect(exchangeFacebookCode('bad')).rejects.toMatchObject({ code: 100, status: 400 })
  })
})

const PAGE_A: InstagramPage = {
  pageId: 'p1',
  pageName: 'Kopi Sinar',
  pageToken: 'token-a',
  instagramUserId: '17841400000000001',
  username: 'kopisinar',
}

describe('fetchInstagramPages', () => {
  it('keeps only Pages with an Instagram account', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: [
          { id: 'p0', name: 'Tanpa IG', access_token: 'token-0' },
          {
            id: 'p1',
            name: 'Kopi Sinar',
            access_token: 'token-a',
            instagram_business_account: { id: '17841400000000001', username: 'kopisinar' },
          },
        ],
      }),
    )

    await expect(fetchInstagramPages('long')).resolves.toEqual([PAGE_A])
    expect(calledUrl().pathname).toBe('/v25.0/me/accounts')
  })
})

describe('choosePage', () => {
  const pageB = { ...PAGE_A, pageId: 'p2', instagramUserId: '17841400000000002' }

  it('prefers the Page of the Instagram account already connected', () => {
    expect(choosePage([PAGE_A, pageB], '17841400000000002')).toBe(pageB)
  })

  it('falls back to the first Page, or null without any', () => {
    expect(choosePage([PAGE_A, pageB], null)).toBe(PAGE_A)
    expect(choosePage([], '1')).toBeNull()
  })
})

describe('parseInstagramUsername', () => {
  it.each([
    ['@KopiSinar', 'kopisinar'],
    ['kopi.sinar_id', 'kopi.sinar_id'],
    ['https://www.instagram.com/kopisinar/', 'kopisinar'],
    ['instagram.com/kopisinar?igsh=abc', 'kopisinar'],
  ])('reads %s', (input, username) => {
    expect(parseInstagramUsername(input)).toBe(username)
  })

  it.each(['', '@', 'kopi sinar', 'https://www.instagram.com/p/C0abc/', 'a'.repeat(31), 'kopi){id}'])('rejects %s', (input) => {
    expect(parseInstagramUsername(input)).toBeNull()
  })
})

describe('discoverAccount', () => {
  it('returns the profile and its image posts, skipping videos', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        business_discovery: {
          username: 'kopisaingan',
          name: 'Kopi Saingan',
          biography: 'Kopi enak',
          followers_count: 1200,
          media: {
            data: [
              { id: 'm1', caption: 'Promo', media_type: 'IMAGE', media_url: 'https://cdn/m1.jpg', permalink: 'https://ig/p/1' },
              { id: 'm2', media_type: 'VIDEO', media_url: 'https://cdn/m2.mp4', permalink: 'https://ig/p/2' },
              {
                id: 'm3',
                media_type: 'CAROUSEL_ALBUM',
                media_url: 'https://cdn/m3.jpg',
                children: {
                  data: [
                    { media_type: 'IMAGE', media_url: 'https://cdn/m3.jpg' },
                    { media_type: 'IMAGE', media_url: 'https://cdn/m3b.jpg' },
                  ],
                },
              },
            ],
          },
        },
      }),
    )

    const account = await discoverAccount('token-a', '17841400000000001', 'kopisaingan')

    expect(account).toEqual({
      username: 'kopisaingan',
      name: 'Kopi Saingan',
      biography: 'Kopi enak',
      followersCount: 1200,
      posts: [
        {
          id: 'm1',
          caption: 'Promo',
          imageUrl: 'https://cdn/m1.jpg',
          images: ['https://cdn/m1.jpg'],
          isCarousel: false,
          permalink: 'https://ig/p/1',
        },
        {
          id: 'm3',
          caption: '',
          imageUrl: 'https://cdn/m3.jpg',
          images: ['https://cdn/m3.jpg', 'https://cdn/m3b.jpg'],
          isCarousel: true,
          permalink: null,
        },
      ],
    })
    expect(calledUrl().pathname).toBe('/v25.0/17841400000000001')
    expect(calledUrl().searchParams.get('fields')).toMatch(/^business_discovery\.username\(kopisaingan\)\{/)
    expect(calledUrl().searchParams.get('fields')).toContain('children{media_type,media_url}')
  })

  it('refuses a username that would break out of the field syntax', async () => {
    await expect(discoverAccount('token-a', '1', 'x){id}')).rejects.toBeInstanceOf(InstagramApiError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('passes Graph code 110 through for a personal or unknown account', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { message: 'Invalid user id', code: 110 } }, 400))

    await expect(discoverAccount('token-a', '1', 'personal')).rejects.toMatchObject({ code: 110 })
  })
})
