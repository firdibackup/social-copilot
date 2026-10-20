import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { entryAccountIds, hasValidSignature, parseCommentEvents, parseMessageEvents, parsePostbackEvents } from './dm-webhook'

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

describe('parsePostbackEvents', () => {
  it('reads a tap on a postback button', () => {
    const events = parsePostbackEvents(
      payload({
        sender: { id: CUSTOMER },
        recipient: { id: ACCOUNT },
        timestamp: 1792130400000,
        postback: { mid: 'p1', title: 'Kirim linknya', payload: 'autodm:rule' },
      }),
      ACCOUNT,
    )
    expect(events).toEqual([
      { mid: 'p1', igsid: CUSTOMER, title: 'Kirim linknya', payload: 'autodm:rule', sentAt: new Date(1792130400000) },
    ])
  })

  it('skips messages, postbacks without a payload or mid, and other accounts', () => {
    const tap = { sender: { id: CUSTOMER }, recipient: { id: ACCOUNT }, postback: { mid: 'p1', title: 'Ya', payload: 'x' } }
    expect(parsePostbackEvents(payload({ sender: { id: CUSTOMER }, message: { mid: 'm1', text: 'hai' } }), ACCOUNT)).toEqual([])
    expect(parsePostbackEvents(payload({ ...tap, postback: { mid: 'p1', title: 'Ya' } }), ACCOUNT)).toEqual([])
    expect(parsePostbackEvents(payload({ ...tap, postback: { title: 'Ya', payload: 'x' } }), ACCOUNT)).toEqual([])
    expect(parsePostbackEvents(payload(tap), 'another-account')).toEqual([])
  })
})

describe('parseCommentEvents', () => {
  const MEDIA = '18000000000000001'
  const change = (value: Record<string, unknown>) => ({ field: 'comments', value })
  const comments = (...changes: unknown[]) => ({
    object: 'instagram',
    entry: [{ id: ACCOUNT, time: 1792130400, changes }],
  })

  it('reads a comment and a reply, with the entry time in seconds', () => {
    const events = parseCommentEvents(
      comments(
        change({ id: '18100000000000001', text: 'berapa kak?', from: { id: CUSTOMER, username: 'budi' }, media: { id: MEDIA } }),
        change({ id: '18100000000000002', text: 'DM ya', from: { id: ACCOUNT }, media: { id: MEDIA }, parent_id: '18100000000000001' }),
      ),
      ACCOUNT,
    )
    expect(events).toEqual([
      {
        id: '18100000000000001',
        mediaId: MEDIA,
        parentId: null,
        fromId: CUSTOMER,
        username: 'budi',
        text: 'berapa kak?',
        createdAt: new Date(1792130400 * 1000),
        isHidden: false,
      },
      {
        id: '18100000000000002',
        mediaId: MEDIA,
        parentId: '18100000000000001',
        fromId: ACCOUNT,
        username: null,
        text: 'DM ya',
        createdAt: new Date(1792130400 * 1000),
        isHidden: false,
      },
    ])
  })

  it('reads field and value on the entry itself, and a time already in milliseconds', () => {
    const events = parseCommentEvents(
      {
        object: 'instagram',
        entry: [{ id: ACCOUNT, time: 1792130400000, field: 'comments', value: { id: '1', media: { id: MEDIA } } }],
      },
      ACCOUNT,
    )
    expect(events).toMatchObject([{ id: '1', text: '', fromId: null, createdAt: new Date(1792130400000) }])
  })

  it('skips other accounts, other fields and comments without numeric ids', () => {
    const valid = { id: '1', media: { id: MEDIA } }
    expect(parseCommentEvents(comments(change(valid)), '999')).toEqual([])
    expect(parseCommentEvents(comments({ field: 'mentions', value: valid }), ACCOUNT)).toEqual([])
    expect(parseCommentEvents(comments(change({ id: 'abc', media: { id: MEDIA } })), ACCOUNT)).toEqual([])
    expect(parseCommentEvents(comments(change({ id: '1' })), ACCOUNT)).toEqual([])
    expect(parseCommentEvents(comments(change({ ...valid, parent_id: '1,2' })), ACCOUNT)).toEqual([])
    expect(parseCommentEvents({ object: 'page', entry: [] }, ACCOUNT)).toEqual([])
    expect(parseCommentEvents(null, ACCOUNT)).toEqual([])
  })

  it('ignores DMs in the same payload', () => {
    expect(parseCommentEvents(payload({ sender: { id: CUSTOMER }, message: { mid: 'm1' } }), ACCOUNT)).toEqual([])
  })
})

describe('entryAccountIds', () => {
  it('lists each account once', () => {
    const body = { object: 'instagram', entry: [{ id: ACCOUNT }, { id: ACCOUNT }, { id: '2' }] }
    expect(entryAccountIds(body)).toEqual([ACCOUNT, '2'])
    expect(entryAccountIds({ object: 'page', entry: [{ id: '1' }] })).toEqual([])
  })
})
