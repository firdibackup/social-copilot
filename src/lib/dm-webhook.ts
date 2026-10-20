import { createHmac, timingSafeEqual } from 'node:crypto'
import type { PostComment } from './instagram'

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

/** A tap on a postback button (Auto DM's opener and "Sudah follow"), from a `messaging_postbacks` webhook. */
export interface PostbackEvent {
  mid: string
  igsid: string
  /** The button's text, which the thread shows as the customer's message. */
  title: string
  payload: string
  sentAt: Date
}

const SIGNATURE_PREFIX = 'sha256='
/** Graph ids are digits; comment ids also go into PostgREST filters. */
const NUMERIC_ID = /^\d+$/
/** `entry.time` is in seconds; anything this large is already milliseconds. */
const MILLISECONDS_FROM = 1e12

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

/** The accounts a webhook payload carries DMs or comments for: its distinct `entry.id`s. */
export function entryAccountIds(payload: unknown): string[] {
  if (!isObject(payload) || payload.object !== 'instagram' || !Array.isArray(payload.entry)) return []
  return [...new Set(payload.entry.filter(isObject).map((entry) => String(entry.id)))]
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

/** The button taps in a webhook payload for `accountId`. Always the customer's: the account taps nothing. */
export function parsePostbackEvents(payload: unknown, accountId: string): PostbackEvent[] {
  if (!isObject(payload) || payload.object !== 'instagram' || !Array.isArray(payload.entry)) return []

  return payload.entry.flatMap((entry: unknown) => {
    if (!isObject(entry) || String(entry.id) !== accountId || !Array.isArray(entry.messaging)) return []

    return entry.messaging.flatMap((event: unknown): PostbackEvent[] => {
      if (!isObject(event) || !isObject(event.postback)) return []
      const { postback } = event
      const igsid = idOf(event.sender)
      if (typeof postback.mid !== 'string' || postback.mid === '' || typeof postback.payload !== 'string' || !igsid) {
        return []
      }
      return [
        {
          mid: postback.mid,
          igsid,
          title: typeof postback.title === 'string' ? postback.title : '',
          payload: postback.payload,
          sentAt: typeof event.timestamp === 'number' ? new Date(event.timestamp) : new Date(),
        },
      ]
    })
  })
}

const numericId = (value: unknown) => (typeof value === 'string' && NUMERIC_ID.test(value) ? value : null)

function entryTime(value: unknown): Date {
  if (typeof value !== 'number' || !Number.isFinite(value)) return new Date()
  return new Date(value < MILLISECONDS_FROM ? value * 1000 : value)
}

/**
 * New comments on `accountId`'s posts from a `comments` webhook. Meta sends them as `entry.changes[]`; its Instagram
 * Login example puts `field` and `value` on the entry itself, so both shapes are read. The payload has no time of
 * its own, so the entry's stands in, and it never says whether a comment is hidden.
 */
export function parseCommentEvents(payload: unknown, accountId: string): PostComment[] {
  if (!isObject(payload) || payload.object !== 'instagram' || !Array.isArray(payload.entry)) return []

  return payload.entry.flatMap((entry: unknown) => {
    if (!isObject(entry) || String(entry.id) !== accountId) return []
    const changes: unknown[] = Array.isArray(entry.changes) ? entry.changes : [entry]

    return changes.flatMap((change): PostComment[] => {
      if (!isObject(change) || change.field !== 'comments' || !isObject(change.value)) return []
      const { value } = change
      const id = numericId(value.id)
      const mediaId = isObject(value.media) ? numericId(value.media.id) : null
      const parentId = value.parent_id === undefined ? null : numericId(value.parent_id)
      if (!id || !mediaId || (value.parent_id !== undefined && !parentId)) return []
      const from = isObject(value.from) ? value.from : {}

      return [
        {
          id,
          mediaId,
          parentId,
          fromId: idOf(from),
          username: typeof from.username === 'string' && from.username !== '' ? from.username : null,
          text: typeof value.text === 'string' ? value.text : '',
          createdAt: entryTime(entry.time),
          isHidden: false,
        },
      ]
    })
  })
}
