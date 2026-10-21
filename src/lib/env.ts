import 'server-only'
import { ConfigError } from './errors'

type ServerEnvKey =
  | 'APIFY_TOKEN'
  | 'FACEBOOK_APP_ID'
  | 'FACEBOOK_APP_SECRET'
  | 'FACEBOOK_REDIRECT_URI'
  | 'INSTAGRAM_APP_ID'
  | 'INSTAGRAM_APP_SECRET'
  | 'INSTAGRAM_REDIRECT_URI'
  | 'INSTAGRAM_WEBHOOK_VERIFY_TOKEN'
  | 'MAYAR_API_KEY'
  | 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'
  | 'NEXT_PUBLIC_SUPABASE_URL'
  | 'ROUTER_API_BASE_URL'
  | 'ROUTER_API_KEY'
  | 'ROUTER_MODEL'
  | 'SUPABASE_SERVICE_ROLE_KEY'
  | 'THREADS_APP_ID'
  | 'THREADS_APP_SECRET'
  | 'THREADS_REDIRECT_URI'
  | 'TOKEN_ENCRYPTION_KEY'

const DEFAULT_APP_URL = 'http://localhost:3000'

/** Reads a required server env var, failing with a readable message when it is empty. */
export function env(key: ServerEnvKey): string {
  const value = process.env[key]?.trim()
  if (!value) throw new ConfigError(`${key} belum diisi di .env.local`)
  return value
}

/** Absolute URL of a page of the app. APP_URL must be the host users sign in on: session cookies belong to it. */
export function appUrl(path: string, params: Record<string, string> = {}): string {
  const url = new URL(path, process.env.APP_URL || DEFAULT_APP_URL)
  url.search = new URLSearchParams(params).toString()
  return url.toString()
}

/** The settings page, where OAuth results are reported. */
export function settingsUrl(params: Record<string, string>): string {
  return appUrl('/pengaturan', params)
}
