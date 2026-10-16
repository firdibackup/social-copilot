import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfigError } from './errors'
import { chatCompletion, RouterApiError, type ChatMessage } from './nine-router'

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
      max_tokens: 4096,
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
