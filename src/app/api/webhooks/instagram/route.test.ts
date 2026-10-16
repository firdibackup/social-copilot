import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getConnectedAccountId, getValidAccessToken } from '@/lib/connection'
import { needsProfile, recordMessage, saveProfile } from '@/lib/dm'
import { fetchCustomerProfile } from '@/lib/instagram'
import { GET, POST } from './route'

vi.mock('@/lib/connection', () => ({ getConnectedAccountId: vi.fn(), getValidAccessToken: vi.fn() }))
vi.mock('@/lib/dm', () => ({ needsProfile: vi.fn(), recordMessage: vi.fn(), saveProfile: vi.fn() }))
vi.mock('@/lib/instagram', () => ({ fetchCustomerProfile: vi.fn() }))

const URL_BASE = 'https://social-copilot.ngrok-free.dev/api/webhooks/instagram'
const ACCOUNT = '17841400000000001'
const CUSTOMER = '901234567890'

function webhook(body: unknown, secret = 'app-secret') {
  const raw = JSON.stringify(body)
  const signature = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`
  return POST(new Request(URL_BASE, { method: 'POST', body: raw, headers: { 'x-hub-signature-256': signature } }))
}

const message = (mid: string, extra: Record<string, unknown> = {}) => ({
  object: 'instagram',
  entry: [
    {
      id: ACCOUNT,
      messaging: [
        { sender: { id: CUSTOMER }, recipient: { id: ACCOUNT }, timestamp: 1792130400000, message: { mid, text: 'ada promo?', ...extra } },
      ],
    },
  ],
})

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubEnv('INSTAGRAM_APP_SECRET', 'app-secret')
  vi.stubEnv('INSTAGRAM_WEBHOOK_VERIFY_TOKEN', 'verify-me')
  vi.mocked(getConnectedAccountId).mockResolvedValue(ACCOUNT)
  vi.mocked(recordMessage).mockResolvedValue(true)
  vi.mocked(needsProfile).mockResolvedValue(true)
  vi.mocked(getValidAccessToken).mockResolvedValue('token')
  vi.mocked(fetchCustomerProfile).mockResolvedValue({ username: 'budi', name: 'Budi' })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('GET /api/webhooks/instagram', () => {
  it('echoes the challenge for the right verify token', async () => {
    const response = GET(new Request(`${URL_BASE}?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=1158201444`))
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('1158201444')
  })

  it('refuses another verify token', () => {
    const response = GET(new Request(`${URL_BASE}?hub.mode=subscribe&hub.verify_token=guess&hub.challenge=1`))
    expect(response.status).toBe(403)
  })
})

describe('POST /api/webhooks/instagram', () => {
  it('stores a customer message and fills in their profile', async () => {
    const response = await webhook(message('m1'))

    expect(response.status).toBe(200)
    expect(recordMessage).toHaveBeenCalledWith({
      mid: 'm1',
      igsid: CUSTOMER,
      fromCustomer: true,
      text: 'ada promo?',
      sentAt: new Date(1792130400000),
    })
    expect(fetchCustomerProfile).toHaveBeenCalledWith('token', CUSTOMER)
    expect(saveProfile).toHaveBeenCalledWith(CUSTOMER, { username: 'budi', name: 'Budi' })
  })

  it('rejects a payload signed with another secret', async () => {
    const response = await webhook(message('m1'), 'forged')

    expect(response.status).toBe(401)
    expect(recordMessage).not.toHaveBeenCalled()
  })

  it('does nothing more for a message it already stored', async () => {
    vi.mocked(recordMessage).mockResolvedValue(false)

    expect((await webhook(message('m1'))).status).toBe(200)
    expect(needsProfile).not.toHaveBeenCalled()
  })

  it('does not look up the profile for its own echoes', async () => {
    const echo = message('m2', { is_echo: true })
    echo.entry[0].messaging[0].sender = { id: ACCOUNT }
    echo.entry[0].messaging[0].recipient = { id: CUSTOMER }

    expect((await webhook(echo)).status).toBe(200)
    expect(recordMessage).toHaveBeenCalledWith(expect.objectContaining({ fromCustomer: false, igsid: CUSTOMER }))
    expect(needsProfile).not.toHaveBeenCalled()
  })

  it('still answers 200 when the profile lookup fails', async () => {
    vi.mocked(fetchCustomerProfile).mockRejectedValue(new Error('Graph down'))

    expect((await webhook(message('m1'))).status).toBe(200)
    expect(saveProfile).not.toHaveBeenCalled()
  })

  it('answers 500 when the message cannot be stored, so Meta retries', async () => {
    vi.mocked(recordMessage).mockRejectedValue(new Error('Supabase: down'))

    expect((await webhook(message('m1'))).status).toBe(500)
  })

  it('acknowledges messages while no account is connected, without storing them', async () => {
    vi.mocked(getConnectedAccountId).mockResolvedValue(null)

    expect((await webhook(message('m1'))).status).toBe(200)
    expect(recordMessage).not.toHaveBeenCalled()
  })

  it('rejects a signed body that is not JSON', async () => {
    const raw = 'not json'
    const signature = `sha256=${createHmac('sha256', 'app-secret').update(raw).digest('hex')}`
    const response = await POST(
      new Request(URL_BASE, { method: 'POST', body: raw, headers: { 'x-hub-signature-256': signature } }),
    )
    expect(response.status).toBe(400)
  })
})
