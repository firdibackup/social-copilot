import 'server-only'
import { env } from './env'

/** Combos may try several providers in turn before one answers. */
const REQUEST_TIMEOUT_MS = 60_000
/** Room for three captions in JSON; the models stop well before this. */
const MAX_TOKENS = 4096

export interface ChatMessage {
  role: 'system' | 'user'
  content: string
}

export class RouterApiError extends Error {
  override name = 'RouterApiError'

  constructor(
    message: string,
    /** HTTP status, or 0 when 9Router could not be reached or did not answer in time. */
    readonly status: number,
  ) {
    super(message)
  }
}

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null

/** 9Router wraps provider errors as `{ error: { message: "[provider/model] [status]: …" } }`. */
function errorMessage(body: unknown, status: number): string {
  const message = isObject(body) && isObject(body.error) ? body.error.message : undefined
  return typeof message === 'string' && message !== '' ? message : `HTTP ${status}`
}

function readContent(body: unknown): string {
  const choice = isObject(body) && Array.isArray(body.choices) ? body.choices[0] : undefined
  const content = isObject(choice) && isObject(choice.message) ? choice.message.content : undefined
  if (typeof content !== 'string' || content.trim() === '') {
    throw new RouterApiError('Respons 9Router tanpa isi', 200)
  }
  return content
}

/**
 * One chat completion, returning the answer's text. `stream: false` must be explicit: without it
 * 9Router answers with SSE. The key travels only in the header; errors never carry the URL or headers.
 */
export async function chatCompletion(messages: ChatMessage[]): Promise<string> {
  const url = `${env('ROUTER_API_BASE_URL').replace(/\/+$/, '')}/chat/completions`
  const init: RequestInit = {
    method: 'POST',
    headers: { authorization: `Bearer ${env('ROUTER_API_KEY')}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: env('ROUTER_MODEL'), messages, stream: false, max_tokens: MAX_TOKENS }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  }
  const response = await fetch(url, init).catch((error: unknown) => {
    const reason = isObject(error) && typeof error.name === 'string' ? error.name : 'unknown'
    throw new RouterApiError(`9Router tidak bisa dihubungi (${reason})`, 0)
  })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) throw new RouterApiError(errorMessage(body, response.status), response.status)
  return readContent(body)
}
