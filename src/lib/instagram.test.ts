import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  INSTAGRAM_SCOPES,
  InstagramApiError,
  buildAuthorizeUrl,
  createContainer,
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  fetchCustomerProfile,
  fetchOwnProfile,
  fetchProfile,
  fetchRecentMedia,
  getContainerStatus,
  publishContainer,
  sendDirectMessage,
  subscribeToMessages,
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

describe('createContainer', () => {
  it('posts to the account media edge with the token in the body, not the URL', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 'container-1' }))

    const id = await createContainer('token-1', '1784', { image_url: 'https://media.test/a.jpg', caption: 'Halo' })

    expect(id).toBe('container-1')
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('https://graph.instagram.com/1784/media')
    expect(init?.method).toBe('POST')
    expect(Object.fromEntries(init?.body as URLSearchParams)).toEqual({
      image_url: 'https://media.test/a.jpg',
      caption: 'Halo',
      access_token: 'token-1',
    })
  })
})

describe('getContainerStatus', () => {
  it('reads status_code', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status_code: 'FINISHED', id: 'container-1' }))

    await expect(getContainerStatus('token-1', 'container-1')).resolves.toBe('FINISHED')
  })

  it('rejects an unknown status', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status_code: 'SOMETHING_NEW' }))

    await expect(getContainerStatus('token-1', 'container-1')).rejects.toBeInstanceOf(InstagramApiError)
  })
})

describe('publishContainer', () => {
  it('publishes the container and returns the media id', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 'media-1' }))

    await expect(publishContainer('token-1', '1784', 'container-1')).resolves.toBe('media-1')
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('https://graph.instagram.com/1784/media_publish')
    expect(Object.fromEntries(init?.body as URLSearchParams)).toEqual({
      creation_id: 'container-1',
      access_token: 'token-1',
    })
  })
})

describe('InstagramApiError.isTransient', () => {
  it('treats network failures, server errors and throttling as transient', () => {
    expect(new InstagramApiError('timeout', null, 0).isTransient).toBe(true)
    expect(new InstagramApiError('server', null, 503).isTransient).toBe(true)
    expect(new InstagramApiError('throttled', 4, 400).isTransient).toBe(true)
  })

  it('treats a rejected request as permanent', () => {
    expect(new InstagramApiError('bad ratio', 100, 400).isTransient).toBe(false)
  })

  it('follows the is_transient flag in the Graph error body', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { message: 'Please retry', code: 9007, is_transient: true } }, 400),
    )

    const error = await publishContainer('token-1', '1784', 'container-1').catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(InstagramApiError)
    expect((error as InstagramApiError).isTransient).toBe(true)
  })
})

describe('sendDirectMessage', () => {
  it('posts JSON with a bearer token and returns the message id', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ recipient_id: '9012', message_id: 'mid-1' }))

    await expect(sendDirectMessage('token-1', '1784', '9012', 'Halo!')).resolves.toBe('mid-1')
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('https://graph.instagram.com/1784/messages')
    expect(init?.method).toBe('POST')
    expect(init?.headers).toMatchObject({ authorization: 'Bearer token-1', 'content-type': 'application/json' })
    expect(JSON.parse(String(init?.body))).toEqual({ recipient: { id: '9012' }, message: { text: 'Halo!' } })
  })

  it('surfaces a Graph rejection', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { message: 'outside the allowed window', code: 10 } }, 400))

    await expect(sendDirectMessage('token-1', '1784', '9012', 'Halo!')).rejects.toMatchObject({ code: 10 })
  })
})

describe('fetchCustomerProfile', () => {
  it('reads username and name, leaving missing ones null', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ username: 'budi', id: '9012' }))

    await expect(fetchCustomerProfile('token-1', '9012')).resolves.toEqual({ username: 'budi', name: null })
    const url = new URL(String(fetchMock.mock.calls[0][0]))
    expect(url.pathname).toBe('/9012')
    expect(url.searchParams.get('fields')).toBe('username,name')
  })
})

describe('subscribeToMessages', () => {
  it('subscribes the account to the messages field', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true }))

    await subscribeToMessages('token-1')
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('https://graph.instagram.com/me/subscribed_apps')
    expect(Object.fromEntries(init?.body as URLSearchParams)).toEqual({
      subscribed_fields: 'messages',
      access_token: 'token-1',
    })
  })

  it('fails when Meta does not confirm', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: false }))

    await expect(subscribeToMessages('token-1')).rejects.toBeInstanceOf(InstagramApiError)
  })
})

describe('fetchOwnProfile', () => {
  it('returns the name and bio, empty when Instagram leaves them out', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ username: 'kopisinar', biography: 'Ngopi santai', id: '1' }))

    await expect(fetchOwnProfile('token')).resolves.toEqual({ username: 'kopisinar', name: '', biography: 'Ngopi santai' })
    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get('fields')).toBe('username,name,biography')
  })
})

describe('fetchRecentMedia', () => {
  const page = (data: unknown[]) => fetchMock.mockResolvedValueOnce(jsonResponse({ data }))
  const child = (url: string, type = 'IMAGE') => ({ media_type: type, media_url: url })

  it('keeps photos and carousels and skips videos', async () => {
    page([
      { id: '1', media_type: 'IMAGE', media_url: 'https://cdn/1.jpg', caption: 'Halo', permalink: 'https://ig/p/1' },
      { id: '2', media_type: 'CAROUSEL_ALBUM', media_url: 'https://cdn/2.jpg' },
      { id: '3', media_type: 'VIDEO', media_url: 'https://cdn/3.mp4', thumbnail_url: 'https://cdn/3.jpg' },
    ])

    const posts = await fetchRecentMedia('token', 12)

    expect(posts.map((post) => post.id)).toEqual(['1', '2'])
    expect(posts[0]).toEqual({
      id: '1',
      caption: 'Halo',
      imageUrl: 'https://cdn/1.jpg',
      images: ['https://cdn/1.jpg'],
      isCarousel: false,
      permalink: 'https://ig/p/1',
    })
    const url = new URL(String(fetchMock.mock.calls[0][0]))
    expect(url.searchParams.get('limit')).toBe('12')
    expect(url.searchParams.get('fields')).toContain('children{media_type,media_url,thumbnail_url}')
  })

  it('keeps every slide of a carousel, in order', async () => {
    page([
      {
        id: '1',
        media_type: 'CAROUSEL_ALBUM',
        media_url: 'https://cdn/a.jpg',
        children: { data: [child('https://cdn/a.jpg'), child('https://cdn/b.jpg'), child('https://cdn/c.jpg')] },
      },
    ])

    const [post] = await fetchRecentMedia('token', 12)

    expect(post.images).toEqual(['https://cdn/a.jpg', 'https://cdn/b.jpg', 'https://cdn/c.jpg'])
    expect(post.isCarousel).toBe(true)
    expect(post.imageUrl).toBe('https://cdn/a.jpg')
  })

  it('uses the thumbnail of a video slide and skips one without', async () => {
    page([
      {
        id: '1',
        media_type: 'CAROUSEL_ALBUM',
        media_url: 'https://cdn/a.jpg',
        children: {
          data: [
            child('https://cdn/a.jpg'),
            { media_type: 'VIDEO', media_url: 'https://cdn/v.mp4', thumbnail_url: 'https://cdn/v.jpg' },
            { media_type: 'VIDEO', media_url: 'https://cdn/w.mp4' },
          ],
        },
      },
    ])

    const [post] = await fetchRecentMedia('token', 12)

    expect(post.images).toEqual(['https://cdn/a.jpg', 'https://cdn/v.jpg'])
  })

  it('falls back to the cover alone when Instagram leaves out the slides', async () => {
    page([{ id: '1', media_type: 'CAROUSEL_ALBUM', media_url: 'https://cdn/a.jpg' }])

    const [post] = await fetchRecentMedia('token', 12)

    expect(post.images).toEqual(['https://cdn/a.jpg'])
    expect(post.isCarousel).toBe(false)
  })

  it('keeps at most 20 slides', async () => {
    const slides = Array.from({ length: 25 }, (_, index) => child(`https://cdn/${index}.jpg`))
    page([{ id: '1', media_type: 'CAROUSEL_ALBUM', media_url: 'https://cdn/0.jpg', children: { data: slides } }])

    const [post] = await fetchRecentMedia('token', 12)

    expect(post.images).toHaveLength(20)
  })
})
