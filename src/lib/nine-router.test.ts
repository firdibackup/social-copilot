import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfigError } from './errors'
import { chatCompletion, generateImage, readImageStream, RouterApiError, type ChatMessage } from './nine-router'

const MESSAGES: ChatMessage[] = [{ role: 'user', content: 'Halo' }]
const fetchMock = vi.fn<typeof fetch>()

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const failure = (promise: Promise<unknown>) => promise.then(() => null, (error: unknown) => error)

beforeEach(() => {
  vi.stubEnv('ROUTER_API_BASE_URL', 'https://router.example/v1/')
  vi.stubEnv('ROUTER_API_KEY', 'secret-key')
  vi.stubEnv('ROUTER_MODEL', 'cc/claude-haiku-4-5-20251001')
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  fetchMock.mockReset()
})

describe('chatCompletion', () => {
  it('posts a non-streaming request with the key in the header', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ choices: [{ message: { content: '{"ok":true}' } }] }))

    await expect(chatCompletion(MESSAGES)).resolves.toBe('{"ok":true}')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://router.example/v1/chat/completions')
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer secret-key')
    expect(JSON.parse(String(init?.body))).toEqual({
      model: 'cc/claude-haiku-4-5-20251001',
      messages: MESSAGES,
      stream: false,
      max_tokens: 16_000,
    })
  })

  it('carries the provider message and the HTTP status', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { message: '[codex/gpt-5.4-mini] [400]: not supported' } }, 400))

    const error = await failure(chatCompletion(MESSAGES))

    expect(error).toBeInstanceOf(RouterApiError)
    expect(error).toMatchObject({ status: 400, message: '[codex/gpt-5.4-mini] [400]: not supported' })
  })

  it('falls back to the status when the error body is not JSON', async () => {
    fetchMock.mockResolvedValue(new Response('Bad gateway', { status: 502 }))

    await expect(chatCompletion(MESSAGES)).rejects.toMatchObject({ status: 502, message: 'HTTP 502' })
  })

  it('reports a network failure as status 0 without echoing the URL', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed: https://router.example/v1/chat/completions'))

    await expect(chatCompletion(MESSAGES)).rejects.toMatchObject({
      status: 0,
      message: '9Router tidak bisa dihubungi (TypeError)',
    })
  })

  it('reports a timeout as status 0', async () => {
    fetchMock.mockRejectedValue(new DOMException('The operation timed out.', 'TimeoutError'))

    await expect(chatCompletion(MESSAGES)).rejects.toMatchObject({
      status: 0,
      message: '9Router tidak bisa dihubungi (TimeoutError)',
    })
  })

  it('treats a 200 without content as an error', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ choices: [] }))

    await expect(chatCompletion(MESSAGES)).rejects.toMatchObject({ status: 200, message: 'Respons 9Router tanpa isi' })
  })

  it('names the missing variable before calling 9Router', async () => {
    vi.stubEnv('ROUTER_API_KEY', '')

    await expect(chatCompletion(MESSAGES)).rejects.toThrow(ConfigError)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('readImageStream', () => {
  const sse = (...events: [string, unknown][]) =>
    events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('')

  it('returns the image of the done event after the progress events', () => {
    const stream = sse(
      ['progress', { stage: 'response.created', bytesReceived: 1443 }],
      ['progress', { stage: 'response.image_generation_call.generating', bytesReceived: 3560 }],
      ['done', { created: 1792134374, data: [{ b64_json: 'AAAA' }] }],
    )

    expect(readImageStream(stream)).toBe('AAAA')
  })

  it('turns an error event into a RouterApiError with its message', () => {
    const stream = sse(['progress', { stage: 'response.created' }], ['error', { message: 'Account may not be entitled' }])

    const error = (() => {
      try {
        readImageStream(stream)
      } catch (caught) {
        return caught
      }
    })()

    expect(error).toBeInstanceOf(RouterApiError)
    expect(error).toMatchObject({ status: 200, message: 'Account may not be entitled' })
  })

  it('reads a plain JSON answer too', () => {
    expect(readImageStream('{"created":1,"data":[{"b64_json":"BBBB"}]}')).toBe('BBBB')
  })

  it('fails when the stream ends without an image', () => {
    expect(() => readImageStream(sse(['progress', { stage: 'response.created' }]))).toThrow('Stream gambar selesai tanpa gambar')
  })
})

describe('generateImage', () => {
  const stream = 'event: done\ndata: {"data":[{"b64_json":"CCCC"}]}\n\n'

  it('asks for SSE and JPEG with the default model, sending input images only when there are some', async () => {
    fetchMock.mockResolvedValue(new Response(stream, { headers: { 'content-type': 'text/event-stream' } }))

    await expect(generateImage({ prompt: 'Kucing', size: '1088x1360', images: [] })).resolves.toBe('CCCC')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://router.example/v1/images/generations')
    expect(new Headers(init?.headers).get('accept')).toBe('text/event-stream')
    expect(JSON.parse(String(init?.body))).toEqual({
      model: 'cx/gpt-image-2.5',
      prompt: 'Kucing',
      n: 1,
      size: '1088x1360',
      quality: 'auto',
      background: 'auto',
      image_detail: 'high',
      output_format: 'jpeg',
    })
  })

  it('uses ROUTER_IMAGE_MODEL and passes the input images', async () => {
    vi.stubEnv('ROUTER_IMAGE_MODEL', 'cx/gpt-image-2.5-flare')
    fetchMock.mockResolvedValue(new Response(stream))

    await generateImage({ prompt: 'Kucing', size: '1024x1024', images: ['data:image/jpeg;base64,AAAA'] })

    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      model: 'cx/gpt-image-2.5-flare',
      images: ['data:image/jpeg;base64,AAAA'],
    })
  })

  it('reports a rejected model with its HTTP status and 9Router message', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { message: "[codex/gpt-5.5-image] [400]: The 'gpt-5.5' model is not supported" } }, 400),
    )

    const error = await failure(generateImage({ prompt: 'Kucing', size: '1024x1024', images: [] }))

    expect(error).toBeInstanceOf(RouterApiError)
    expect(error).toMatchObject({ status: 400, message: expect.stringContaining('not supported') })
  })
})
