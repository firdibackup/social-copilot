import { createHmac, timingSafeEqual } from 'node:crypto'

/** One DM from a Meta `messages` webhook, seen from the conversation with the customer. */
export interface MessageEvent {
  mid: string
  /** The customer's Instagram-scoped id, whichever side sent the message. */
  igsid: string
  fromCustomer: boolean
  /** Null for a message that only carries an attachment. */
  text: string | null
  sentAt: Date
}

const SIGNATURE_PREFIX = 'sha256='

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null

const idOf = (party: unknown) => (isObject(party) && typeof party.id === 'string' && party.id !== '' ? party.id : null)

/** Checks `X-Hub-Signature-256`: an HMAC-SHA256 of the raw body, keyed with the Instagram app secret. */
export function hasValidSignature(rawBody: Buffer, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith(SIGNATURE_PREFIX)) return false
  const expected = createHmac('sha256', appSecret).update(rawBody).digest()
  const received = Buffer.from(header.slice(SIGNATURE_PREFIX.length), 'hex')
  return received.length === expected.length && timingSafeEqual(received, expected)
}

/**
 * The DMs in a webhook payload for `accountId` (the `entry.id` Meta sends). Echoes are the account's own
 * messages, sent from this app or from the Instagram app. Deleted messages, reactions and read receipts
 * are skipped.
 */
export function parseMessageEvents(payload: unknown, accountId: string): MessageEvent[] {
  if (!isObject(payload) || payload.object !== 'instagram' || !Array.isArray(payload.entry)) return []

  return payload.entry.flatMap((entry: unknown) => {
    if (!isObject(entry) || String(entry.id) !== accountId || !Array.isArray(entry.messaging)) return []

    return entry.messaging.flatMap((event: unknown): MessageEvent[] => {
      if (!isObject(event) || !isObject(event.message)) return []
      const { message } = event
      if (typeof message.mid !== 'string' || message.mid === '' || message.is_deleted === true) return []

      const fromCustomer = message.is_echo !== true
      const igsid = idOf(fromCustomer ? event.sender : event.recipient)
      if (!igsid) return []

      return [
        {
          mid: message.mid,
          igsid,
          fromCustomer,
          text: typeof message.text === 'string' ? message.text : null,
          sentAt: typeof event.timestamp === 'number' ? new Date(event.timestamp) : new Date(),
        },
      ]
    })
  })
}
