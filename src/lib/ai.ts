import 'server-only'
import {
  AUDIENCE_MAX_LENGTH,
  GOALS,
  REWRITE_STYLES,
  TONES,
  TOPIC_MAX_LENGTH,
  type AiRequest,
  type Brief,
  type RewriteStyle,
} from './ai-options'
import { CAPTION_MAX_HASHTAGS, CAPTION_MAX_LENGTH, findHashtags } from './caption'
import { env } from './env'
import { ConfigError, describeError } from './errors'
import { chatCompletion, RouterApiError, type ChatMessage } from './nine-router'
import { db, unwrap } from './supabase'

const MAX_PHOTOS = 10

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null
/** Own keys only: `'toString' in GOALS` is true. */
const isChoice = <T extends object>(choices: T, value: unknown): value is keyof T =>
  typeof value === 'string' && Object.hasOwn(choices, value)
/** Code points, as Instagram, the editor counter and Postgres count them. */
const lengthOf = (text: string) => Array.from(text).length

export type ParsedRequest = { request: AiRequest } | { error: string }

function parseBrief(input: unknown): Brief | string {
  if (!isObject(input)) return 'Permintaan tidak valid.'
  const topic = typeof input.topic === 'string' ? input.topic.trim() : ''
  const audience = typeof input.audience === 'string' ? input.audience.trim() : ''
  const { goal, tone, photoCount } = input

  if (!topic) return 'Isi topik dulu.'
  if (lengthOf(topic) > TOPIC_MAX_LENGTH) return `Topik maksimal ${TOPIC_MAX_LENGTH} karakter.`
  if (lengthOf(audience) > AUDIENCE_MAX_LENGTH) return `Audiens maksimal ${AUDIENCE_MAX_LENGTH} karakter.`
  if (!isChoice(GOALS, goal) || !isChoice(TONES, tone)) return 'Tujuan atau nada tidak dikenal.'
  if (typeof photoCount !== 'number' || !Number.isInteger(photoCount) || photoCount < 0 || photoCount > MAX_PHOTOS) {
    return 'Jumlah foto tidak valid.'
  }
  return { topic, goal, tone, audience, photoCount }
}

/** Validates what the editor sent. The server action's parameter type is only a hint. */
export function parseAiRequest(input: unknown): ParsedRequest {
  if (!isObject(input)) return { error: 'Permintaan tidak valid.' }
  const { task } = input
  if (task === 'captions' || task === 'ideas') {
    const brief = parseBrief(input.brief)
    return typeof brief === 'string' ? { error: brief } : { request: { task, brief } }
  }
  if (task !== 'rewrite' && task !== 'hashtags') return { error: 'Permintaan tidak valid.' }

  // Textareas submit CRLF; count newlines once, as the editor and Instagram do.
  const caption = typeof input.caption === 'string' ? input.caption.replace(/\r\n/g, '\n') : ''
  if (!caption.trim()) return { error: 'Tulis caption dulu.' }
  if (lengthOf(caption) > CAPTION_MAX_LENGTH) return { error: 'Caption lebih dari 2.200 karakter.' }
  if (task === 'hashtags') {
    return findHashtags(caption).length >= CAPTION_MAX_HASHTAGS
      ? { error: 'Caption sudah memakai 30 hashtag.' }
      : { request: { task, caption } }
  }
  return isChoice(REWRITE_STYLES, input.style)
    ? { request: { task, style: input.style, caption } }
    : { error: 'Gaya ubah caption tidak dikenal.' }
}

const SYSTEM_PROMPT = [
  'Kamu penulis caption Instagram untuk satu akun bisnis atau kreator di Indonesia.',
  'Aturan:',
  '- Tulis dalam Bahasa Indonesia yang natural, kecuali brief jelas memakai bahasa lain.',
  '- Patuhi batas Instagram: caption maksimal 2.200 karakter, 30 hashtag, dan 20 mention.',
  '- Jangan pakai Markdown seperti **tebal**, _miring_, atau judul. Instagram tidak merendernya.',
  '- Jangan mengarang fakta atau klaim yang tidak ada di brief, misalnya harga, tanggal, lokasi, stok terbatas, atau "kualitas premium".',
  '- Balas HANYA dengan satu objek JSON sesuai format yang diminta, tanpa teks lain.',
].join('\n')

const CAPTION_SHAPE =
  'Setiap caption terdiri dari 2–4 paragraf pendek, sekitar 300–700 karakter sebelum hashtag: kalimat pembuka yang menarik, isi, lalu ajakan bertindak (CTA) yang sesuai tujuan. Tutup dengan 3–8 hashtag relevan di baris terakhir.'

const REWRITE_INSTRUCTIONS: Record<RewriteStyle, string> = {
  santai: 'Tulis ulang caption dengan nada lebih santai dan akrab.',
  profesional: 'Tulis ulang caption dengan nada lebih profesional dan rapi.',
  singkat: 'Tulis ulang caption supaya lebih singkat, kira-kira setengah panjangnya.',
  panjang: 'Tulis ulang caption supaya lebih panjang dan lebih rinci, tanpa menambah fakta baru.',
  cta: 'Tambahkan satu ajakan bertindak (CTA) yang jelas di akhir isi caption, sebelum hashtag. Jangan ubah bagian lain.',
}

/** Owner text goes between triple quotes, apart from the instructions. */
const quote = (text: string) => `"""\n${text}\n"""`

function photoFormat(count: number): string {
  if (count === 0) return 'belum ada foto'
  return count === 1 ? 'foto tunggal' : `carousel ${count} foto`
}

function describeBrief(brief: Brief): string {
  return [
    `Topik:\n${quote(brief.topic)}`,
    `Tujuan: ${GOALS[brief.goal]}`,
    `Nada: ${TONES[brief.tone]}`,
    `Audiens: ${brief.audience || 'umum'}`,
    `Format post: ${photoFormat(brief.photoCount)}`,
  ].join('\n')
}

function taskPrompt(request: AiRequest): string {
  switch (request.task) {
    case 'captions':
      return [
        `Tugas: tulis 3 variasi caption dengan sudut pandang berbeda. ${CAPTION_SHAPE}`,
        'Format JSON: {"captions": ["…", "…", "…"]}',
        '',
        describeBrief(request.brief),
      ].join('\n')
    case 'ideas':
      return [
        'Tugas: beri 5 ide post Instagram yang berbeda-beda untuk topik di bawah. Setiap ide berupa satu kalimat yang cukup jelas untuk dijadikan topik caption.',
        'Format JSON: {"ideas": ["…", "…", "…", "…", "…"]}',
        '',
        describeBrief(request.brief),
      ].join('\n')
    case 'rewrite':
      return [
        `Tugas: ${REWRITE_INSTRUCTIONS[request.style]} Pertahankan fakta, mention, dan hashtag yang ada.`,
        'Format JSON: {"caption": "…"}',
        '',
        `Caption:\n${quote(request.caption)}`,
      ].join('\n')
    case 'hashtags':
      return [
        'Tugas: sarankan 10 hashtag relevan untuk caption di bawah, campuran hashtag populer dan spesifik. Jangan ulangi hashtag yang sudah ada di caption.',
        'Format JSON: {"hashtags": ["#…"]}',
        '',
        `Caption:\n${quote(request.caption)}`,
      ].join('\n')
  }
}

export function buildMessages(request: AiRequest): ChatMessage[] {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: taskPrompt(request) },
  ]
}

const MAX_CAPTIONS = 3
const MAX_IDEAS = 5
const MAX_NEW_HASHTAGS = 10
const SNIPPET_LENGTH = 120

/** The model answered, but not with the JSON asked for. `snippet` is the start of its answer. */
export class AiOutputError extends Error {
  override name = 'AiOutputError'

  constructor(readonly snippet: string) {
    super(`Jawaban AI tidak bisa dibaca: ${snippet}`)
  }
}

const truncate = (text: string, max: number) => Array.from(text).slice(0, max).join('')

function snippetOf(content: string): string {
  const flat = content.replace(/\s+/g, ' ').trim()
  return lengthOf(flat) > SNIPPET_LENGTH ? `${truncate(flat, SNIPPET_LENGTH)}…` : flat
}

/** Takes the outermost `{…}`, so ```json fences or a sentence around the object don't matter. */
function readJson(content: string): Json | null {
  const start = content.indexOf('{')
  const end = content.lastIndexOf('}')
  if (start === -1 || end < start) return null
  try {
    const value: unknown = JSON.parse(content.slice(start, end + 1))
    return isObject(value) ? value : null
  } catch {
    return null
  }
}

/** Trimmed, non-empty, distinct strings, at most `max` of them. */
function cleanList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return []
  const items = value.filter((item): item is string => typeof item === 'string').map((item) => item.trim())
  return [...new Set(items.filter(Boolean))].slice(0, max)
}

/** New tags only, normalized to `#word`, and no more than the caption has room for. */
function newHashtags(caption: string, suggested: unknown): string[] {
  const used = findHashtags(caption)
  const seen = new Set(used.map((tag) => tag.toLowerCase()))
  const room = Math.max(0, Math.min(MAX_NEW_HASHTAGS, CAPTION_MAX_HASHTAGS - used.length))
  const tags: string[] = []
  for (const text of cleanList(suggested, Number.POSITIVE_INFINITY)) {
    const tag = `#${text.replace(/[^\p{L}\p{N}_]/gu, '')}`
    if (tag === '#' || seen.has(tag.toLowerCase())) continue
    seen.add(tag.toLowerCase())
    tags.push(tag)
  }
  return tags.slice(0, room)
}

function optionsFrom(request: AiRequest, json: Json): string[] {
  switch (request.task) {
    case 'captions':
      return cleanList(json.captions, MAX_CAPTIONS)
    case 'ideas':
      // An idea becomes the topic field, so it must fit there.
      return cleanList(json.ideas, MAX_IDEAS).map((idea) => truncate(idea, TOPIC_MAX_LENGTH))
    case 'rewrite':
      return cleanList([json.caption], 1)
    case 'hashtags': {
      const tags = newHashtags(request.caption, json.hashtags)
      return tags.length > 0 ? [tags.join(' ')] : []
    }
  }
}

/** The options to show the owner. A 200 can carry a provider notice instead of JSON, so only parsed JSON counts. */
export function parseOptions(request: AiRequest, content: string): string[] {
  const json = readJson(content)
  const options = json ? optionsFrom(request, json) : []
  if (options.length === 0) throw new AiOutputError(snippetOf(content))
  return options
}

/** Requests per rolling 24 hours. 9Router's providers run on the owner's own subscriptions. */
export const DAILY_LIMIT = 100
const DAY_MS = 24 * 60 * 60 * 1000

/** The owner reached DAILY_LIMIT. */
export class AiLimitError extends Error {
  override name = 'AiLimitError'
}

interface GenerationLog {
  task: AiRequest['task']
  input: AiRequest
  output: string[] | null
  model: string
  status: 'ok' | 'failed'
  error: string | null
  duration_ms: number
}

async function countRecentRequests(): Promise<number> {
  const since = new Date(Date.now() - DAY_MS).toISOString()
  const { count, error } = await db()
    .from('ai_generations')
    .select('id', { count: 'exact', head: true })
    .gt('created_at', since)
  if (error) throw new Error(`Supabase: ${error.message}`)
  return count ?? 0
}

async function logGeneration(row: GenerationLog): Promise<void> {
  try {
    unwrap(await db().from('ai_generations').insert(row))
  } catch (error) {
    // The owner still gets the answer; only the usage log misses a row.
    console.error('[ai] gagal mencatat permintaan:', describeError(error))
  }
}

/** Checks the daily limit, asks the model, and logs the request whatever its outcome. */
export async function runAiTask(request: AiRequest): Promise<string[]> {
  const model = env('ROUTER_MODEL')
  if ((await countRecentRequests()) >= DAILY_LIMIT) {
    throw new AiLimitError(`Batas ${DAILY_LIMIT} permintaan per 24 jam tercapai`)
  }

  const startedAt = Date.now()
  const log = (result: Pick<GenerationLog, 'output' | 'status' | 'error'>) =>
    logGeneration({ task: request.task, input: request, model, duration_ms: Date.now() - startedAt, ...result })

  try {
    const options = parseOptions(request, await chatCompletion(buildMessages(request)))
    await log({ output: options, status: 'ok', error: null })
    return options
  } catch (error) {
    await log({ output: null, status: 'failed', error: describeError(error) })
    throw error
  }
}

function routerErrorMessage(status: number): string {
  if (status === 0) return 'Layanan AI tidak bisa dihubungi atau terlalu lama menjawab. Coba lagi.'
  if (status === 200) return 'Jawaban AI kosong. Coba lagi, atau ganti ROUTER_MODEL kalau terus terjadi.'
  if (status === 401 || status === 403) return 'API key 9Router ditolak. Periksa ROUTER_API_KEY di .env.local.'
  if (status === 404) return 'Model AI tidak ditemukan. Periksa ROUTER_MODEL di .env.local.'
  if (status === 429) return 'Kuota AI sedang habis. Coba lagi beberapa menit lagi.'
  if (status >= 500) return 'Layanan AI sedang bermasalah. Coba lagi nanti.'
  return `Permintaan ditolak layanan AI (HTTP ${status}). Periksa ROUTER_MODEL di .env.local.`
}

/** Owner-facing text for anything runAiTask throws. Provider details stay in the server log. */
export function aiErrorMessage(error: unknown): string {
  if (error instanceof ConfigError) return `Konfigurasi AI belum lengkap: ${error.message}.`
  if (error instanceof AiLimitError) return `Batas ${DAILY_LIMIT} permintaan AI per 24 jam sudah tercapai. Coba lagi nanti.`
  if (error instanceof AiOutputError) {
    return `Jawaban AI tidak bisa dibaca ("${error.snippet}"). Coba lagi, atau ganti ROUTER_MODEL kalau terus terjadi.`
  }
  if (error instanceof RouterApiError) return routerErrorMessage(error.status)
  return 'AI gagal dijalankan: database tidak bisa diakses. Periksa Supabase dan migrasi terbaru.'
}
