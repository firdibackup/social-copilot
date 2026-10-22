import 'server-only'
import { imageModel, textModel } from './app-settings'
import { env } from './env'

/** Combos may try several providers in turn before one answers; a thinking model's 5-slide plan took 40–50 s. */
const REQUEST_TIMEOUT_MS = 120_000
/**
 * Thinking models spend their reasoning from this budget too: Claude Sonnet 5 used 3,500–4,700 tokens for a
 * 5-slide plan from a long topic, and at 4,096 it was cut off mid-JSON (finish_reason max_tokens).
 */
const MAX_TOKENS = 16_000

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
async function post(path: string, body: unknown, timeoutMs: number, accept?: string, outerSignal?: AbortSignal): Promise<Response> {
  const url = `${env('ROUTER_API_BASE_URL').replace(/\/+$/, '')}${path}`
  const headers: Record<string, string> = {
    authorization: `Bearer ${env('ROUTER_API_KEY')}`,
    'content-type': 'application/json',
    ...(accept ? { accept } : {}),
  }
  const timeout = AbortSignal.timeout(timeoutMs)
  const signal = outerSignal ? AbortSignal.any([timeout, outerSignal]) : timeout
  return fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal }).catch(
    (error: unknown) => {
      outerSignal?.throwIfAborted()
      const reason = isObject(error) && typeof error.name === 'string' ? error.name : 'unknown'
      throw new RouterApiError(`9Router tidak bisa dihubungi (${reason})`, 0)
    },
  )
}

/**
 * One chat completion, returning the answer's text. `stream: false` must be explicit: without it 9Router answers with
 * SSE. `model` defaults to the admin's text model (textModel()).
 */
export async function chatCompletion(messages: ChatMessage[], model?: string, signal?: AbortSignal): Promise<string> {
  const response = await post(
    '/chat/completions',
    { model: model ?? (await textModel()), messages, stream: false, max_tokens: MAX_TOKENS },
    REQUEST_TIMEOUT_MS,
    undefined,
    signal,
  )
  const body: unknown = await response.json().catch(() => null)
  signal?.throwIfAborted()
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
export async function generateImage({ prompt, size, images }: ImageRequest, model?: string, signal?: AbortSignal): Promise<string> {
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
    signal,
  )
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null)
    throw new RouterApiError(errorMessage(body, response.status), response.status)
  }
  const text = await response.text().catch(() => {
    signal?.throwIfAborted()
    throw new RouterApiError('Stream gambar dari 9Router terputus', 0)
  })
  signal?.throwIfAborted()
  return readImageStream(text)
}

/** A function the model may call, OpenAI-style. `parameters` is a JSON Schema object. */
export interface ToolSchema {
  type: 'function'
  function: { name: string; description: string; parameters: Json }
}

/** A call the model asked for. `arguments` is a JSON string, as 9Router passes it on (verified 2026-10-21). */
export interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface AssistantMessage {
  role: 'assistant'
  content: string | null
  tool_calls?: ToolCall[]
}

export interface ToolResultMessage {
  role: 'tool'
  tool_call_id: string
  content: string
}

/** A turn of a conversation with tools: ChatMessage plus the model's turns and the tools' answers. */
export type ConversationMessage = ChatMessage | AssistantMessage | ToolResultMessage

/** The model's turn: its text, and the calls it wants run before it answers (none once it is done). */
export interface ChatAnswer {
  content: string
  toolCalls: ToolCall[]
}

function readToolCalls(value: unknown): ToolCall[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((call): ToolCall[] => {
    if (!isObject(call) || typeof call.id !== 'string' || !isObject(call.function)) return []
    const { name, arguments: args } = call.function
    if (typeof name !== 'string' || name === '') return []
    return [{ id: call.id, type: 'function', function: { name, arguments: typeof args === 'string' ? args : '{}' } }]
  })
}

/** Reads a completion that may hold tool calls. Pure, for tests. */
export function readChatAnswer(body: unknown): ChatAnswer {
  const choice = isObject(body) && Array.isArray(body.choices) ? body.choices[0] : undefined
  const message = isObject(choice) && isObject(choice.message) ? choice.message : undefined
  const content = typeof message?.content === 'string' ? message.content : ''
  const toolCalls = readToolCalls(message?.tool_calls)
  if (content.trim() === '' && toolCalls.length === 0) throw new RouterApiError('Respons 9Router tanpa isi', 200)
  return { content, toolCalls }
}

/**
 * One turn of a conversation the model may answer with tool calls (OpenAI `tools`; verified through 9Router with
 * Claude Haiku 4.5 on 2026-10-21: `finish_reason: tool_calls`, then a `role: tool` message gets the final text).
 */
export async function chatWithTools(
  messages: ConversationMessage[],
  tools: ToolSchema[],
  model?: string,
  signal?: AbortSignal,
): Promise<ChatAnswer> {
  const response = await post(
    '/chat/completions',
    {
      model: model ?? (await textModel()),
      messages,
      ...(tools.length > 0 ? { tools } : {}),
      stream: false,
      max_tokens: MAX_TOKENS,
    },
    REQUEST_TIMEOUT_MS,
    undefined,
    signal,
  )
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) throw new RouterApiError(errorMessage(body, response.status), response.status)
  return readChatAnswer(body)
}

/** Grounded search took about 7 s for three results. */
const SEARCH_TIMEOUT_MS = 45_000
/** Each result's text is cut here, so a few results stay well under nginx's 1 MB once sent back to the model. */
const SEARCH_CONTENT_LENGTH = 1_500

export interface SearchResult {
  title: string
  url: string
  snippet: string
  publishedAt: string | null
}

/** Reads `{ results: [{ title, url, snippet, content, published_at }] }`. Pure, for tests. */
export function readSearchResults(body: unknown, max: number): SearchResult[] {
  const results = isObject(body) && Array.isArray(body.results) ? body.results : []
  return results
    .flatMap((item): SearchResult[] => {
      if (!isObject(item)) return []
      const title = typeof item.title === 'string' ? item.title.trim() : ''
      const givenUrl = typeof item.url === 'string' ? item.url : ''
      let url = ''
      try {
        const parsed = new URL(givenUrl)
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') url = givenUrl
      } catch {
        // Search results are untrusted; malformed and non-web links never become clickable cards.
      }
      const text = typeof item.content === 'string' && item.content.trim() ? item.content : item.snippet
      const snippet = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim().slice(0, SEARCH_CONTENT_LENGTH) : ''
      if ((!title && !snippet) || !url) return []
      return [{ title, url, snippet, publishedAt: typeof item.published_at === 'string' ? item.published_at : null }]
    })
    .slice(0, max)
}

/** A web search through 9Router (`POST /search`, the `ag` provider; verified 2026-10-21). */
export async function webSearch(query: string, maxResults: number, signal?: AbortSignal): Promise<SearchResult[]> {
  const response = await post(
    '/search',
    { model: 'ag', query, search_type: 'web', max_results: maxResults },
    SEARCH_TIMEOUT_MS,
    undefined,
    signal,
  )
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) throw new RouterApiError(errorMessage(body, response.status), response.status)
  return readSearchResults(body, maxResults)
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
