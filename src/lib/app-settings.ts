import 'server-only'
import type { SettingsInput } from './admin-options'
import { DEFAULT_PLAN, type Plan } from './billing-options'
import { env } from './env'
import { ConfigError, describeError } from './errors'
import { db, unwrap } from './supabase'

/** Verified on 2026-10-16. Overridable, since 9Router's image models change with its Codex version. */
export const DEFAULT_IMAGE_MODEL = 'cx/gpt-image-2.5'

/** Every AI request and credit check reads these, so they are kept this long per server process. */
const CACHE_MS = 30_000

export interface AppSettings {
  /** What an admin chose; null uses the default. */
  textModel: string | null
  imageModel: string | null
  plan: Plan
  updatedAt: Date | null
}

interface SettingsRow {
  text_model: string | null
  image_model: string | null
  plan_name: string | null
  plan_price_idr: number | null
  plan_days: number | null
  plan_credits: number | null
  updated_at: string
}

const DEFAULTS: AppSettings = { textModel: null, imageModel: null, plan: DEFAULT_PLAN, updatedAt: null }

let cached: { settings: AppSettings; at: number } | null = null

function fromRow(row: SettingsRow | null): AppSettings {
  if (!row) return DEFAULTS
  return {
    textModel: row.text_model,
    imageModel: row.image_model,
    plan: {
      name: row.plan_name ?? DEFAULT_PLAN.name,
      priceIdr: row.plan_price_idr ?? DEFAULT_PLAN.priceIdr,
      days: row.plan_days ?? DEFAULT_PLAN.days,
      credits: row.plan_credits ?? DEFAULT_PLAN.credits,
    },
    updatedAt: new Date(row.updated_at),
  }
}

/**
 * The admin's settings. When they can't be read (no migration yet, Supabase down), the defaults apply: the app keeps
 * working as it did before the admin page existed.
 */
export async function getAppSettings(now = Date.now()): Promise<AppSettings> {
  if (cached && now - cached.at < CACHE_MS) return cached.settings
  let settings = DEFAULTS
  try {
    const row = unwrap(await db().from('app_settings').select('*').maybeSingle()) as SettingsRow | null
    settings = fromRow(row)
  } catch (error) {
    if (!(error instanceof ConfigError)) console.error('[pengaturan-app] gagal dibaca, pakai default:', describeError(error))
  }
  cached = { settings, at: now }
  return settings
}

/** For tests, and after a save in this process. */
export function clearSettingsCache(): void {
  cached = null
}

export const defaultTextModel = () => env('ROUTER_MODEL')
export const defaultImageModel = () => process.env.ROUTER_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL

/** The chat model every text task uses. */
export async function textModel(): Promise<string> {
  return (await getAppSettings()).textModel ?? defaultTextModel()
}

/** The model AI slides are drawn with. */
export async function imageModel(): Promise<string> {
  return (await getAppSettings()).imageModel ?? defaultImageModel()
}

export async function getPlan(): Promise<Plan> {
  return (await getAppSettings()).plan
}

export async function saveAppSettings(adminId: string, input: SettingsInput): Promise<void> {
  unwrap(
    await db()
      .from('app_settings')
      .upsert({
        id: true,
        text_model: input.textModel,
        image_model: input.imageModel,
        plan_name: input.plan.name,
        plan_price_idr: input.plan.priceIdr,
        plan_days: input.plan.days,
        plan_credits: input.plan.credits,
        updated_at: new Date().toISOString(),
        updated_by: adminId,
      }),
  )
  clearSettingsCache()
}
