import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getCurrentPeriod } from '@/lib/billing'
import { markReplies, saveComments } from '@/lib/comments'
import { findUserByInstagramId, getConnection, getValidAccessToken } from '@/lib/connection'
import { needsProfile, recordMessage, saveProfile } from '@/lib/dm'
import { fetchCustomerProfile } from '@/lib/instagram'
import { GET, POST } from './route'

vi.mock('@/lib/billing', () => ({ getCurrentPeriod: vi.fn() }))
vi.mock('@/lib/comments', () => ({ markReplies: vi.fn(), saveComments: vi.fn() }))
vi.mock('@/lib/connection', () => ({ findUserByInstagramId: vi.fn(), getConnection: vi.fn(), getValidAccessToken: vi.fn() }))
vi.mock('@/lib/dm', () => ({ needsProfile: vi.fn(), recordMessage: vi.fn(), saveProfile: vi.fn() }))
vi.mock('@/lib/instagram', () => ({ fetchCustomerProfile: vi.fn() }))

const URL_BASE = 'https://social-copilot.ngrok-free.dev/api/webhooks/instagram'
const ACCOUNT = '17841400000000001'
const OTHER_ACCOUNT = '17841400000000002'
const USER = 'user-1'
const OTHER_USER = 'user-2'
const CUSTOMER = '901234567890'
const OWNERS: Record<string, string> = { [ACCOUNT]: USER, [OTHER_ACCOUNT]: OTHER_USER }

function webhook(body: unknown, secret = 'app-secret') {
  const raw = JSON.stringify(body)
  const signature = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`
  return POST(new Request(URL_BASE, { method: 'POST', body: raw, headers: { 'x-hub-signature-256': signature } }))
}

const entry = (account: string, mid: string, extra: Record<string, unknown> = {}) => ({
  id: account,
  messaging: [
    { sender: { id: CUSTOMER }, recipient: { id: account }, timestamp: 1792130400000, message: { mid, text: 'ada promo?', ...extra } },
  ],
})

const message = (mid: string, extra: Record<string, unknown> = {}) => ({ object: 'instagram', entry: [entry(ACCOUNT, mid, extra)] })

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubEnv('INSTAGRAM_APP_SECRET', 'app-secret')
  vi.stubEnv('INSTAGRAM_WEBHOOK_VERIFY_TOKEN', 'verify-me')
  vi.mocked(findUserByInstagramId).mockImplementation(async (account) => OWNERS[account] ?? null)
  vi.mocked(getCurrentPeriod).mockResolvedValue({
    start: new Date('2026-10-01'),
    end: new Date('2026-10-31'),
    activeUntil: new Date('2026-10-31'),
  })
  vi.mocked(recordMessage).mockResolvedValue(true)
  vi.mocked(needsProfile).mockResolvedValue(true)
  vi.mocked(getValidAccessToken).mockResolvedValue('token')
  vi.mocked(fetchCustomerProfile).mockResolvedValue({ username: 'budi', name: 'Budi', profilePicUrl: null })
  vi.mocked(getConnection).mockResolvedValue({
    username: 'tokosaya',
    accountType: 'BUSINESS',
    tokenExpiresAt: new Date('2026-12-01'),
    status: 'active',
    scopes: [],
  })
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
    expect(recordMessage).toHaveBeenCalledWith(USER, {
      mid: 'm1',
      igsid: CUSTOMER,
      fromCustomer: true,
      text: 'ada promo?',
      sentAt: new Date(1792130400000),
    })
    expect(getValidAccessToken).toHaveBeenCalledWith(USER)
    expect(fetchCustomerProfile).toHaveBeenCalledWith('token', CUSTOMER)
    expect(saveProfile).toHaveBeenCalledWith(USER, CUSTOMER, { username: 'budi', name: 'Budi', profilePicUrl: null })
  })

  it('stores each entry for the user who connected its account and skips accounts nobody has', async () => {
    const body = { object: 'instagram', entry: [entry(ACCOUNT, 'm1'), entry(OTHER_ACCOUNT, 'm2'), entry('17841499999999999', 'm3')] }

    expect((await webhook(body)).status).toBe(200)
    expect(recordMessage).toHaveBeenCalledTimes(2)
    expect(recordMessage).toHaveBeenCalledWith(USER, expect.objectContaining({ mid: 'm1' }))
    expect(recordMessage).toHaveBeenCalledWith(OTHER_USER, expect.objectContaining({ mid: 'm2' }))
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
    expect(recordMessage).toHaveBeenCalledWith(USER, expect.objectContaining({ fromCustomer: false, igsid: CUSTOMER }))
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

  it('acknowledges messages for an account no user has connected, without storing them', async () => {
    vi.mocked(findUserByInstagramId).mockResolvedValue(null)

    expect((await webhook(message('m1'))).status).toBe(200)
    expect(recordMessage).not.toHaveBeenCalled()
  })

  it('acknowledges messages for a user without an active subscription, without storing them', async () => {
    vi.mocked(getCurrentPeriod).mockResolvedValue(null)

    expect((await webhook(message('m1'))).status).toBe(200)
    expect(getCurrentPeriod).toHaveBeenCalledWith(USER)
    expect(recordMessage).not.toHaveBeenCalled()
  })

  it("stores new comments, marking the account's own as the owner's, then marks replied threads", async () => {
    const comment = (id: string, from: Record<string, string>, extra: Record<string, unknown> = {}) => ({
      field: 'comments',
      value: { id, text: 'berapa kak?', from, media: { id: '18000000000000001' }, ...extra },
    })
    const body = {
      object: 'instagram',
      entry: [
        {
          id: ACCOUNT,
          time: 1792130400,
          changes: [
            comment('18100000000000001', { id: CUSTOMER, username: 'budi' }),
            comment('18100000000000002', { id: ACCOUNT, username: 'tokosaya' }, { parent_id: '18100000000000001' }),
          ],
        },
      ],
    }

    expect((await webhook(body)).status).toBe(200)
    expect(recordMessage).not.toHaveBeenCalled()
    expect(saveComments).toHaveBeenCalledWith(
      USER,
      ACCOUNT,
      [
        expect.objectContaining({ id: '18100000000000001', isFromOwner: false, createdAt: new Date(1792130400000) }),
        expect.objectContaining({ id: '18100000000000002', parentId: '18100000000000001', isFromOwner: true }),
      ],
      'insert',
    )
    expect(markReplies).toHaveBeenCalledWith(USER, ['18000000000000001', '18000000000000001'])
  })

  it('stores no comments for a DM-only payload', async () => {
    expect((await webhook(message('m1'))).status).toBe(200)
    expect(saveComments).not.toHaveBeenCalled()
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
