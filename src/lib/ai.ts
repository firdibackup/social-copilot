import 'server-only'
import { getPlan, textModel } from './app-settings'
import { creditsUsed, getCurrentPeriod, type Period } from './billing'
import { getBillingCatalog } from './billing-catalog'
import { getAccountBrandContext, getBrandContext } from './brand'
import { lengthOf, truncate, type BrandContext } from './brand-options'
import { ConfigError, describeError } from './errors'
import { formatShortDate } from './format'
import { RouterApiError } from './nine-router'
import { describeStrategy } from './strategy-options'
import { db, unwrap } from './supabase'

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null

const SNIPPET_LENGTH = 120

/** Owner text goes between triple quotes, apart from the instructions. */
export const quote = (text: string) => `"""\n${text}\n"""`

const BRAND_LINES: [keyof BrandContext, string][] = [
  ['name', 'Nama'],
  ['category', 'Kategori'],
  ['description', 'Deskripsi'],
  ['audience', 'Audiens utama'],
  ['voice', 'Gaya bahasa'],
  ['wordsUse', 'Kata atau frasa khas'],
  ['wordsAvoid', 'Hindari kata atau gaya ini'],
]

/** The brand kit as prompt text, with its content strategy. Facts are owner text, so they are quoted. */
export function describeBrand(brand: BrandContext): string {
  const lines = BRAND_LINES.filter(([field]) => brand[field]).map(([field, label]) => `${label}: ${brand[field]}`)
  if (brand.facts) lines.push(`Fakta brand yang boleh dipakai:\n${quote(brand.facts)}`)
  const strategy = brand.strategy ? ['', describeStrategy(brand.strategy)] : []
  return ['Tentang brand (ikuti gaya bahasanya):', ...lines, ...strategy, '', ''].join('\n')
}

/** The model answered, but not with the JSON asked for. `snippet` is the start of its answer. */
export class AiOutputError extends Error {
  override name = 'AiOutputError'

  constructor(readonly snippet: string) {
    super(`Jawaban AI tidak bisa dibaca: ${snippet}`)
  }
}

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
export function cleanList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return []
  const items = value.filter((item): item is string => typeof item === 'string').map((item) => item.trim())
  return [...new Set(items.filter(Boolean))].slice(0, max)
}

/** No paid period covers now, or its credits are spent. The message is safe to show to the user. */
export class AiLimitError extends Error {
  override name = 'AiLimitError'
}

/** Every kind of 9Router request; each costs TASK_CREDITS of the period's plan credits (getPlan()). */
export type LoggedTask =
  | 'content'
  | 'content_slide'
  | 'slide_edit'
  | 'caption_edit'
  /** Write a new Threads chain from the owner's topic. */
  | 'threads_write'
  /** Rewrite a Threads chain or one post in it. */
  | 'threads_edit'
  | 'content_ideas'
  | 'content_script'
  | 'brand_profile'
  | 'brand_visual'
  | 'brand_strategy'
  | 'website_catalog'
  | 'asset_tags'
  | 'reply_draft'
  | 'template_analysis'
  /** Brand › Referensi: the label and layout of designs cut from a grid picture, one batch per request. */
  | 'reference_labels'
  /** One message to Mimo, the chat, however many tools it ran. */
  | 'chat'
  /** One Intel Kompetitor run (Apify) inside a Mimo message. */
  | 'deep_search'
  /** The rolling summary of a Mimo conversation, written after the answer. */
  | 'chat_summary'

interface GenerationLog {
  reservation_id?: string | null
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
  if (!period) throw new AiLimitError('Langganan tidak aktif. Aktifkan di halaman Langganan untuk memakai AI.')
  const [plan, used] = await Promise.all([period.plan ?? getPlan(), creditsUsed(userId, period.start)])
  return { remaining: Math.max(0, plan.credits - used), period }
}

export const quotaSpentMessage = (period: Period) =>
  `Kuota AI periode ini tidak cukup. Kuota baru mulai ${formatShortDate(period.end)}, atau perpanjang di halaman Langganan.`

async function logGeneration(row: GenerationLog): Promise<void> {
  try {
    unwrap(await db().from('ai_generations').insert(row))
  } catch (error) {
    // The owner still gets the answer; only the usage log misses a row.
    console.error('[ai] gagal mencatat permintaan:', describeError(error))
  }
}

interface LogOptions<T> {
  /** Defaults to the admin's text model (textModel()). */
  model?: string
  /** What the log keeps of the result; an image would bloat the table. */
  logOutput?: (result: T) => unknown
  /** Defaults to TASK_CREDITS[task]; a new post's cost depends on its slides (contentCost). */
  cost?: number
  /** Image/photo count for a price calculated from the current tariff. */
  units?: number
  /** An admin's own request: no subscription or credits needed, and it costs nothing. */
  unmetered?: boolean
}

/**
 * Locks the tariff at request start, reserves credits, and logs the result.
 * `ask` includes the writes that make the result usable; failure releases its reservation.
 * Reserve atomically before starting; the reservation is the authoritative charge even if audit logging fails.
 */
export async function runLogged<T>(
  userId: string,
  task: LoggedTask,
  input: unknown,
  ask: () => Promise<T>,
  options: LogOptions<T> = {},
): Promise<T> {
  const model = options.model ?? (await textModel())
  const rates = options.unmetered ? null : (await getBillingCatalog()).catalog.rates
  const cost = options.unmetered ? 0 : (options.cost ?? (task === 'content' && options.units !== undefined
    ? rates!.content + options.units * rates!.image
    : rates![task] * (options.units ?? 1)))
  if (!Number.isSafeInteger(cost) || cost < 0) throw new Error('Biaya kredit tidak valid.')
  let reservation: string | null = null
  if (!options.unmetered) {
    const { remaining, period } = await remainingCredits(userId)
    if (cost > remaining) throw new AiLimitError(quotaSpentMessage(period))
    if (cost > 0) {
      const plan = period.plan ?? await getPlan()
      reservation = unwrap(await db().rpc('reserve_ai_credits', {
        p_user: userId, p_since: period.start.toISOString(), p_until: period.end.toISOString(), p_allowance: plan.credits, p_cost: cost,
      })) as string | null
      if (!reservation) throw new AiLimitError(quotaSpentMessage(period))
    }
  }

  const startedAt = Date.now()
  const log = (result: Pick<GenerationLog, 'output' | 'status' | 'error' | 'credits'>) =>
    logGeneration({ user_id: userId, reservation_id: reservation, task, input, model, duration_ms: Date.now() - startedAt, ...result })

  let result: T
  try {
    result = await ask()
  } catch (error) {
    if (reservation) unwrap(await db().rpc('settle_ai_credits', { p_id: reservation, p_user: userId, p_success: false }))
    await log({ output: null, status: 'failed', error: describeError(error), credits: 0 })
    throw error
  }
  if (reservation) unwrap(await db().rpc('settle_ai_credits', { p_id: reservation, p_user: userId, p_success: true }))
  const output = options.logOutput ? options.logOutput(result) : result
  await log({ output, status: 'ok', error: null, credits: cost })
  return result
}

/** The brand kit's text for a prompt. One that fails to load leaves the content unbranded instead of failing it. */
export async function loadBrandContext(userId: string): Promise<BrandContext | null> {
  try {
    return await getBrandContext(userId)
  } catch (error) {
    console.error('[ai] brand kit gagal dimuat, lanjut tanpa brand:', describeError(error))
    return null
  }
}

/** Account-pinned form for requests that may outlive a connection switch. */
export async function loadAccountBrandContext(userId: string, accountId: string): Promise<BrandContext | null> {
  try {
    return await getAccountBrandContext(userId, accountId)
  } catch (error) {
    console.error('[ai] brand kit akun gagal dimuat, lanjut tanpa brand:', describeError(error))
    return null
  }
}

function routerErrorMessage(status: number): string {
  if (status === 0) return 'Layanan AI tidak bisa dihubungi atau terlalu lama menjawab. Coba lagi.'
  if (status === 200) return 'Jawaban AI kosong. Coba lagi, atau ganti model AI di Admin › Pengaturan kalau terus terjadi.'
  if (status === 401 || status === 403) return 'API key 9Router ditolak. Periksa ROUTER_API_KEY di .env.local.'
  if (status === 404) return 'Model AI tidak ditemukan. Periksa model AI di Admin › Pengaturan.'
  // nginx in front of 9Router answers this above client_max_body_size (1 MB by default).
  if (status === 413) return 'Permintaan ke 9Router terlalu besar. Kurangi atau perkecil gambar referensi.'
  if (status === 429) return 'Kuota AI sedang habis. Coba lagi beberapa menit lagi.'
  if (status >= 500) return 'Layanan AI sedang bermasalah. Coba lagi nanti.'
  return `Permintaan ditolak layanan AI (HTTP ${status}). Periksa model AI di Admin › Pengaturan.`
}

/** Owner-facing text for anything a text AI request throws. Provider details stay in the server log. */
export function aiErrorMessage(error: unknown): string {
  if (error instanceof ConfigError) return `Konfigurasi AI belum lengkap: ${error.message}.`
  if (error instanceof AiLimitError) return error.message
  if (error instanceof AiOutputError) {
    return `Jawaban AI tidak bisa dibaca ("${error.snippet}"). Coba lagi, atau ganti model AI di Admin › Pengaturan kalau terus terjadi.`
  }
  if (error instanceof RouterApiError) return routerErrorMessage(error.status)
  return 'AI gagal dijalankan: database tidak bisa diakses. Periksa Supabase dan migrasi terbaru.'
}
