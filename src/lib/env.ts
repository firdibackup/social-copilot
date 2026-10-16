import 'server-only'
import { ConfigError } from './errors'

type ServerEnvKey =
  | 'INSTAGRAM_APP_ID'
  | 'INSTAGRAM_APP_SECRET'
  | 'INSTAGRAM_REDIRECT_URI'
  | 'NEXT_PUBLIC_SUPABASE_URL'
  | 'ROUTER_API_BASE_URL'
  | 'ROUTER_API_KEY'
  | 'ROUTER_MODEL'
  | 'SUPABASE_SERVICE_ROLE_KEY'
  | 'TOKEN_ENCRYPTION_KEY'

const DEFAULT_APP_URL = 'http://localhost:3000'

/** Reads a required server env var, failing with a readable message when it is empty. */
export function env(key: ServerEnvKey): string {
  const value = process.env[key]?.trim()
  if (!value) throw new ConfigError(`${key} belum diisi di .env.local`)
  return value
}

/** Absolute URL of the local settings page, where OAuth results are reported. */
export function settingsUrl(params: Record<string, string>): string {
  const url = new URL('/pengaturan', process.env.APP_URL || DEFAULT_APP_URL)
  url.search = new URLSearchParams(params).toString()
  return url.toString()
}
