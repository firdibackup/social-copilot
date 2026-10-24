import 'server-only'
import { env } from './env'

const DEFAULT_BASE_URL = 'https://api.mayar.id/hl/v2'
const REQUEST_TIMEOUT_MS = 15_000

export class MayarApiError extends Error {
  override name = 'MayarApiError'

  constructor(
    message: string,
    /** 0 when Mayar could not be reached. */
    readonly status: number,
  ) {
    super(message)
  }
}

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null

/** One call to Mayar's API. The key travels in a header, never in the URL. */
async function request(path: string, init: RequestInit = {}): Promise<Json> {
  const base = process.env.MAYAR_API_BASE_URL?.trim() || DEFAULT_BASE_URL
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${env('MAYAR_API_KEY')}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  }).catch((error: unknown) => {
    throw new MayarApiError(`Mayar tidak bisa dihubungi (${error instanceof Error ? error.name : 'unknown'})`, 0)
  })
  const body: unknown = await response.json().catch(() => null)
  const data = isObject(body) ? body.data : null
  if (!response.ok || !isObject(data)) {
    const message = isObject(body) && typeof body.messages === 'string' ? body.messages : `HTTP ${response.status}`
    throw new MayarApiError(message, response.status)
  }
  return data
}

const text = (source: Json, key: string): string => {
  const value = source[key]
  if (typeof value !== 'string' || value === '') throw new MayarApiError(`Respons Mayar tanpa ${key}`, 200)
  return value
}

export interface NewPaymentRequest {
  /** The customer's name, shown on Mayar's checkout and receipt. */
  name: string
  amount: number
  email: string
  /** The customer's phone (WhatsApp) number. */
  mobile?: string
  description: string
  /** Where Mayar sends the customer after paying. */
  redirectUrl: string
  expiredAt: Date
}

export interface CreatedPaymentRequest {
  id: string
  transactionId?: string
  /** The checkout page. */
  link: string
}

/** A Single Payment Request: one link for one amount. */
export async function createPaymentRequest(input: NewPaymentRequest): Promise<CreatedPaymentRequest> {
  const data = await request('/payments/create', {
    method: 'POST',
    body: JSON.stringify({ ...input, expiredAt: input.expiredAt.toISOString() }),
  })
  return { id: text(data, 'id'), link: text(data, 'link'), ...(typeof data.transactionId === 'string' ? { transactionId: data.transactionId } : {}) }
}

export interface PaymentRequestState {
  /** "paid" once the customer has paid; "unpaid" and others before. */
  status: string
  amount: number
}

export async function getPaymentRequest(id: string): Promise<PaymentRequestState> {
  const data = await request(`/payments/${encodeURIComponent(id)}`)
  if (typeof data.amount !== 'number') throw new MayarApiError('Respons Mayar tanpa amount', 200)
  return { status: text(data, 'status'), amount: data.amount }
}

const WEBHOOK_ID_KEYS = ['productId', 'paymentLinkId', 'paymentRequestId', 'id'] as const
const ID_PATTERN = /^[\w-]{1,100}$/
const MAX_WEBHOOK_IDS = 8

/**
 * Ids a Mayar webhook may name the payment request by, at the top level or under `data`. Mayar documents no
 * signature, so they are only hints: one that matches a pending payment is checked against the API first.
 */
export function webhookPaymentIds(payload: unknown): string[] {
  const sources = isObject(payload) ? [isObject(payload.data) ? payload.data : {}, payload] : []
  const ids = sources.flatMap((source) => WEBHOOK_ID_KEYS.map((key) => source[key]))
  const valid = ids.filter((id): id is string => typeof id === 'string' && ID_PATTERN.test(id))
  return [...new Set(valid)].slice(0, MAX_WEBHOOK_IDS)
}
