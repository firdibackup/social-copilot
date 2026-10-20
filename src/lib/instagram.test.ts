import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  INSTAGRAM_SCOPES,
  InstagramApiError,
  buildAuthorizeUrl,
  createContainer,
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  fetchCustomerProfile,
  fetchFollowsBusiness,
  fetchOwnMedia,
  fetchOwnProfile,
  fetchProfile,
  fetchRecentMedia,
  getContainerStatus,
  getMediaInsights,
  listInstagramConversations,
  listMediaComments,
  listMediaSince,
  publishContainer,
  sendAutoDm,
  sendDirectMessage,
  subscribeToWebhooks,
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
      force_reauth: 'true',
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

describe('sendAutoDm', () => {
  it('sends a private reply with buttons as a button template', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ recipient_id: '9012', message_id: 'mid-1' }))

    const buttons = [{ type: 'postback' as const, title: 'Kirim linknya', payload: 'autodm:rule' }]
    await expect(sendAutoDm('token-1', '1784', { comment_id: '555' }, { text: 'Mau linknya?', buttons })).resolves.toEqual({
      messageId: 'mid-1',
      recipientId: '9012',
    })
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('https://graph.instagram.com/1784/messages')
    expect(JSON.parse(String(init?.body))).toEqual({
      recipient: { comment_id: '555' },
      message: {
        attachment: { type: 'template', payload: { template_type: 'button', text: 'Mau linknya?', buttons } },
      },
    })
  })

  it('sends plain text when there are no buttons', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message_id: 'mid-2' }))

    await sendAutoDm('token-1', '1784', { id: '9012' }, { text: 'Ini linknya', buttons: [] })
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      recipient: { id: '9012' },
      message: { text: 'Ini linknya' },
    })
  })
})

describe('fetchFollowsBusiness', () => {
  it('reads whether the customer follows the account', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ is_user_follow_business: true, id: '9012' }))

    await expect(fetchFollowsBusiness('token-1', '9012')).resolves.toBe(true)
    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get('fields')).toBe('is_user_follow_business')
  })

  it('fails when Instagram leaves the field out, instead of guessing', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: '9012' }))

    await expect(fetchFollowsBusiness('token-1', '9012')).rejects.toBeInstanceOf(InstagramApiError)
  })
})

describe('fetchOwnMedia', () => {
  it('lists one page of the account’s posts, videos with their still', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: [
          { id: '111', media_type: 'IMAGE', media_url: 'https://cdn/a.jpg', timestamp: '2026-10-18T10:00:00+0000' },
          { id: '222', media_type: 'VIDEO', thumbnail_url: 'https://cdn/b.jpg', timestamp: '2026-10-17T10:00:00+0000' },
          { id: 'bad', media_type: 'IMAGE', timestamp: '2026-10-17T10:00:00+0000' },
        ],
      }),
    )

    const media = await fetchOwnMedia('token-1', 24)
    expect(media.map((item) => [item.id, item.thumbnailUrl])).toEqual([
      ['111', 'https://cdn/a.jpg'],
      ['222', 'https://cdn/b.jpg'],
    ])
    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get('limit')).toBe('24')
  })
})

describe('fetchCustomerProfile', () => {
  it('reads username, name and picture, leaving missing ones null', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ username: 'budi', id: '9012' }))

    await expect(fetchCustomerProfile('token-1', '9012')).resolves.toEqual({
      username: 'budi',
      name: null,
      profilePicUrl: null,
    })
    const url = new URL(String(fetchMock.mock.calls[0][0]))
    expect(url.pathname).toBe('/9012')
    expect(url.searchParams.get('fields')).toBe('username,name,profile_pic')
  })

  it('reads the profile picture URL', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ username: 'budi', name: 'Budi', profile_pic: 'https://cdn/b.jpg' }))

    await expect(fetchCustomerProfile('token-1', '9012')).resolves.toEqual({
      username: 'budi',
      name: 'Budi',
      profilePicUrl: 'https://cdn/b.jpg',
    })
  })
})

describe('subscribeToWebhooks', () => {
  it('subscribes the account to messages, Auto DM button taps and comments', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true }))

    await subscribeToWebhooks('token-1', INSTAGRAM_SCOPES)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('https://graph.instagram.com/me/subscribed_apps')
    expect(Object.fromEntries(init?.body as URLSearchParams)).toEqual({
      subscribed_fields: 'messages,messaging_postbacks,comments',
      access_token: 'token-1',
    })
  })

  it('leaves comments out until their permission is granted, which Meta would refuse', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true }))

    await subscribeToWebhooks('token-1', ['instagram_business_basic', 'instagram_business_manage_messages'])
    expect(Object.fromEntries(fetchMock.mock.calls[0][1]?.body as URLSearchParams)).toMatchObject({
      subscribed_fields: 'messages,messaging_postbacks',
    })
  })

  it('fails when Meta does not confirm', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: false }))

    await expect(subscribeToWebhooks('token-1', INSTAGRAM_SCOPES)).rejects.toBeInstanceOf(InstagramApiError)
  })
})

describe('fetchOwnProfile', () => {
  it('returns the name and bio, empty when Instagram leaves them out', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ username: 'kopisinar', biography: 'Ngopi santai', id: '1' }))

    await expect(fetchOwnProfile('token')).resolves.toEqual({
      username: 'kopisinar',
      name: '',
      biography: 'Ngopi santai',
      profilePictureUrl: null,
    })
    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get('fields')).toBe(
      'username,name,biography,profile_picture_url',
    )
  })

  it('returns the profile picture for the new-account logo', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ username: 'kopisinar', profile_picture_url: 'https://cdn/p.jpg' }))

    await expect(fetchOwnProfile('token')).resolves.toMatchObject({ profilePictureUrl: 'https://cdn/p.jpg' })
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

describe('listMediaSince', () => {
  const since = new Date('2026-09-01T00:00:00Z')
  const item = (id: string, timestamp: string, extra: Record<string, unknown> = {}) => ({
    id,
    media_type: 'IMAGE',
    media_product_type: 'FEED',
    media_url: `https://cdn/${id}.jpg`,
    timestamp,
    ...extra,
  })
  const nextPage = (after: string) => ({ cursors: { after }, next: 'https://graph.instagram.com/next' })

  it('follows cursors and stops at the first page that reaches past `since`', async () => {
    // Arrange
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: [item('1', '2026-10-10T08:00:00+0000', { like_count: 4, comments_count: 1, caption: 'Halo' })],
          paging: nextPage('cursor-1'),
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [item('2', '2026-09-05T08:00:00+0000'), item('3', '2026-08-20T08:00:00+0000')],
          paging: nextPage('cursor-2'),
        }),
      )

    // Act
    const result = await listMediaSince('token', since, 100)

    // Assert
    expect(result.isComplete).toBe(true)
    expect(result.media.map((media) => media.id)).toEqual(['1', '2'])
    expect(result.media[0]).toEqual({
      id: '1',
      mediaType: 'IMAGE',
      productType: 'FEED',
      caption: 'Halo',
      permalink: null,
      thumbnailUrl: 'https://cdn/1.jpg',
      postedAt: new Date('2026-10-10T08:00:00Z'),
      likes: 4,
      comments: 1,
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const second = new URL(String(fetchMock.mock.calls[1][0]))
    expect(second.pathname).toBe('/me/media')
    expect(second.searchParams.get('after')).toBe('cursor-1')
    expect(second.searchParams.get('fields')).toContain('media_product_type')
  })

  it('keeps an older pinned post out without stopping early', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: [item('9', '2026-01-01T08:00:00+0000'), item('1', '2026-10-10T08:00:00+0000')] }),
    )

    const result = await listMediaSince('token', since, 100)

    expect(result.media.map((media) => media.id)).toEqual(['1'])
  })

  it('uses the thumbnail for videos and reports a list cut short by the cap', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: [
          item('1', '2026-10-10T08:00:00+0000', {
            media_type: 'VIDEO',
            media_product_type: 'REELS',
            media_url: 'https://cdn/1.mp4',
            thumbnail_url: 'https://cdn/1-thumb.jpg',
          }),
          item('2', '2026-10-09T08:00:00+0000'),
        ],
        paging: nextPage('cursor-1'),
      }),
    )

    const result = await listMediaSince('token', since, 1)

    expect(result.isComplete).toBe(false)
    expect(result.media).toHaveLength(1)
    expect(result.media[0].thumbnailUrl).toBe('https://cdn/1-thumb.jpg')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('skips items without a numeric id or a readable timestamp', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: [item('abc', '2026-10-10T08:00:00+0000'), item('2', 'kemarin'), item('3', '2026-10-09T08:00:00+0000')] }),
    )

    const result = await listMediaSince('token', since, 100)

    expect(result.media.map((media) => media.id)).toEqual(['3'])
  })
})

describe('getMediaInsights', () => {
  it('asks for every Analitik metric and parses the answer', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [{ name: 'views', values: [{ value: 10 }] }] }))

    const metrics = await getMediaInsights('token', '123')

    expect(metrics.views).toBe(10)
    expect(metrics.reach).toBeNull()
    const url = new URL(String(fetchMock.mock.calls[0][0]))
    expect(url.pathname).toBe('/123/insights')
    expect(url.searchParams.get('metric')).toBe('views,reach,likes,comments,shares,saved,total_interactions')
  })

  it('throws Graph errors so the sync can count the post as failed', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { message: 'Unsupported', code: 100 } }, 400))

    await expect(getMediaInsights('token', '123')).rejects.toBeInstanceOf(InstagramApiError)
  })
})

describe('listInstagramConversations', () => {
  const ACCOUNT = '17841400000000001'
  const conversation = (customer: string, updated: string, messages: unknown[], extra: unknown[] = []) => ({
    id: `conv-${customer}`,
    updated_time: updated,
    participants: { data: [{ username: 'toko', id: ACCOUNT }, { username: 'sari', id: customer }, ...extra] },
    messages: { data: messages },
  })

  it('reads each customer, who sent each message, and attachment-only messages as null text', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: [
          conversation('9001', '2026-10-16T08:11:40+0000', [
            { id: 'mid-2', created_time: '2026-10-16T08:11:40+0000', from: { id: ACCOUNT }, message: 'siap kak' },
            { id: 'mid-1', created_time: '2026-10-16T08:11:21+0000', from: { id: '9001' }, message: '' },
            { id: 'mid-x', created_time: 'not a date', from: { id: '9001' }, message: 'rusak' },
          ]),
          conversation('9002', '2026-10-15T00:00:00+0000', [], [{ username: 'teman', id: '9003' }]),
        ],
      }),
    )

    const conversations = await listInstagramConversations('token', ACCOUNT, 100)

    expect(conversations).toEqual([
      {
        igsid: '9001',
        updatedAt: new Date('2026-10-16T08:11:40Z'),
        messages: [
          { mid: 'mid-2', igsid: '9001', fromCustomer: false, text: 'siap kak', sentAt: new Date('2026-10-16T08:11:40Z') },
          { mid: 'mid-1', igsid: '9001', fromCustomer: true, text: null, sentAt: new Date('2026-10-16T08:11:21Z') },
        ],
      },
    ])
    const url = new URL(String(fetchMock.mock.calls[0][0]))
    expect(url.pathname).toBe('/me/conversations')
    expect(url.searchParams.get('platform')).toBe('instagram')
  })

  it('pages by cursor and stops at max', async () => {
    const page = (customer: string, after: string | null) =>
      jsonResponse({
        data: [conversation(customer, '2026-10-16T00:00:00+0000', [])],
        ...(after ? { paging: { cursors: { after }, next: 'https://graph.instagram.com/next' } } : {}),
      })
    fetchMock.mockResolvedValueOnce(page('9001', 'c1')).mockResolvedValueOnce(page('9002', 'c2'))

    const conversations = await listInstagramConversations('token', ACCOUNT, 2)

    expect(conversations.map((item) => item.igsid)).toEqual(['9001', '9002'])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(new URL(String(fetchMock.mock.calls[1][0])).searchParams.get('after')).toBe('c1')
  })
})

describe('listMediaComments', () => {
  const comment = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    text: `teks ${id}`,
    timestamp: '2026-10-18T08:00:00+0000',
    username: 'pelanggan',
    ...extra,
  })

  it('stores a reply once although Graph lists it at the top level and under its parent', async () => {
    // Arrange
    const reply = comment('202', { parent_id: '101' })
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [reply, comment('101', { replies: { data: [reply] } })] }))

    // Act
    const result = await listMediaComments('token', '555', 200)

    // Assert
    expect(result.comments.map((item) => [item.id, item.parentId])).toEqual([
      ['202', '101'],
      ['101', null],
    ])
  })
})
