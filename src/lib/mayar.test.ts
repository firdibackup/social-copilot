import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPaymentRequest, getPaymentRequest, MayarApiError, webhookPaymentIds } from './mayar'

const fetchMock = vi.fn<typeof fetch>()
const REQUEST = {
  name: 'Social Copilot 30 hari',
  amount: 99_000,
  email: 'budi@example.com',
  description: 'Langganan',
  redirectUrl: 'https://app.test/langganan?bayar=selesai',
  expiredAt: new Date('2026-10-17T00:00:00Z'),
}
const answer = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('MAYAR_API_KEY', 'secret-key')
  vi.stubEnv('MAYAR_API_BASE_URL', 'https://api.mayar.test/hl/v2')
  fetchMock.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('createPaymentRequest', () => {
  it('posts the request as JSON with the key in a header and returns the checkout link', async () => {
    fetchMock.mockResolvedValue(answer(200, { statusCode: 200, data: { id: 'pr-1', transactionId: 't-1', link: 'https://pay.test/pl/x' } }))

    const created = await createPaymentRequest(REQUEST)

    expect(created).toEqual({ id: 'pr-1', link: 'https://pay.test/pl/x' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.mayar.test/hl/v2/payments/create')
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer secret-key')
    expect(JSON.parse(String(init?.body))).toEqual({
      name: 'Social Copilot 30 hari',
      amount: 99_000,
      email: 'budi@example.com',
      description: 'Langganan',
      redirectUrl: 'https://app.test/langganan?bayar=selesai',
      expiredAt: '2026-10-17T00:00:00.000Z',
    })
  })

  it("turns Mayar's rejection into a MayarApiError with its message", async () => {
    fetchMock.mockResolvedValue(answer(400, { statusCode: 400, messages: 'amount is required' }))

    await expect(createPaymentRequest(REQUEST)).rejects.toMatchObject({ status: 400, message: 'amount is required' })
  })

  it('reports an unreachable Mayar without the key or URL in the message', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed for https://api.mayar.test with secret-key'))

    const error = await getPaymentRequest('pr-1').catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(MayarApiError)
    expect(error).toMatchObject({ status: 0, message: 'Mayar tidak bisa dihubungi (TypeError)' })
  })
})

describe('getPaymentRequest', () => {
  it('reads the status and amount', async () => {
    fetchMock.mockResolvedValue(answer(200, { data: { id: 'pr-1', status: 'paid', amount: 99_000 } }))

    await expect(getPaymentRequest('pr-1')).resolves.toEqual({ status: 'paid', amount: 99_000 })
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.mayar.test/hl/v2/payments/pr-1')
  })
})

describe('webhookPaymentIds', () => {
  it('collects the ids under data and at the top level, once each', () => {
    const payload = { event: 'payment.received', id: 'evt-1', data: { id: 'trx-1', productId: 'pr-1', amount: 99_000 } }

    expect(webhookPaymentIds(payload)).toEqual(['pr-1', 'trx-1', 'evt-1'])
  })

  it('ignores values that cannot be ids', () => {
    expect(webhookPaymentIds({ data: { productId: "1' or '1'='1", id: 42 } })).toEqual([])
    expect(webhookPaymentIds('not an object')).toEqual([])
  })
})
