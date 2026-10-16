import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { hasValidSignature, parseMessageEvents } from './dm-webhook'

const ACCOUNT = '17841400000000001'
const CUSTOMER = '901234567890'
const SECRET = 'app-secret'

const sign = (body: Buffer, secret = SECRET) => `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`

const payload = (...messaging: unknown[]) => ({ object: 'instagram', entry: [{ id: ACCOUNT, time: 1, messaging }] })

describe('hasValidSignature', () => {
  const body = Buffer.from('{"object":"instagram","text":"\\u00e4"}')

  it('accepts the HMAC of the raw body', () => {
    expect(hasValidSignature(body, sign(body), SECRET)).toBe(true)
  })

  it('rejects another secret, a changed body, a missing or malformed header', () => {
    expect(hasValidSignature(body, sign(body, 'other'), SECRET)).toBe(false)
    expect(hasValidSignature(Buffer.from('{}'), sign(body), SECRET)).toBe(false)
    expect(hasValidSignature(body, null, SECRET)).toBe(false)
    expect(hasValidSignature(body, sign(body).replace('sha256=', 'sha1='), SECRET)).toBe(false)
    expect(hasValidSignature(body, 'sha256=abc', SECRET)).toBe(false)
  })
})

describe('parseMessageEvents', () => {
  it('reads a customer message', () => {
    const events = parseMessageEvents(
      payload({
        sender: { id: CUSTOMER },
        recipient: { id: ACCOUNT },
        timestamp: 1792130400000,
        message: { mid: 'm1', text: 'ada promo?' },
      }),
      ACCOUNT,
    )
    expect(events).toEqual([
      { mid: 'm1', igsid: CUSTOMER, fromCustomer: true, text: 'ada promo?', sentAt: new Date(1792130400000) },
    ])
  })

  it('files an echo under the customer it was sent to', () => {
    const [event] = parseMessageEvents(
      payload({
        sender: { id: ACCOUNT },
        recipient: { id: CUSTOMER },
        timestamp: 1792130400000,
        message: { mid: 'm2', text: 'Halo!', is_echo: true },
      }),
      ACCOUNT,
    )
    expect(event).toMatchObject({ mid: 'm2', igsid: CUSTOMER, fromCustomer: false })
  })

  it('keeps attachment-only messages without text', () => {
    const [event] = parseMessageEvents(
      payload({
        sender: { id: CUSTOMER },
        recipient: { id: ACCOUNT },
        timestamp: 1792130400000,
        message: { mid: 'm3', attachments: [{ type: 'image', payload: { url: 'https://x' } }] },
      }),
      ACCOUNT,
    )
    expect(event.text).toBeNull()
  })

  it('skips deleted messages, reactions, read receipts and other accounts', () => {
    const base = { sender: { id: CUSTOMER }, recipient: { id: ACCOUNT }, timestamp: 1 }
    const events = parseMessageEvents(
      payload(
        { ...base, message: { mid: 'm4', text: 'x', is_deleted: true } },
        { ...base, reaction: { mid: 'm1', action: 'react', reaction: 'love' } },
        { ...base, read: { mid: 'm1' } },
      ),
      ACCOUNT,
    )
    expect(events).toEqual([])
    expect(
      parseMessageEvents(payload({ ...base, message: { mid: 'm5', text: 'x' } }), '17841499999999999'),
    ).toEqual([])
  })

  it('ignores payloads that are not Instagram messages', () => {
    expect(parseMessageEvents({ object: 'page', entry: [] }, ACCOUNT)).toEqual([])
    expect(parseMessageEvents(null, ACCOUNT)).toEqual([])
    expect(parseMessageEvents({ object: 'instagram', entry: [{ id: ACCOUNT, changes: [] }] }, ACCOUNT)).toEqual([])
  })

  it('falls back to the receive time when Meta omits the timestamp', () => {
    vi.useFakeTimers({ now: new Date('2026-10-16T05:00:00Z'), toFake: ['Date'] })
    const [event] = parseMessageEvents(
      payload({ sender: { id: CUSTOMER }, recipient: { id: ACCOUNT }, message: { mid: 'm6', text: 'x' } }),
      ACCOUNT,
    )
    vi.useRealTimers()
    expect(event.sentAt).toEqual(new Date('2026-10-16T05:00:00Z'))
  })
})
