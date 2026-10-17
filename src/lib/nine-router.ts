import 'server-only'
import { imageModel, textModel } from './app-settings'
import { env } from './env'

/** Combos may try several providers in turn before one answers. */
const REQUEST_TIMEOUT_MS = 60_000
/** Room for three captions in JSON; the models stop well before this. */
const MAX_TOKENS = 4096

/** OpenAI-style parts. Images go as data URLs: verified with Claude Haiku 4.5 through 9Router on 2026-10-16. */
export type ContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }

export interface ChatMessage {
  role: 'system' | 'user'
  content: string | ContentPart[]
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

/** The key travels only in the header; errors never carry the URL or headers. */
async function post(path: string, body: unknown, timeoutMs: number, accept?: string): Promise<Response> {
  const url = `${env('ROUTER_API_BASE_URL').replace(/\/+$/, '')}${path}`
  const headers: Record<string, string> = {
    authorization: `Bearer ${env('ROUTER_API_KEY')}`,
    'content-type': 'application/json',
    ...(accept ? { accept } : {}),
  }
  return fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) }).catch(
    (error: unknown) => {
      const reason = isObject(error) && typeof error.name === 'string' ? error.name : 'unknown'
      throw new RouterApiError(`9Router tidak bisa dihubungi (${reason})`, 0)
    },
  )
}

/**
 * One chat completion, returning the answer's text. `stream: false` must be explicit: without it 9Router answers with
 * SSE. `model` defaults to the admin's text model (textModel()).
 */
export async function chatCompletion(messages: ChatMessage[], model?: string): Promise<string> {
  const response = await post(
    '/chat/completions',
    { model: model ?? (await textModel()), messages, stream: false, max_tokens: MAX_TOKENS },
    REQUEST_TIMEOUT_MS,
  )
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) throw new RouterApiError(errorMessage(body, response.status), response.status)
  return readContent(body)
}

/** An image takes 30–40 s; a slow provider or a retry by 9Router can take a few minutes. */
const IMAGE_TIMEOUT_MS = 5 * 60_000
export interface ImageRequest {
  prompt: string
  /** `WIDTHxHEIGHT`, e.g. 1088x1360. */
  size: string
  /** Input images as data URLs. 9Router forwards them as `input_image`; with any, the model edits instead of generating. */
  images: string[]
}

/** The first image of a `{ data: [{ b64_json }] }` payload, or null. */
function imageOf(json: unknown): string | null {
  const first = isObject(json) && Array.isArray(json.data) ? json.data[0] : undefined
  const b64 = isObject(first) ? first.b64_json : undefined
  return typeof b64 === 'string' && b64 !== '' ? b64 : null
}

/**
 * Reads 9Router's image stream: `progress` and `partial_image` events, then `done` with the image or `error` with a
 * message. A stream error is a RouterApiError with status 200: the HTTP request itself went through.
 */
export function readImageStream(text: string): string {
  if (text.trimStart().startsWith('{')) {
    // A plain JSON answer, should 9Router ever ignore the Accept header.
    let json: unknown = null
    try {
      json = JSON.parse(text)
    } catch {
      // Falls through to the error below.
    }
    const image = imageOf(json)
    if (image) return image
    throw new RouterApiError(errorMessage(json, 200), 200)
  }

  for (const block of text.split(/\r?\n\r?\n/)) {
    let event = ''
    let data = ''
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event:')) event = line.slice(6).trim()
      else if (line.startsWith('data:')) data += line.slice(5).trim()
    }
    if (event !== 'done' && event !== 'error') continue
    let json: unknown = null
    try {
      json = JSON.parse(data)
    } catch {
      // A broken event counts as no image.
    }
    if (event === 'error') {
      const message = isObject(json) && typeof json.message === 'string' ? json.message : ''
      throw new RouterApiError(message || 'Pembuatan gambar gagal', 200)
    }
    const image = imageOf(json)
    if (image) return image
  }
  throw new RouterApiError('Stream gambar selesai tanpa gambar', 200)
}

/**
 * One image as base64 JPEG. SSE is asked for because its progress events keep the connection open through nginx while
 * the image renders. Request bodies above 1 MB get a 413 from that nginx, so input images must stay small.
 */
export async function generateImage({ prompt, size, images }: ImageRequest, model?: string): Promise<string> {
  const response = await post(
    '/images/generations',
    {
      model: model ?? (await imageModel()),
      prompt,
      n: 1,
      size,
      quality: 'auto',
      background: 'auto',
      image_detail: 'high',
      output_format: 'jpeg',
      ...(images.length > 0 ? { images } : {}),
    },
    IMAGE_TIMEOUT_MS,
    'text/event-stream',
  )
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null)
    throw new RouterApiError(errorMessage(body, response.status), response.status)
  }
  const text = await response.text().catch(() => {
    throw new RouterApiError('Stream gambar dari 9Router terputus', 0)
  })
  return readImageStream(text)
}

const LIST_TIMEOUT_MS = 15_000

/** The chat models 9Router offers (`GET /models`). Image models are not listed there; the 9Router dashboard has them. */
export async function listModels(): Promise<string[]> {
  const url = `${env('ROUTER_API_BASE_URL').replace(/\/+$/, '')}/models`
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${env('ROUTER_API_KEY')}` },
    signal: AbortSignal.timeout(LIST_TIMEOUT_MS),
  }).catch(() => {
    throw new RouterApiError('9Router tidak bisa dihubungi', 0)
  })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) throw new RouterApiError(errorMessage(body, response.status), response.status)
  const data = isObject(body) && Array.isArray(body.data) ? body.data : []
  const ids = data.map((model) => (isObject(model) && typeof model.id === 'string' ? model.id : '')).filter(Boolean)
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b))
}
