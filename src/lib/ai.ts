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
import { creditsUsed, getCurrentPeriod, type Period } from './billing'
import { PLAN, TASK_CREDITS } from './billing-options'
import { getBrandContext } from './brand'
import type { BrandContext } from './brand-options'
import { CAPTION_MAX_HASHTAGS, CAPTION_MAX_LENGTH, findHashtags } from './caption'
import { env } from './env'
import { ConfigError, describeError } from './errors'
import { formatShortDate } from './format'
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

/** Repeated last in the brief prompts: Haiku still invented "stok terbatas" with the rule only in the system prompt. */
const NO_INVENTED_CLAIMS = 'Jangan menambah klaim seperti stok terbatas, promo terbatas, atau kualitas premium.'

/** Owner text goes between triple quotes, apart from the instructions. */
export const quote = (text: string) => `"""\n${text}\n"""`

function photoFormat(count: number): string {
  if (count === 0) return 'belum ada foto'
  return count === 1 ? 'foto tunggal' : `carousel ${count} foto`
}

function describeBrief(brief: Brief, brand: BrandContext | null): string {
  const allowed = brand?.facts ? 'brief dan fakta brand di atas' : 'brief di atas'
  return [
    `Topik:\n${quote(brief.topic)}`,
    `Tujuan: ${GOALS[brief.goal]}`,
    `Nada: ${TONES[brief.tone]}`,
    `Audiens: ${brief.audience || brand?.audience || 'umum'}`,
    `Format post: ${photoFormat(brief.photoCount)}`,
    '',
    `Hanya pakai fakta dari ${allowed}. ${NO_INVENTED_CLAIMS}`,
  ].join('\n')
}

const BRAND_LINES: [keyof BrandContext, string][] = [
  ['name', 'Nama'],
  ['category', 'Kategori'],
  ['description', 'Deskripsi'],
  ['audience', 'Audiens utama'],
  ['voice', 'Gaya bahasa'],
  ['wordsUse', 'Kata atau frasa khas'],
  ['wordsAvoid', 'Hindari kata atau gaya ini'],
]

/** The brand kit as prompt text. Facts are owner text, so they are quoted. */
export function describeBrand(brand: BrandContext): string {
  const lines = BRAND_LINES.filter(([field]) => brand[field]).map(([field, label]) => `${label}: ${brand[field]}`)
  if (brand.facts) lines.push(`Fakta brand yang boleh dipakai:\n${quote(brand.facts)}`)
  return ['Tentang brand (ikuti gaya bahasanya; nada di brief menyesuaikan post ini):', ...lines, '', ''].join('\n')
}

function taskPrompt(request: AiRequest, brand: BrandContext | null): string {
  const about = brand ? describeBrand(brand) : ''
  switch (request.task) {
    case 'captions':
      return [
        `${about}Tugas: tulis 3 variasi caption dengan sudut pandang berbeda. ${CAPTION_SHAPE}`,
        'Format JSON: {"captions": ["…", "…", "…"]}',
        '',
        describeBrief(request.brief, brand),
      ].join('\n')
    case 'ideas':
      return [
        `${about}Tugas: beri 5 ide post Instagram yang berbeda-beda untuk topik di bawah. Setiap ide berupa satu kalimat yang cukup jelas untuk dijadikan topik caption.`,
        'Format JSON: {"ideas": ["…", "…", "…", "…", "…"]}',
        '',
        describeBrief(request.brief, brand),
      ].join('\n')
    case 'rewrite':
      return [
        `${about}Tugas: ${REWRITE_INSTRUCTIONS[request.style]} Pertahankan fakta, mention, dan hashtag yang ada.`,
        'Format JSON: {"caption": "…"}',
        '',
        `Caption:\n${quote(request.caption)}`,
      ].join('\n')
    case 'hashtags':
      return [
        `${about}Tugas: sarankan 10 hashtag relevan untuk caption di bawah, campuran hashtag populer dan spesifik. Jangan ulangi hashtag yang sudah ada di caption.`,
        'Format JSON: {"hashtags": ["#…"]}',
        '',
        `Caption:\n${quote(request.caption)}`,
      ].join('\n')
  }
}

type TextMessage = ChatMessage & { content: string }

/** `brand` is the saved brand kit's text, or null when it is empty. */
export function buildMessages(request: AiRequest, brand: BrandContext | null = null): TextMessage[] {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: taskPrompt(request, brand) },
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

export function snippetOf(content: string): string {
  const flat = content.replace(/\s+/g, ' ').trim()
  return lengthOf(flat) > SNIPPET_LENGTH ? `${truncate(flat, SNIPPET_LENGTH)}…` : flat
}

/** Takes the outermost `{…}`, so ```json fences or a sentence around the object don't matter. */
export function readJson(content: string): Json | null {
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

/** No paid period covers now, or its credits are spent. The message is safe to show to the user. */
export class AiLimitError extends Error {
  override name = 'AiLimitError'
}

/** Every kind of 9Router request; each costs TASK_CREDITS of the period's PLAN.credits. */
export type LoggedTask = AiRequest['task'] | 'brand_profile' | 'brand_visual' | 'image' | 'image_plan'

interface GenerationLog {
  user_id: string
  task: LoggedTask
  credits: number
  /** Never image data: it would bloat the table. */
  input: unknown
  output: unknown
  model: string
  status: 'ok' | 'failed'
  error: string | null
  duration_ms: number
}

export interface Credits {
  remaining: number
  period: Period
}

/** Credits left in the user's current period. A count that can't be read throws, so AI stops rather than runs free. */
export async function remainingCredits(userId: string): Promise<Credits> {
  const period = await getCurrentPeriod(userId)
  if (!period) throw new AiLimitError('Langganan tidak aktif. Aktifkan di menu Langganan untuk memakai AI.')
  return { remaining: Math.max(0, PLAN.credits - (await creditsUsed(userId, period.start))), period }
}

export const quotaSpentMessage = (period: Period) =>
  `Kuota AI periode ini habis. Kuota baru mulai ${formatShortDate(period.end)}, atau perpanjang di menu Langganan.`

async function logGeneration(row: GenerationLog): Promise<void> {
  try {
    unwrap(await db().from('ai_generations').insert(row))
  } catch (error) {
    // The owner still gets the answer; only the usage log misses a row.
    console.error('[ai] gagal mencatat permintaan:', describeError(error))
  }
}

interface LogOptions<T> {
  /** Defaults to ROUTER_MODEL. */
  model?: string
  /** What the log keeps of the result; an image would bloat the table. */
  logOutput?: (result: T) => unknown
}

/**
 * Checks the user's credits, runs `ask`, and logs the request with its result (the output) and its cost whatever
 * the outcome. A failed request costs nothing.
 * ponytail: two requests at once can both pass the check and overspend by one request; lock per user if it matters.
 */
export async function runLogged<T>(
  userId: string,
  task: LoggedTask,
  input: unknown,
  ask: () => Promise<T>,
  options: LogOptions<T> = {},
): Promise<T> {
  const model = options.model ?? env('ROUTER_MODEL')
  const cost = TASK_CREDITS[task]
  const { remaining, period } = await remainingCredits(userId)
  if (cost > remaining) throw new AiLimitError(quotaSpentMessage(period))

  const startedAt = Date.now()
  const log = (result: Pick<GenerationLog, 'output' | 'status' | 'error' | 'credits'>) =>
    logGeneration({ user_id: userId, task, input, model, duration_ms: Date.now() - startedAt, ...result })

  try {
    const result = await ask()
    const output = options.logOutput ? options.logOutput(result) : result
    await log({ output, status: 'ok', error: null, credits: cost })
    return result
  } catch (error) {
    await log({ output: null, status: 'failed', error: describeError(error), credits: 0 })
    throw error
  }
}

/** Captions still work when the brand kit can't be read; they are just not on-brand. */
async function loadBrandContext(userId: string): Promise<BrandContext | null> {
  try {
    return await getBrandContext(userId)
  } catch (error) {
    console.error('[ai] brand kit gagal dimuat, lanjut tanpa brand:', describeError(error))
    return null
  }
}

/** Asks the model for the editor's options, with the brand kit in the prompt. */
export async function runAiTask(userId: string, request: AiRequest): Promise<string[]> {
  return runLogged(userId, request.task, request, async () => {
    const brand = await loadBrandContext(userId)
    return parseOptions(request, await chatCompletion(buildMessages(request, brand)))
  })
}

function routerErrorMessage(status: number): string {
  if (status === 0) return 'Layanan AI tidak bisa dihubungi atau terlalu lama menjawab. Coba lagi.'
  if (status === 200) return 'Jawaban AI kosong. Coba lagi, atau ganti ROUTER_MODEL kalau terus terjadi.'
  if (status === 401 || status === 403) return 'API key 9Router ditolak. Periksa ROUTER_API_KEY di .env.local.'
  if (status === 404) return 'Model AI tidak ditemukan. Periksa ROUTER_MODEL di .env.local.'
  // nginx in front of 9Router answers this above client_max_body_size (1 MB by default).
  if (status === 413) return 'Permintaan ke 9Router terlalu besar. Kurangi atau perkecil gambar referensi.'
  if (status === 429) return 'Kuota AI sedang habis. Coba lagi beberapa menit lagi.'
  if (status >= 500) return 'Layanan AI sedang bermasalah. Coba lagi nanti.'
  return `Permintaan ditolak layanan AI (HTTP ${status}). Periksa ROUTER_MODEL di .env.local.`
}

/** Owner-facing text for anything runAiTask throws. Provider details stay in the server log. */
export function aiErrorMessage(error: unknown): string {
  if (error instanceof ConfigError) return `Konfigurasi AI belum lengkap: ${error.message}.`
  if (error instanceof AiLimitError) return error.message
  if (error instanceof AiOutputError) {
    return `Jawaban AI tidak bisa dibaca ("${error.snippet}"). Coba lagi, atau ganti ROUTER_MODEL kalau terus terjadi.`
  }
  if (error instanceof RouterApiError) return routerErrorMessage(error.status)
  return 'AI gagal dijalankan: database tidak bisa diakses. Periksa Supabase dan migrasi terbaru.'
}
